"""
AUDIRA-LAND: impor kit Polyfork (https://polyfork.dev) ke web/public/models/polyfork/.

Alur per model:
  1. Unduh GLB asli dari CDN Polyfork -> blender/exports/polyfork/raw/<id>.glb (cache, tidak diunduh ulang).
  2. Gabungkan semua mesh + transform node menjadi SATU mesh (pembaca GLB mini AUDIRA-LAND hanya
     membaca meshes[0].primitives[0]). baseColorFactor material dikalikan ke COLOR_0.
  3. Normalisasi: titik nol di tengah dasar (pusat bbox X/Z = 0, dasar y = 0), depan tetap +Z.
  4. Tulis web/public/models/polyfork/<id>.glb + manifest.json + docs/CREDITS_POLYFORK.md.

Lisensi: mesh gratis Polyfork = CC BY 4.0. Karena file di-host sendiri dan dimodifikasi, setiap
model WAJIB punya baris kredit (ditulis otomatis ke CREDITS_POLYFORK.md dan manifest.json).
Jangan pernah menyalin .mjs atau edisi HD ke proyek (bukan CC BY).

Pakai:
  python tools/polyfork_import.py cozy-farm-cc979f [--max-tris 3500] [--only id1,id2]
  python tools/polyfork_import.py kit-a,kit-b           (beberapa kit sekaligus)
  python tools/polyfork_import.py all --download-only   (unduh seluruh katalog ke pustaka lokal raw/,
                                                         tanpa konversi ke web; aman diulang/dilanjutkan)
"""
import argparse
import json
import struct
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent          # AUDIRA-LAND/
RAW_DIR = ROOT / 'blender' / 'exports' / 'polyfork' / 'raw'
OUT_DIR = ROOT / 'web' / 'public' / 'models' / 'polyfork'
CREDITS = ROOT / 'docs' / 'CREDITS_POLYFORK.md'
CATALOG_URL = 'https://raw.githubusercontent.com/lucas-martinic/polyfork-catalog/main/catalog.json'
UA = 'AUDIRA-LAND-asset-import/1.0'

COMP = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NSIZE = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
NORM_DIV = {5120: 127.0, 5121: 255.0, 5122: 32767.0, 5123: 65535.0}


def http_get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(5 * (attempt + 1))
                continue
            raise
    raise RuntimeError(f'429 terus-menerus: {url}')


def read_glb(data):
    magic, _, _ = struct.unpack_from('<III', data, 0)
    if magic != 0x46546C67:
        raise ValueError('bukan GLB')
    jlen, _ = struct.unpack_from('<II', data, 12)
    gltf = json.loads(data[20:20 + jlen])
    off = 20 + jlen
    bin_chunk = b''
    if off < len(data):
        blen, _ = struct.unpack_from('<II', data, off)
        bin_chunk = data[off + 8:off + 8 + blen]
    return gltf, bin_chunk


def accessor(gltf, binc, idx):
    acc = gltf['accessors'][idx]
    n = NSIZE[acc['type']]
    dt = np.dtype(COMP[acc['componentType']])
    count = acc['count']
    if 'bufferView' not in acc:
        arr = np.zeros((count, n), dtype=dt)
    else:
        view = gltf['bufferViews'][acc['bufferView']]
        base = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
        stride = view.get('byteStride', 0) or n * dt.itemsize
        raw = np.frombuffer(binc, dtype=np.uint8, count=stride * (count - 1) + n * dt.itemsize, offset=base)
        rows = np.lib.stride_tricks.as_strided(raw, shape=(count, n * dt.itemsize), strides=(stride, 1))
        arr = np.ascontiguousarray(rows).view(dt).reshape(count, n)
    if acc.get('sparse'):
        raise ValueError('sparse accessor tidak didukung')
    out = arr.astype(np.float64)
    if acc.get('normalized') and acc['componentType'] in NORM_DIV:
        out /= NORM_DIV[acc['componentType']]
    return out


def node_matrix(node):
    if 'matrix' in node:
        return np.array(node['matrix'], dtype=np.float64).reshape(4, 4).T
    t = np.array(node.get('translation', [0, 0, 0]), dtype=np.float64)
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    s = np.array(node.get('scale', [1, 1, 1]), dtype=np.float64)
    r = np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])
    m = np.eye(4)
    m[:3, :3] = r * s
    m[:3, 3] = t
    return m


