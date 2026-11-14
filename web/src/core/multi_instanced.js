/**
 * AUDIRA-LAND: MultiInstanced - beberapa geometri berbeda dalam SATU InstancedMesh (1 draw call).
 *
 * Geometri "bagian" digabung jadi satu BufferGeometry dengan atribut per-vertex `aPart` (nomor bagian).
 * Tiap instance membawa `iPart` (InstancedBufferAttribute). Di vertex shader, vertex yang aPart-nya
 * bukan milik instance dikempiskan ke titik asal -> segitiganya luas nol dan tidak digambar.
 *
 * Biaya: setiap instance memproses vertex SEMUA bagian. Hanya untuk model berpoligon rendah
 * (total vertex gabungan x jumlah instance tetap kecil, mis. satwa prosedural, kendaraan kotak).
 * Jangan dipakai untuk model Polyfork ribuan vertex.
 *
 * Bayangan: customDepthMaterial diberi injeksi yang sama, jadi bayangan juga hanya dari bagian aktif.
 * three.js r128 (global THREE).
 */

const PART_DECL = 'attribute float aPart;\nattribute float iPart;\n';
const PART_COLLAPSE = '#include <begin_vertex>\nif (abs(aPart - iPart) > 0.5) transformed = vec3(0.0);';

function inject(shader) {
    shader.vertexShader = PART_DECL + shader.vertexShader.replace('#include <begin_vertex>', PART_COLLAPSE);
}

/** Pasang injeksi bagian (cache program three r128 dibedakan lewat onBeforeCompile.toString + tipe). */
function withParts(m) {
    m.onBeforeCompile = inject;
    return m;
}

/**
 * Gabung geometri bagian (position wajib; normal & color opsional -> dihitung / putih).
 * @returns BufferGeometry dengan position, normal, color, aPart (+ index)
 */
export function mergeParts(geos) {
    let nv = 0, ni = 0;
    for (const g of geos) {
        nv += g.attributes.position.count;
        ni += g.index ? g.index.count : g.attributes.position.count;
    }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    const part = new Float32Array(nv);
    const idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
    let vo = 0, io = 0;
    geos.forEach((src, p) => {
        const g = src.attributes.normal ? src : src.clone();
        if (!g.attributes.normal) g.computeVertexNormals();
        const n = g.attributes.position.count;
        const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color;
        for (let i = 0; i < n; i++) {
            const o = (vo + i) * 3;
            pos[o] = P.getX(i); pos[o + 1] = P.getY(i); pos[o + 2] = P.getZ(i);
            nor[o] = N.getX(i); nor[o + 1] = N.getY(i); nor[o + 2] = N.getZ(i);
            if (C) { col[o] = C.getX(i); col[o + 1] = C.getY(i); col[o + 2] = C.getZ(i); }
            else { col[o] = col[o + 1] = col[o + 2] = 1; }
            part[vo + i] = p;
        }
        if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo; io += a.length; }
        else { for (let i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
        vo += n;
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
}

/**
 * Satu InstancedMesh untuk beberapa geometri bagian.
 * Material harus memakai vertexColors (warna asli bagian ada di atribut color).
 * Pakai setPart(i, p) untuk memilih bagian instance i; iPart.needsUpdate otomatis.
 */
export class MultiInstanced extends THREE.InstancedMesh {
    constructor(geos, material, count) {
        const geo = mergeParts(geos);
        const parts = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count)), 1);
        geo.setAttribute('iPart', parts);
        super(geo, withParts(material.clone()), Math.max(1, count));
        this.customDepthMaterial = withParts(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
        this.parts = parts;
        this.count = count;
    }
    setPart(i, p) {
        this.parts.setX(i, p);
        this.parts.needsUpdate = true;
    }
}
