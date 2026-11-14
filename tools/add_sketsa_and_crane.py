import os

BLD_LOADER_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "src", "models", "building_loader.js")

with open(BLD_LOADER_PATH, "r", encoding="utf-8") as f:
    code = f.read()

# 1. Update addBuilding to handle 'sketsa'
old_add = """        if (data.stage === 'proyek') {
            const res = this.createConstructionScaffoldMesh(data);
            mesh = res.group;
            billboardObj = res;
        } else {
            mesh = this.createBuildingMeshByType(data.type);
        }"""

new_add = """        if (data.stage === 'proyek' || data.stage === 'bangun') {
            const res = this.createConstructionScaffoldMesh(data);
            mesh = res.group;
            billboardObj = res;
        } else if (data.stage === 'sketsa') {
            mesh = this.createSketsaMesh(data);
        } else {
            mesh = this.createBuildingMeshByType(data.type);
        }"""

if old_add in code:
    code = code.replace(old_add, new_add)
    print("Replaced stage routing in addBuilding successfully!")
else:
    print("Warning: old_add not found directly, let's search for partial match...")
    if "data.stage === 'proyek'" in code:
        idx = code.find("if (data.stage === 'proyek')")
        end_idx = code.find("mesh = this.createBuildingMeshByType(data.type);", idx) + len("mesh = this.createBuildingMeshByType(data.type);")
        # find closing bracket
        end_bracket = code.find("}", end_idx) + 1
        code = code[:idx] + new_add + code[end_bracket:]
        print("Replaced stage routing via index successfully!")

# 2. Add createSketsaMesh and enhanced tower crane in createConstructionScaffoldMesh
sketsa_and_crane_code = """
    // =========================================================================
    // MODEL KAVLING CADANGAN / RANCANGAN SKETSA (BLUE WIREFRAME BLUEPRINT)
    // =========================================================================
    createSketsaMesh(data) {
        const group = new THREE.Group();
        group.name = `sketsa_${data.id}`;

        const w = (data.width || 1) * 2.7;
        const d = (data.height || 1) * 2.7;
        const h = 2.4;

        // Garis Wireframe Biru Cetak Biru (Blueprint Blueprint Box)
        const boxGeo = new THREE.BoxGeometry(w, h, d);
        const edgesGeo = new THREE.EdgesGeometry(boxGeo);
        const lineMat = new THREE.LineBasicMaterial({
            color: 0x3B82F6,
            transparent: true,
            opacity: 0.75,
            linewidth: 2
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
"""

if "createSketsaMesh(data)" not in code:
    code = code.replace(
        "    createConstructionScaffoldMesh(data) {",
        sketsa_and_crane_code + "\n    createConstructionScaffoldMesh(data) {"
    )
    print("Added createSketsaMesh successfully!")

with open(BLD_LOADER_PATH, "w", encoding="utf-8") as f:
    f.write(code)

print("Saved updated building_loader.js!")