def merge(gltf, binc):
    """Semua primitive segitiga -> satu array posisi/normal/warna/indeks dalam ruang dunia."""
    P, N, C, I = [], [], [], []
    base = 0
    mats = gltf.get('materials', [])

    def visit(ni, parent):
        nonlocal base
        node = gltf['nodes'][ni]
        world = parent @ node_matrix(node)
        if 'mesh' in node:
            nm = np.linalg.inv(world[:3, :3]).T
            flip = np.linalg.det(world[:3, :3]) < 0
            for prim in gltf['meshes'][node['mesh']]['primitives']:
                if prim.get('mode', 4) != 4:
                    continue
                at = prim['attributes']
                pos = accessor(gltf, binc, at['POSITION'])
                cnt = len(pos)
                pos_w = pos @ world[:3, :3].T + world[:3, 3]
                if 'NORMAL' in at:
                    nor = accessor(gltf, binc, at['NORMAL']) @ nm.T
                    nor /= np.maximum(np.linalg.norm(nor, axis=1, keepdims=True), 1e-9)
                else:
                    nor = None
                factor = [1.0, 1.0, 1.0, 1.0]
                if 'material' in prim and prim['material'] < len(mats):
                    factor = mats[prim['material']].get('pbrMetallicRoughness', {}).get('baseColorFactor', factor)
                if 'COLOR_0' in at:
                    col = accessor(gltf, binc, at['COLOR_0'])[:, :3] * np.array(factor[:3])
                else:
                    col = np.tile(np.array(factor[:3]), (cnt, 1))
                if 'indices' in prim:
                    idx = accessor(gltf, binc, prim['indices']).astype(np.int64).reshape(-1)
                else:
                    idx = np.arange(cnt, dtype=np.int64)
                tri = idx.reshape(-1, 3)
                if flip:
                    tri = tri[:, [0, 2, 1]]
                if nor is None:
                    nor = vertex_normals(pos_w, tri)
                P.append(pos_w); N.append(nor); C.append(col); I.append(tri + base)
                base += cnt
        for c in node.get('children', []):
            visit(c, world)

    scene = gltf['scenes'][gltf.get('scene', 0)]
    for ni in scene['nodes']:
        visit(ni, np.eye(4))
    if not P:
        raise ValueError('tidak ada mesh segitiga')
    return np.vstack(P), np.vstack(N), np.vstack(C), np.vstack(I)


def vertex_normals(pos, tri):
    n = np.zeros_like(pos)
    fn = np.cross(pos[tri[:, 1]] - pos[tri[:, 0]], pos[tri[:, 2]] - pos[tri[:, 0]])
    for k in range(3):
        np.add.at(n, tri[:, k], fn)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)


def write_glb(path, pos, nor, col, tri, extras):
    pos = pos.astype(np.float32); nor = nor.astype(np.float32)
    col = np.round(np.clip(col, 0, 1) * 255).astype(np.uint8)
    # Dedupe vertex identik (posisi + normal + warna) -> file jauh lebih kecil
    key = np.hstack([pos.view(np.uint32), nor.view(np.uint32), col.astype(np.uint32)])
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    pos, nor, col = pos[first], nor[first], col[first]
    tri = inv.reshape(-1)[tri]
    big = len(pos) > 65535
    idx = tri.reshape(-1).astype(np.uint32 if big else np.uint16)
    chunks, views, accs = [], [], []
    offset = 0

    def add(arr, target, ctype, atype, minmax=False, normalized=False):
        nonlocal offset
        b = arr.tobytes()
        pad = (-len(b)) % 4
        chunks.append(b + b'\0' * pad)
        views.append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(b), 'target': target})
        a = {'bufferView': len(views) - 1, 'componentType': ctype, 'count': len(arr) if arr.ndim > 1 else arr.size, 'type': atype}
        if normalized:
            a['normalized'] = True
        if minmax:
            a['min'] = arr.min(axis=0).tolist(); a['max'] = arr.max(axis=0).tolist()
        accs.append(a)
        offset += len(b) + pad
        return len(accs) - 1

    ip = add(pos, 34962, 5126, 'VEC3', True)
    inn = add(nor, 34962, 5126, 'VEC3')
    col = np.hstack([col, np.full((len(col), 1), 255, np.uint8)])   # VEC4 uint8: rata 4 byte
    ic = add(col, 34962, 5121, 'VEC4', normalized=True)
    ii = add(idx, 34963, 5125 if big else 5123, 'SCALAR')
    gltf = {
        'asset': {'version': '2.0', 'generator': 'AUDIRA-LAND polyfork_import.py', 'extras': extras},
        'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0, 'name': extras['id']}],
        'meshes': [{'primitives': [{'attributes': {'POSITION': ip, 'NORMAL': inn, 'COLOR_0': ic}, 'indices': ii, 'material': 0}]}],
        'materials': [{'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0, 'roughnessFactor': 1}}],
        'buffers': [{'byteLength': offset}], 'bufferViews': views, 'accessors': accs,
    }
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * ((-len(js)) % 4)
    binb = b''.join(chunks)
    total = 12 + 8 + len(js) + 8 + len(binb)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(binb), 0x004E4942)); f.write(binb)


