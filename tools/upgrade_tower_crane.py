import os

BLD_LOADER_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "src", "models", "building_loader.js")

with open(BLD_LOADER_PATH, "r", encoding="utf-8") as f:
    text = f.read()

# Replace the wooden pulley with full yellow tower crane
old_pulley = """        // 4. Derek Katrol Kayu & Ember Batu Semen
        const craneMast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6), this.materials.teak);
        craneMast.position.set(0.7, 2.6, 0.7);
        group.add(craneMast);

        const craneBoom = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.07, 0.07), this.materials.teak);
        craneBoom.position.set(0.2, 3.4, 0.7);
        group.add(craneBoom);

        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.1, 4), this.materials.ink);
        rope.position.set(-0.35, 2.85, 0.7);
        group.add(rope);

        const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.22, 8), this.materials.ironDark);
        bucket.position.set(-0.35, 2.2, 0.7);
        group.add(bucket);"""

new_tower_crane = """        // 4. Derek Tower Crane Kuning Khas Proyek Konstruksi Netizenia v2
        const craneYellowMat = new THREE.MeshLambertMaterial({ color: 0xC2913A, roughness: 0.5 });
        const craneDarkMat = new THREE.MeshLambertMaterial({ color: 0x334155, roughness: 0.6 });

        // Tiang Utama Tower Crane Vertikal (Tinggi 6.8m)
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
        const scafGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(2.4, 3.2, 2.4, 2, 2, 2));
        const scafLineMat = new THREE.LineBasicMaterial({ color: 0xC2913A, transparent: true, opacity: 0.5 });
        const scafLines = new THREE.LineSegments(scafGeo, scafLineMat);
        scafLines.position.y = 1.6;
        group.add(scafLines);"""

if old_pulley in text:
    text = text.replace(old_pulley, new_tower_crane)
    print("Replaced crane with full yellow tower crane successfully!")
else:
    print("Warning: old_pulley block not matched!")

with open(BLD_LOADER_PATH, "w", encoding="utf-8") as f:
    f.write(text)

print("Saved building_loader.js!")

