import re

path = 'F:/AUDIRA-INTEGRASI-BLEDER-ROBLOX/AUDIRA-LAND/web/src/models/building_loader.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update getBuildingAt to check full bounding box of building
old_get_building = '''    getBuildingAt(districtKey, tileI, tileJ) {
        for (const [id, item] of this.loadedBuildings) {
            const b = item.data;
            if (b.district_key === districtKey) {
                // Kecocokan integer grid langsung
                if (b.grid_i === tileI && b.grid_j === tileJ) {
                    return b;
                }
                // Backward compatibility untuk starter buildings lama
                if (districtKey === 'k12') {
                    if (b.type === 'balai_kota' && tileI === 21 && tileJ === 10) return b;
                    if (b.type === 'warung_madura' && tileI === 10 && tileJ === 10) return b;
                    if (b.type === 'taman_surya' && tileI === 10 && tileJ === 21) return b;
                    if (b.type === 'pos_ronda' && tileI === 21 && tileJ === 21) return b;
                }
            }
        }
        return null;
    }'''

new_get_building = '''    getBuildingAt(districtKey, tileI, tileJ) {
        for (const [id, item] of this.loadedBuildings) {
            const b = item.data;
            if (b.district_key === districtKey) {
                const bi = b.grid_i !== undefined ? b.grid_i : 108;
                const bj = b.grid_j !== undefined ? b.grid_j : 108;
                const bw = b.width || 1;
                const bh = b.height || 1;
                if (tileI >= bi && tileI < bi + bw && tileJ >= bj && tileJ < bj + bh) {
                    return b;
                }
            }
        }
        return null;
    }'''

if old_get_building in content:
    content = content.replace(old_get_building, new_get_building)
    print("Replaced getBuildingAt!")
else:
    print("WARNING: old_get_building not found!")

# 2. Update addBuilding coordinate handling & facing rotation
old_add_building_pos = '''        if (mesh) {
            let posX = data.worldX;
            let posZ = data.worldZ;

            // Resolusi koordinat jika belum ditentukan (Presisi 4 sudut Alun-Alun k12)
            if (posX === undefined || posZ === undefined) {
                if (data.district_key === 'k12') {
                    if (data.type === 'balai_kota' || (data.grid_i === 16 && data.grid_j === 16)) {
                        posX = 5.9; posZ = -5.9;
                    } else if (data.type === 'warung_madura' || (data.grid_i === 14 && data.grid_j === 16)) {
                        posX = -5.9; posZ = -5.9;
                    } else if (data.type === 'taman_surya' || (data.grid_i === 16 && data.grid_j === 14)) {
                        posX = -5.9; posZ = 5.9;
                    } else if (data.type === 'pos_ronda' || (data.grid_i === 18 && data.grid_j === 16)) {
                        posX = 5.9; posZ = 5.9;
                    } else {
                        posX = 0; posZ = 0;
                    }
                } else {
                    posX = 0; posZ = 0;
                }
            }

            // Ketinggian Zero-Submerging Surface Policy: Berdiri tepat di atas bantalan kavling 3D
            const surfaceBaseY = GRID_CONFIG.SURFACE_Y + GRID_CONFIG.PLOT_PAD_HEIGHT + GRID_CONFIG.MICRO_LIFT; // 0.08m
            mesh.position.set(posX, surfaceBaseY, posZ);
            this.buildingsGroup.add(mesh);

            this.loadedBuildings.set(data.id, {
                data: { ...data, worldX: posX, worldZ: posZ },
                mesh,
                billboardObj
            });
        }'''

new_add_building_pos = '''        if (mesh) {
            let posX = data.worldX;
            let posZ = data.worldZ;

            if (posX === undefined || posZ === undefined) {
                const T = GRID_CONFIG.TILE_SIZE;
                const HALF = GRID_CONFIG.HALF_TILES;
                const i = data.grid_i !== undefined ? data.grid_i : 108;
                const j = data.grid_j !== undefined ? data.grid_j : 108;
                const w = data.width || 1;
                const h = data.height || 1;
                posX = (i - HALF) * T + (w * T) / 2;
                posZ = (j - HALF) * T + (h * T) / 2;
            }

            // Ketinggian Zero-Submerging Surface Policy (Y0 = 0.20m + 0.02m lift)
            const surfaceBaseY = GRID_CONFIG.SURFACE_Y + GRID_CONFIG.MICRO_LIFT;
            mesh.position.set(posX, surfaceBaseY, posZ);

            // Orientasi menghadap jalan (facing 0: S, 1: E, 2: N, 3: W)
            if (data.facing !== undefined && data.facing !== null) {
                mesh.rotation.y = data.facing * (Math.PI / 2);
            }

            this.buildingsGroup.add(mesh);

            this.loadedBuildings.set(data.id, {
                data: { ...data, worldX: posX, worldZ: posZ },
                mesh,
                billboardObj
            });
        }'''

if old_add_building_pos in content:
    content = content.replace(old_add_building_pos, new_add_building_pos)
    print("Replaced addBuilding pos!")
else:
    print("WARNING: old_add_building_pos not found!")

