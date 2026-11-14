import os

BLD_LOADER_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "src", "models", "building_loader.js")

with open(BLD_LOADER_PATH, "r", encoding="utf-8") as f:
    text = f.read()

target = "    createConstructionScaffoldMesh(data) {"

sketsa_method = """    // =========================================================================
    // MODEL KAVLING RANCANGAN SKETSA (BLUEPRINT BLUE WIREFRAME BOX)
    // =========================================================================
    createSketsaMesh(data) {
        const group = new THREE.Group();
        group.name = `sketsa_${data.id}`;

        const w = (data.width || 1) * 2.7;
        const d = (data.height || 1) * 2.7;
        const h = 2.4;

        // Garis Wireframe Biru Cetak Biru (Blueprint Box)
        const boxGeo = new THREE.BoxGeometry(w, h, d);
        const edgesGeo = new THREE.EdgesGeometry(boxGeo);
        const lineMat = new THREE.LineBasicMaterial({
            color: 0x3B82F6,
            transparent: true,
            opacity: 0.75
        });
        const wireframe = new THREE.LineSegments(edgesGeo, lineMat);
        wireframe.position.y = h / 2 + 0.02;
        group.add(wireframe);

        // Bantalan Alas Transparan Biru Lembut
        const padGeo = new THREE.BoxGeometry(w, 0.05, d);
        const padMat = new THREE.MeshBasicMaterial({
            color: 0x60A5FA,
            transparent: true,
            opacity: 0.22,
            depthWrite: false
        });
        const pad = new THREE.Mesh(padGeo, padMat);
        pad.position.y = 0.025;
        group.add(pad);

        return group;
    }

    createConstructionScaffoldMesh(data) {"""

if target in text:
    text = text.replace(target, sketsa_method)
    print("Inserted createSketsaMesh successfully!")
else:
    print("Warning: target not found!")

with open(BLD_LOADER_PATH, "w", encoding="utf-8") as f:
    f.write(text)

print("Saved building_loader.js!")

