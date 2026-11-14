/**
 * AUDIRA-LAND: Keramaian kota mengikuti jumlah warga terdaftar (dimuat lazy dari main.js).
 * Tidak mengimpor modul lain agar tidak memecah bundel awal.
 */

/**
 * Keramaian mengikuti jumlah warga: 0 warga = kota sepi (stadion, taman bermain, Taman Budaya,
 * trotoar, pemancing, kafe tanpa orang); penuh pada 100 warga. Dipanggil tiap frame SETELAH
 * update modul (yang menyalakan ulang visible/LOD) dan sebelum render. Memotong InstancedMesh.count
 * (indeks orang stabil), jadi tanpa draw call tambahan.
 */
export function applyCrowd(game) {
    // Kendali Pemkot (Panel Pengelola): crowdOverride 0..1 menggantikan skala dari jumlah warga
    const ov = game.crowdOverride;
    const f = ov != null && ov >= 0 ? Math.min(1, ov) : Math.min(1, (game.population || 0) / 100);
    const pop = f * 100;
    const cut = (m, n) => {
        if (!m) return;
        if (m.userData.cap === undefined) m.userData.cap = m.count;
        m.count = Math.min(m.userData.cap, Math.round(n));
    };
    const st = game.stadium;
    if (st) {
        cut(st.crowd, st.crowdCount * f);
        // Pertandingan baru ada bila warga cukup untuk 2 tim + wasit
        if (pop < 23) for (const m of [st.pBody, st.pLegs, st.ballMesh]) if (m) m.visible = false;
    }
    const pg = game.playground;
    if (pg && pg.kids) { const n = Math.round(pg.kids.length * f); cut(pg.kBody, n); cut(pg.kLegs, 2 * n); }
    const tp = game.themePark;
    if (tp && tp.people) {
        const n = Math.round(tp.people.length * f);
        for (const m of [tp.vLegL, tp.vLegR, tp.vTorso, tp.vHead]) cut(m, n);
        let h = 0;
        for (let k = 0; k < n; k++) if (tp.people[k].hijab) h++;
        cut(tp.vHijab, h);
    }
    if (game.pedestrians) game.pedestrians.crowd = f;
    if (game.idleScenes && game.idleScenes.root) game.idleScenes.root.visible = pop >= 5;
    const ang = game.scenery && game.scenery.anglers;
    if (ang && ang.mesh) cut(ang.mesh, ang.mesh.userData.cap === undefined ? ang.mesh.count * f : ang.mesh.userData.cap * f);
}