# 3. Update createSketsaMesh for 8m tile sizing
old_sketsa = '''    createSketsaMesh(data) {
        const group = new THREE.Group();
        group.name = `sketsa_${data.id}`;

        const w = (data.width || 1) * 2.7;
        const d = (data.height || 1) * 2.7;
        const h = 2.4;'''

new_sketsa = '''    createSketsaMesh(data) {
        const group = new THREE.Group();
        group.name = `sketsa_${data.id}`;

        const w = (data.width || 1) * 8.0 - 0.8;
        const d = (data.height || 1) * 8.0 - 0.8;
        const h = 4.5;'''

if old_sketsa in content:
    content = content.replace(old_sketsa, new_sketsa)
    print("Replaced createSketsaMesh!")
else:
    print("WARNING: old_sketsa not found!")

# 4. Update createConstructionScaffoldMesh for 8m tile sizing and majestic yellow tower crane
old_scaffold_top = '''    createConstructionScaffoldMesh(data) {
        const group = new THREE.Group();
        group.name = `scaffold_${data.id}`;

        // 1. Alas Pasir Proyek & Pondasi Awal
        const sand = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 2.6), this.materials.creamDark);'''

new_scaffold_top = '''    createConstructionScaffoldMesh(data) {
        const group = new THREE.Group();
        group.name = `scaffold_${data.id}`;

        const w = (data.width || 1) * 8.0 - 0.8;
        const d = (data.height || 1) * 8.0 - 0.8;

        // 1. Alas Pasir & Kerikil Proyek
        const sand = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), this.materials.creamDark);'''

if old_scaffold_top in content:
    content = content.replace(old_scaffold_top, new_scaffold_top)
    print("Replaced createConstructionScaffoldMesh top!")
else:
    print("WARNING: old_scaffold_top not found!")

# Crane scaling
old_crane = '''        // Tiang Utama Tower Crane Vertikal (Tinggi 6.8m)
        const craneMast = new THREE.Mesh(new THREE.BoxGeometry(0.32, 6.8, 0.32), craneYellowMat);
        craneMast.position.set(0.9, 3.4, 0.9);
        craneMast.castShadow = true;
        group.add(craneMast);

        // Kabin Operator & Slew Ring di Puncak
        const craneCab = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.55), craneDarkMat);
        craneCab.position.set(0.9, 6.85, 0.9);
        group.add(craneCab);

        // Lengan Horizontal Derek (Jib Panjang 5.2m ke Depan)
        const craneJib = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.25, 0.25), craneYellowMat);
        craneJib.position.set(-0.9, 7.15, 0.9);
        craneJib.castShadow = true;
        group.add(craneJib);

        // Beban Penyeimbang Belakang (Counterweight)
        const counterWeight = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 0.6), craneDarkMat);
        counterWeight.position.set(2.2, 7.1, 0.9);
        group.add(counterWeight);

        // Kabel Katrol Derek & Blok Pengait
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.2, 4), this.materials.ink);
        rope.position.set(-2.2, 6.0, 0.9);
        group.add(rope);

        const hook = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.35), this.materials.terracotta);
        hook.position.set(-2.2, 4.8, 0.9);
        group.add(hook);

        // Garis Kisi Scaffolding Proyek
        const scafGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(2.4, 3.2, 2.4, 2, 2, 2));'''

new_crane = '''        // Tiang Utama Tower Crane Vertikal Megah Kuning (Tinggi 13.5m)
        const craneYellowMat = new THREE.MeshLambertMaterial({ color: 0xF1C40F, roughness: 0.4 });
        const craneMast = new THREE.Mesh(new THREE.BoxGeometry(0.55, 13.5, 0.55), craneYellowMat);
        craneMast.position.set(w / 2 - 1.2, 6.75, d / 2 - 1.2);
        craneMast.castShadow = true;
        group.add(craneMast);

        // Kabin Operator di Puncak (13.6m)
        const craneCab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), craneDarkMat);
        craneCab.position.set(w / 2 - 1.2, 13.6, d / 2 - 1.2);
        group.add(craneCab);

        // Lengan Horizontal Derek (Jib Panjang 11.5m ke Depan)
        const craneJib = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.45, 0.45), craneYellowMat);
        craneJib.position.set(w / 2 - 5.5, 14.2, d / 2 - 1.2);
        craneJib.castShadow = true;
        group.add(craneJib);

        // Beban Penyeimbang Belakang (Counterweight)
        const counterWeight = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.1), craneDarkMat);
        counterWeight.position.set(w / 2 + 1.8, 14.1, d / 2 - 1.2);
        group.add(counterWeight);

        // Kabel Katrol Derek & Blok Pengait Gantung
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 5.5, 4), this.materials.ink);
        rope.position.set(w / 2 - 6.5, 11.2, d / 2 - 1.2);
        group.add(rope);

        const hook = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.45, 0.65), this.materials.terracotta);
        hook.position.set(w / 2 - 6.5, 8.2, d / 2 - 1.2);
        group.add(hook);

        // Garis Kisi Scaffolding Proyek Luas
        const scafGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w - 0.6, 5.0, d - 0.6, 2, 2, 2));'''

if old_crane in content:
    content = content.replace(old_crane, new_crane)
    print("Replaced crane!")
else:
    print("WARNING: old_crane not found!")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Saved building_loader.js successfully!")