def credit_line(a):
    return f"{a['title']} by Polyfork ({a['page']}), CC BY 4.0. Diubah: mesh digabung, dinormalisasi ke dasar y=0, warna disesuaikan."


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('kit', help="id kit, beberapa id dipisah koma, atau 'all'")
    ap.add_argument('--max-tris', type=int, default=3500)
    ap.add_argument('--only', default='')
    ap.add_argument('--download-only', action='store_true', help='hanya unduh GLB mentah ke raw/')
    args = ap.parse_args()

    catalog_bytes = http_get(CATALOG_URL)
    catalog = json.loads(catalog_bytes)
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    (RAW_DIR.parent / 'catalog.json').write_bytes(catalog_bytes)   # salinan indeks untuk kerja offline
    kit_ids = {k['id'] for k in catalog['kits']}
    wanted = None if args.kit == 'all' else set(args.kit.split(','))
    if wanted and not wanted <= kit_ids:
        sys.exit(f'kit tidak ditemukan: {sorted(wanted - kit_ids)}')
    only = set(filter(None, args.only.split(',')))
    assets = [a for a in catalog['assets']
              if (wanted is None or a.get('kit') in wanted) and (not only or a['id'] in only)]

    if args.download_only:
        got = fail = 0
        for n, a in enumerate(assets, 1):
            raw = RAW_DIR / f"{a['id']}.glb"
            if raw.exists() and raw.stat().st_size > 0:
                continue
            try:
                tmp = raw.with_suffix('.part')
                tmp.write_bytes(http_get(a['glb']))
                tmp.replace(raw)
                got += 1
            except Exception as e:
                fail += 1
                print(f"GAGAL {a['id']}: {e}", flush=True)
            time.sleep(0.4)
            if n % 100 == 0:
                print(f"[{n}/{len(assets)}] baru={got} gagal={fail}", flush=True)
        have = sum(1 for a in assets if (RAW_DIR / f"{a['id']}.glb").exists())
        print(f"SELESAI: {have}/{len(assets)} ada di {RAW_DIR} (baru {got}, gagal {fail})")
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT_DIR / 'manifest.json'
    manifest = json.loads(manifest_path.read_text('utf-8')) if manifest_path.exists() else {'source': 'https://polyfork.dev', 'license': 'CC BY 4.0', 'models': {}}
    skipped = []
    for a in assets:
        tris = a.get('triangles') or 0
        if tris > args.max_tris:
            skipped.append(f"{a['id']} ({tris} segitiga > {args.max_tris})")
            continue
        raw = RAW_DIR / f"{a['id']}.glb"
        try:
            if not raw.exists():
                raw.write_bytes(http_get(a['glb']))
                time.sleep(0.4)
            pos, nor, col, tri = merge(*read_glb(raw.read_bytes()))
        except Exception as e:  # satu model gagal tidak memutus yang lain
            skipped.append(f"{a['id']} (gagal: {e})")
            continue
        lo, hi = pos.min(axis=0), pos.max(axis=0)
        pos = pos - np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])
        size = (hi - lo).round(3).tolist()
        out = OUT_DIR / f"{a['id']}.glb"
        write_glb(out, pos, nor, col, tri, {'id': a['id'], 'credit': credit_line(a)})
        manifest['models'][a['id']] = {
            'title': a['title'], 'type': a['type'], 'kit': a.get('kit') or 'lepas', 'triangles': int(len(tri)),
            'size': size, 'file': out.name, 'page': a['page'], 'credit': credit_line(a),
        }
        print(f"OK {a['id']:34s} tri={len(tri):5d} size={size} {out.stat().st_size // 1024} KB")

    manifest_path.write_text(json.dumps(manifest, indent=1, ensure_ascii=False), 'utf-8')
    lines = ['# Kredit Aset Polyfork', '',
             'Model 3D low-poly berikut berasal dari [Polyfork](https://polyfork.dev), dipakai di bawah',
             '[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Semua file telah diubah oleh',
             '`tools/polyfork_import.py` (mesh digabung jadi satu, dinormalisasi ke dasar y=0, warna',
             'disesuaikan dengan nada kota AUDIRA-LAND). Polyfork tidak membuat atau mendukung AUDIRA-LAND.', '']
    for mid in sorted(manifest['models']):
        lines.append(f"- {manifest['models'][mid]['credit']}")
    CREDITS.write_text('\n'.join(lines) + '\n', 'utf-8')
    print(f"\n{len(manifest['models'])} model di manifest. Dilewati: {len(skipped)}")
    for s in skipped:
        print('  -', s)


if __name__ == '__main__':
    main()
