"""
AUDIRA-LAND: bake animasi karakter Polyfork (rig + klip Idle/Walk/Run) menjadi N frame mesh statis.

Karakter Polyfork tersimpan dalam pose-T dengan skin (JOINTS_0/WEIGHTS_0) dan klip animasi. Three r128
+ InstancedMesh tidak bisa memutar skin per instance, jadi klip di-sampling di CPU (linear blend skinning)
lalu tiap frame ditulis sebagai GLB 1-mesh biasa:
    web/public/models/polyfork/<id>__<klip><k>.glb      (k = 0..N-1)
Runtime (living_world.js) mengganti geometri InstancedMesh per frame -> karakter benar-benar melangkah.

Normalisasi sama untuk semua frame: pusat X/Z dari frame 0, dasar y = titik terendah semua frame.

Pakai:
  python tools/polyfork_bake_anim.py <id>[,<id>...] [--clip Walk] [--frames 8]
"""
import argparse
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import polyfork_import as P  # noqa: E402


def quat_mat(q):
    x, y, z, w = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])


def slerp(a, b, t):
    d = float(np.dot(a, b))
    if d < 0:
        b, d = -b, -d
    if d > 0.9995:
        r = a + t * (b - a)
        return r / np.linalg.norm(r)
    th = np.arccos(d)
    return (np.sin((1 - t) * th) * a + np.sin(t * th) * b) / np.sin(th)


def sample(gltf, binc, anim, t):
    """{node: {'translation'|'rotation'|'scale': value}} pada waktu t."""
    out = {}
    for ch in anim['channels']:
        s = anim['samplers'][ch['sampler']]
        times = P.accessor(gltf, binc, s['input']).reshape(-1)
        vals = P.accessor(gltf, binc, s['output'])
        interp = s.get('interpolation', 'LINEAR')
        if interp == 'CUBICSPLINE':
            vals = vals.reshape(len(times), 3, -1)[:, 1]
        i = int(np.clip(np.searchsorted(times, t) - 1, 0, len(times) - 1))
        j = min(i + 1, len(times) - 1)
        span = times[j] - times[i]
        u = 0.0 if span <= 0 or interp == 'STEP' else float(np.clip((t - times[i]) / span, 0, 1))
        path = ch['target']['path']
        if path == 'rotation':
            v = slerp(vals[i], vals[j], u)
        elif path in ('translation', 'scale'):
            v = vals[i] + (vals[j] - vals[i]) * u
        else:
            continue
        out.setdefault(ch['target']['node'], {})[path] = v
    return out


def local_matrix(node, ov):
    if 'matrix' in node:
        base = P.node_matrix(node)
        if not ov:
            return base
        # Dekomposisi matriks rest (offset tulang ada di sini), lalu timpa komponen yang dianimasikan
        t0 = base[:3, 3]
        s0 = np.linalg.norm(base[:3, :3], axis=0)
        r0 = base[:3, :3] / np.where(s0 == 0, 1, s0)
        t = ov.get('translation', t0)
        s = ov.get('scale', s0)
        rm = quat_mat(ov['rotation']) if 'rotation' in ov else r0
    else:
        t = ov.get('translation', np.array(node.get('translation', [0, 0, 0]), float))
        s = ov.get('scale', np.array(node.get('scale', [1, 1, 1]), float))
        rm = quat_mat(ov.get('rotation', np.array(node.get('rotation', [0, 0, 0, 1]), float)))
    m = np.eye(4)
    m[:3, :3] = rm * s
    m[:3, 3] = t
    return m


