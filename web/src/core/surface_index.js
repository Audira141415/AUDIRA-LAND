/* global THREE */
/**
 * AUDIRA-LAND: Indeks permukaan datar kota (Zero-Submerging untuk penanam pohon/props).
 *
 * Dibangun SEKALI dari mesh datar grup kota (aspal, median, trotoar, pad kavling/taman, gumpalan
 * pekarangan, kolam, sungai) SEBELUM grup dilebur bakeStatic. Setelah itu setiap penanam bisa bertanya
 * "permukaan apa dan setinggi apa di titik (x, z)?" tanpa raycast ke ribuan segitiga.
 *
 * - Uji titik memakai matriks invers per mesh/instance -> tepat untuk kotak/elips yang diputar
 *   (gumpalan pekarangan Have-Not), bukan AABB yang melebar di sudut.
 * - Jenis permukaan dari material.userData.surface: 'road' (aspal, marka) | 'water' (sungai, kolam);
 *   lainnya 'pad'. Permukaan TERTINGGI di titik itu yang menang (median di atas aspal -> 'pad').
 * - Hanya mesh tipis (tebal dunia <= MAX_THICK) dan rendah (puncak <= MAX_TOP) yang diindeks, jadi
 *   pagar, tiang, dan bangunan tidak dianggap permukaan. Benda tipis yang melayang (dudukan bangku,
 *   papan) juga dilewati: dasarnya harus <= MAX_BASE.
 * - Decal datar (gumpalan rumput, aspal: tebal ~0) hanya dihitung di PUSAT jejak; tepi jejak hanya
 *   menghitung benda padat (pad, paving, bedengan), supaya batang di tepi gumpalan tidak ikut terangkat.
 */

const CELL = 8;
const MAX_TOP = 0.7;
const MAX_THICK = 0.45;
const MAX_BASE = 0.3;
const SOLID = 0.01;

const _m = new THREE.Matrix4();
const _mi = new THREE.Matrix4();
const _box = new THREE.Box3();
const _v = new THREE.Vector3();

let current = null;

/**
 * Titik lokal di dalam poligon beraturan CircleGeometry setelah rotateX(-90°)?
 * Sudut poligon: (r cos θ, 0, -r sin θ), θ = t0 + k·2π/n. Jarak tepi pada sudut φ = r·cos(π/n) / cos(φ' - π/n).
 */
function inPolygon(x, z, { r, n, t0 }) {
    const d = Math.hypot(x, z);
    if (d <= r * Math.cos(Math.PI / n)) return true;
    if (d > r) return false;
    const seg = 2 * Math.PI / n;
    let a = (Math.atan2(-z, x) - t0) % seg;
    if (a < 0) a += seg;
    return d <= r * Math.cos(Math.PI / n) / Math.cos(a - Math.PI / n);
}
/** Indeks kota aktif (diisi CityGrid) atau null. */
export const getSurfaceIndex = () => current;

export class SurfaceIndex {
    constructor() {
        this.cells = new Map();
        this.count = 0;
    }

    /** Indeks semua mesh datar di dalam group (koordinat dunia). */
    static fromGroup(group, { setCurrent = true } = {}) {
        const idx = new SurfaceIndex();
        group.updateMatrixWorld(true);
        group.traverse(o => {
            if (!(o.isMesh && o.geometry && o.geometry.attributes.position)) return;
            const geo = o.geometry;
            if (!geo.boundingBox) geo.computeBoundingBox();
            const mat = Array.isArray(o.material) ? o.material[0] : o.material;
            const kind = (mat && mat.userData && mat.userData.surface) || 'pad';
            const p = geo.parameters || {};
            // CircleGeometry = poligon beraturan n sisi (sudut pertama di thetaStart)
            const circle = geo.type === 'CircleGeometry' || geo.type === 'CircleBufferGeometry'
                ? { r: p.radius || 1, n: p.segments || 8, t0: p.thetaStart || 0 } : null;
            const n = o.isInstancedMesh ? o.count : 1;
            for (let k = 0; k < n; k++) {
                if (o.isInstancedMesh) { o.getMatrixAt(k, _m); _m.premultiply(o.matrixWorld); } else _m.copy(o.matrixWorld);
                _box.copy(geo.boundingBox).applyMatrix4(_m);
                if (_box.max.y > MAX_TOP || _box.min.y > MAX_BASE || _box.max.y - _box.min.y > MAX_THICK) continue;
                idx.add({ inv: _mi.copy(_m).invert().clone(), lb: geo.boundingBox, circle, top: _box.max.y, kind, solid: _box.max.y - _box.min.y > SOLID,
                    x0: _box.min.x, x1: _box.max.x, z0: _box.min.z, z1: _box.max.z });
            }
        });
        if (setCurrent) current = idx;
        return idx;
    }

    add(e) {
        for (let cx = Math.floor(e.x0 / CELL); cx <= Math.floor(e.x1 / CELL); cx++) {
            for (let cz = Math.floor(e.z0 / CELL); cz <= Math.floor(e.z1 / CELL); cz++) {
                const key = cx + ',' + cz;
                if (!this.cells.has(key)) this.cells.set(key, []);
                this.cells.get(key).push(e);
            }
        }
        this.count++;
    }

    /** Permukaan tertinggi tepat di (x, z): { y, kind }. Tanpa permukaan -> tanah dasar y = 0. */
    at(x, z, solidOnly = false) {
        let best = null;
        const list = this.cells.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
        if (list) {
            for (const e of list) {
                if (x < e.x0 || x > e.x1 || z < e.z0 || z > e.z1 || (best && e.top <= best.top) || (solidOnly && (!e.solid || e.kind === 'road'))) continue;
                _v.set(x, e.top, z).applyMatrix4(e.inv);
                const inside = e.circle ? inPolygon(_v.x, _v.z, e.circle) : _v.x >= e.lb.min.x && _v.x <= e.lb.max.x && _v.z >= e.lb.min.z && _v.z <= e.lb.max.z;
                if (inside) best = e;
            }
        }
        return best ? { y: best.top, kind: best.kind } : { y: 0, kind: 'ground' };
    }

    /**
     * Titik tanam untuk objek berjejak radius r (batang pohon, tiang): y = permukaan di pusat + micro-lift.
     * null bila pusat jatuh di aspal/air, tepi jejak menyentuh air, atau tepi jejak menabrak benda padat
     * yang lebih tinggi dari pusat (bedengan, kaki bangku, tepi pad): menaikkan pohon ke atasnya membuat
     * batang melayang di sisi lain, jadi titik itu dilewati.
     */
    plant(x, z, r = 0.3, lift = 0.02) {
        const c = this.at(x, z);
        if (c.kind === 'road' || c.kind === 'water') return null;
        for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
            if (this.at(x + dx, z + dz).kind === 'water') return null;
            // tepi: hanya benda padat (pad, paving, bedengan), bukan decal datar atau kanstin
            if (this.at(x + dx, z + dz, true).y > c.y + 0.03) return null;
        }
        return c.y + lift;
    }
}
