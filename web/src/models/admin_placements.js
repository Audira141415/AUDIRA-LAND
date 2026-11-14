/* global THREE */
/**
 * AUDIRA-LAND: Lapisan "Palet Aset Admin" — aset yang ditempatkan walikota dari manifest polyfork.
 * Spesifikasi: docs/SPEC_ADMIN_ASSET_PALETTE.md
 *
 * Terpisah dari tabel buildings. Dimuat lazy (import dinamis di main.js) agar tidak membebani bundel
 * awal (anggaran JS gzip <= 160 KB). Data dari RPC publik list_placements (dibaca semua pemain saat boot);
 * admin menambah/menghapus lewat admin_place_asset / admin_remove_asset lalu lapisan diperbarui live.
 *
 * Kinerja (anggaran draw <= 100 @ 390px): 1 InstancedMesh per asset_id (bukan 1 per objek). geometri
 * dari pustaka bersama polyfork_library (pfGeo), material vertexColors (pfLiveMaterial) agar warna glb tampil.
 * Zero-Submerging: y = permukaan di (x,z) + micro-lift 0.02; glb polyfork sudah dasar y=0.
 */

import { pfGeo, pfLiveMaterial, preloadPolyfork } from './polyfork_library.js';
import { getSurfaceIndex } from '../core/surface_index.js';
import { GRID_CONFIG } from '../core/constants.js';

const LIFT = GRID_CONFIG.MICRO_LIFT || 0.02;

/** y permukaan di (x,z) + micro-lift. Tanpa indeks (boot awal) -> tanah dasar. */
function groundY(x, z) {
    const idx = getSurfaceIndex();
    const y = idx ? idx.at(x, z).y : 0;
    return y + LIFT;
}

export class AdminPlacements {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = 'admin_placements';
        scene.add(this.group);
        this.rows = new Map();            // id -> row
        this.meshes = new Map();          // asset_id -> InstancedMesh
        this._dummy = new THREE.Object3D();
    }

    /** Muat semua placement (boot) dan render. */
    async setAll(rows) {
        this.rows.clear();
        for (const r of rows || []) this.rows.set(r.id, r);
        await this._rebuildAll();
    }

    /** Tambah satu placement live (setelah admin_place_asset). */
    async add(row) {
        if (!row || !row.id) return;
        this.rows.set(row.id, row);
        await this._rebuildAsset(row.asset_id);
    }

    /** Hapus satu placement live (setelah admin_remove_asset). */
    remove(id) {
        const row = this.rows.get(id);
        if (!row) return;
        this.rows.delete(id);
        this._rebuildAsset(row.asset_id);
    }

    async _rebuildAll() {
        const ids = [...new Set([...this.rows.values()].map((r) => r.asset_id))];
        await preloadPolyfork(ids).catch(() => {});
        // Buang mesh asset yang tak ada lagi
        for (const assetId of [...this.meshes.keys()]) if (!ids.includes(assetId)) this._dropMesh(assetId);
        for (const assetId of ids) this._buildOne(assetId);
    }

    async _rebuildAsset(assetId) {
        if (!pfGeo(assetId)) await preloadPolyfork([assetId]).catch(() => {});
        this._buildOne(assetId);
    }

    _dropMesh(assetId) {
        const m = this.meshes.get(assetId);
        if (m) { this.group.remove(m); m.dispose?.(); this.meshes.delete(assetId); }
    }

    /** Bangun ulang InstancedMesh untuk satu asset_id dari semua placement-nya. */
    _buildOne(assetId) {
        this._dropMesh(assetId);
        const list = [...this.rows.values()].filter((r) => r.asset_id === assetId);
        const geo = pfGeo(assetId);
        if (!list.length || !geo) return;   // glb gagal dimuat -> lewati (tak ada placeholder)
        const im = new THREE.InstancedMesh(geo, pfLiveMaterial(), list.length);
        im.name = `place_${assetId}`;
        im.castShadow = true;
        im.receiveShadow = true;
        const d = this._dummy;
        list.forEach((r, k) => {
            d.position.set(Number(r.world_x) || 0, groundY(Number(r.world_x) || 0, Number(r.world_z) || 0), Number(r.world_z) || 0);
            d.rotation.set(0, Number(r.rot_y) || 0, 0);
            d.scale.setScalar(Number(r.scale) || 1);
            d.updateMatrix();
            im.setMatrixAt(k, d.matrix);
        });
        im.instanceMatrix.needsUpdate = true;
        this.group.add(im);
        this.meshes.set(assetId, im);
    }

    dispose() {
        for (const assetId of [...this.meshes.keys()]) this._dropMesh(assetId);
        this.scene.remove(this.group);
        this.rows.clear();
    }
}