def pose_mesh(gltf, binc, overrides):
    nodes = gltf['nodes']
    world = [None] * len(nodes)

    def walk(ni, parent):
        world[ni] = parent @ local_matrix(nodes[ni], overrides.get(ni, {}))
        for c in nodes[ni].get('children', []):
            walk(c, world[ni])

    for ni in gltf['scenes'][gltf.get('scene', 0)]['nodes']:
        walk(ni, np.eye(4))

    Pp, Nn, Cc, Ii = [], [], [], []
    base = 0
    for ni, node in enumerate(nodes):
        if 'mesh' not in node or world[ni] is None:
            continue
        skin = gltf['skins'][node['skin']] if 'skin' in node else None
        if skin:
            ibm = P.accessor(gltf, binc, skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
            jm = np.stack([world[j] @ ibm[k] for k, j in enumerate(skin['joints'])])
        for prim in gltf['meshes'][node['mesh']]['primitives']:
            if prim.get('mode', 4) != 4:
                continue
            at = prim['attributes']
            pos = P.accessor(gltf, binc, at['POSITION'])
            nor = P.accessor(gltf, binc, at['NORMAL']) if 'NORMAL' in at else np.zeros_like(pos)
            if skin and 'JOINTS_0' in at:
                J = P.accessor(gltf, binc, at['JOINTS_0']).astype(int)
                W = P.accessor(gltf, binc, at['WEIGHTS_0'])
                W = W / np.maximum(W.sum(1, keepdims=True), 1e-9)
                M = np.einsum('vk,vkij->vij', W, jm[J])               # matriks skin per vertex
                ph = np.c_[pos, np.ones(len(pos))]
                pos_w = np.einsum('vij,vj->vi', M, ph)[:, :3]
                nor_w = np.einsum('vij,vj->vi', M[:, :3, :3], nor)
            else:
                m = world[ni]
                pos_w = pos @ m[:3, :3].T + m[:3, 3]
                nor_w = nor @ np.linalg.inv(m[:3, :3])
            nor_w /= np.maximum(np.linalg.norm(nor_w, axis=1, keepdims=True), 1e-9)
            col = P.accessor(gltf, binc, at['COLOR_0'])[:, :3] if 'COLOR_0' in at else np.ones((len(pos), 3))
            idx = P.accessor(gltf, binc, prim['indices']).astype(np.int64).reshape(-1, 3) if 'indices' in prim \
                else np.arange(len(pos)).reshape(-1, 3)
            Pp.append(pos_w); Nn.append(nor_w); Cc.append(col); Ii.append(idx + base)
            base += len(pos)
    return np.vstack(Pp), np.vstack(Nn), np.vstack(Cc), np.vstack(Ii)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('ids')
    ap.add_argument('--clip', default='Walk')
    ap.add_argument('--frames', type=int, default=8)
    args = ap.parse_args()
    for mid in args.ids.split(','):
        raw = P.RAW_DIR / f'{mid}.glb'
        gltf, binc = P.read_glb(raw.read_bytes())
        anim = next((a for a in gltf.get('animations', []) if a.get('name', '').lower() == args.clip.lower()), None)
        if not anim:
            print(f'LEWATI {mid}: klip {args.clip} tidak ada'); continue
        dur = max(float(P.accessor(gltf, binc, anim['samplers'][c['sampler']]['input']).max()) for c in anim['channels'])
        frames = [pose_mesh(gltf, binc, sample(gltf, binc, anim, dur * k / args.frames)) for k in range(args.frames)]
        lo0, hi0 = frames[0][0].min(0), frames[0][0].max(0)
        ymin = min(f[0][:, 1].min() for f in frames)
        off = np.array([(lo0[0] + hi0[0]) / 2, ymin, (lo0[2] + hi0[2]) / 2])
        for k, (pos, nor, col, tri) in enumerate(frames):
            out = P.OUT_DIR / f'{mid}__{args.clip.lower()}{k}.glb'
            P.write_glb(out, pos - off, nor, col, tri, {'id': f'{mid}__{args.clip.lower()}{k}', 'credit': f'Polyfork {mid}, CC BY 4.0 (dibake dari klip {args.clip})'})
        size = (frames[0][0].max(0) - frames[0][0].min(0)).round(2).tolist()
        print(f'OK {mid}: {args.frames} frame {args.clip}, {len(frames[0][3])} segitiga, ukuran frame0 {size}')


if __name__ == '__main__':
    main()
