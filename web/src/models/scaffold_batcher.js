/* global THREE */
/**
 * AUDIRA-LAND: Penggabung proyek konstruksi & sketsa (anggaran draw call HP <= 100).
 *
 * Bangunan jadi dilebur per chunk oleh building_loader (bakeStatic), tetapi proyek ('proyek'/'bangun')
 * dan sketsa tetap satu grup per kavling: mesh perancah + garis + label hitung mundur = 3 draw call
 * per proyek. Dengan 48 proyek, zoom jauh mencapai 136 draw call (uji 390px, 2026-11-13).
 *
 * Modul ini TIDAK mengubah building_loader: mesh statis semua grup scaffold_/sketsa_ digabung per
 * material setara menjadi satu Mesh (koordinat dunia); aslinya hanya disembunyikan (visible = false).
 * Disusun ulang bila daftar grup berubah (dicek tiap 1 dtk), jadi proyek baru/selesai tetap benar.
 * Garis perancah & label hitung mundur TIDAK digabung: keduanya sudah diatur updateDetailLOD
 * (userData.detail, hilang saat jauh) dan label digambar ulang per proyek.
 */

const PREFIX = /^(scaffold|sketsa)_/;
const CHECK_EVERY = 1.0;    // detik

export class ScaffoldBatcher {
    /** @param {THREE.Object3D} root  grup bangunan (building_loader.buildingsGroup) */
    constructor(root) {
        this.root = root;
        this.group = new THREE.Group();
        this.group.name = 'scaffold_batch';
        root.parent ? root.parent.add(this.group) : root.add(this.group);
        this.key = '';
        this.timer = CHECK_EVERY;
    }

    update(dt) {
        this.timer += dt;
        if (this.timer >= CHECK_EVERY) {
            this.timer = 0;
            const groups = this.root.children.filter(g => PREFIX.test(g.name));
            const key = groups.map(g => g.uuid).join(',');
            if (key !== this.key) { this.key = key; this.rebuild(groups); }
        }
    }

    rebuild(groups) {
        for (const m of this.group.children) m.geometry.dispose();
        this.group.clear();
        const buckets = new Map();      // tanda tangan -> { proto, items: [obj] }
        for (const g of groups) {
            g.updateMatrixWorld(true);
            g.traverse(o => {
                if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.detail) return;
                if (o.userData.__batched === undefined && !o.visible) return;   // disembunyikan pemiliknya
                const mat = o.material;
                if (!mat || Array.isArray(mat) || !o.geometry || !o.geometry.attributes.position) return;
                const sig = [mat.type, mat.uuid, o.castShadow ? 1 : 0, o.receiveShadow ? 1 : 0,
                    Object.keys(o.geometry.attributes).sort().join('+')].join('|');
                if (!buckets.has(sig)) buckets.set(sig, { proto: o, items: [] });
                buckets.get(sig).items.push(o);
            });
        }
        // Material sama-persis jarang dibagi antar proyek -> gabungkan juga material yang SETARA
        const merged = new Map();
        for (const b of buckets.values()) {
            const m = b.proto.material;
            const eq = [m.type, m.color ? m.color.getHexString() : '', m.vertexColors ? 1 : 0,
                m.transparent ? 1 : 0, m.opacity, m.depthWrite ? 1 : 0, m.map ? m.map.uuid : '', b.proto.castShadow ? 1 : 0,
                b.proto.receiveShadow ? 1 : 0, Object.keys(b.proto.geometry.attributes).sort().join('+')].join('|');
            if (!merged.has(eq)) merged.set(eq, { proto: b.proto, items: [] });
            merged.get(eq).items.push(...b.items);
        }
        for (const { proto, items } of merged.values()) {
            if (items.length < 2) { items.forEach(o => { o.visible = true; o.userData.__batched = false; }); continue; }
            const geo = mergeWorld(items);
            const obj = new THREE.Mesh(geo, proto.material);
            obj.castShadow = proto.castShadow;
            obj.receiveShadow = proto.receiveShadow;
            obj.renderOrder = proto.renderOrder;
            obj.matrixAutoUpdate = false;
            this.group.add(obj);
            for (const o of items) { o.visible = false; o.userData.__batched = true; }
        }
    }
}

/** Gabung geometri (atribut sama) ke koordinat dunia. Normal ditransformasi dengan matriks normal. */
function mergeWorld(items) {
    const names = Object.keys(items[0].geometry.attributes);
    const size = {}, total = { v: 0, i: 0 };
    for (const n of names) size[n] = items[0].geometry.attributes[n].itemSize;
    for (const o of items) {
        const g = o.geometry;
        total.v += g.attributes.position.count;
        total.i += g.index ? g.index.count : g.attributes.position.count;
    }
    const out = {};
    for (const n of names) out[n] = new Float32Array(total.v * size[n]);
    const index = new (total.v > 65535 ? Uint32Array : Uint16Array)(total.i);
    const nm = new THREE.Matrix3();
    const v = new THREE.Vector3();
    let vo = 0, io = 0;
    for (const o of items) {
        const g = o.geometry, cnt = g.attributes.position.count;
        nm.getNormalMatrix(o.matrixWorld);
        for (const n of names) {
            const a = g.attributes[n], s = size[n], dst = out[n];
            for (let k = 0; k < cnt; k++) {
                if (n === 'position') {
                    v.fromBufferAttribute(a, k).applyMatrix4(o.matrixWorld);
                    dst[(vo + k) * 3] = v.x; dst[(vo + k) * 3 + 1] = v.y; dst[(vo + k) * 3 + 2] = v.z;
                } else if (n === 'normal') {
                    v.fromBufferAttribute(a, k).applyMatrix3(nm).normalize();
                    dst[(vo + k) * 3] = v.x; dst[(vo + k) * 3 + 1] = v.y; dst[(vo + k) * 3 + 2] = v.z;
                } else {
                    // r128: array mentah; atribut ternormalisasi (warna uint8) dibagi ke 0..1
                    const div = a.normalized ? (a.array instanceof Uint8Array ? 255 : a.array instanceof Uint16Array ? 65535 : 1) : 1;
                    for (let c = 0; c < s; c++) dst[(vo + k) * s + c] = a.array[k * s + c] / div;
                }
            }
        }
        if (g.index) for (let k = 0; k < g.index.count; k++) index[io + k] = g.index.getX(k) + vo;
        else for (let k = 0; k < cnt; k++) index[io + k] = vo + k;
        io += g.index ? g.index.count : cnt;
        vo += cnt;
    }
    const geo = new THREE.BufferGeometry();
    for (const n of names) geo.setAttribute(n, new THREE.BufferAttribute(out[n], size[n]));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeBoundingSphere();
    return geo;
}
