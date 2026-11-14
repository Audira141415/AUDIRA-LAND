import os
import re

BLD_LOADER_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "src", "models", "building_loader.js")

with open(BLD_LOADER_PATH, "r", encoding="utf-8") as f:
    code = f.read()

# 1. Add import of netizenia_catalog.js if not present
if "netizenia_catalog.js" not in code:
    code = code.replace(
        "import { PALETTE, GRID_CONFIG } from '../core/constants.js';",
        "import { PALETTE, GRID_CONFIG } from '../core/constants.js';\nimport { NETIZENIA_BUILDINGS, createNetizeniaBuilding } from './netizenia_catalog.js';"
    )

# 2. Update createBuildingMeshByType
old_create = """    createBuildingMeshByType(type) {
        switch (type) {
            case 'balai_kota':
                return this.createBalaiKotaMesh();
            case 'warung_madura':
                return this.createWarungMaduraMesh();
            case 'taman_surya':
                return this.createTamanSuryaMesh();
            case 'pos_ronda':
                return this.createPosRondaMesh();
            case 'rumah_limas':
                return this.createRumahLimasMesh();
            case 'warung_kopi':
                return this.createWarungKopiMesh();
            case 'kebun_sayur':
                return this.createKebunSayurMesh();
            case 'saung_bambu':
                return this.createSaungBambuMesh();
            default:
                return this.createDefaultBuildingMesh(type);
        }
    }"""

new_create = """    createBuildingMeshByType(type) {
        // 1. Heritage Craftsman Models (Otentik Nusantara Bertingkat)
        switch (type) {
            case 'balai_kota':
                return this.createBalaiKotaMesh();
            case 'warung_madura':
                return this.createWarungMaduraMesh();
            case 'taman_surya':
                return this.createTamanSuryaMesh();
            case 'pos_ronda':
                return this.createPosRondaMesh();
            case 'rumah_limas':
                return this.createRumahLimasMesh();
            case 'warung_kopi':
                return this.createWarungKopiMesh();
            case 'kebun_sayur':
                return this.createKebunSayurMesh();
            case 'saung_bambu':
                return this.createSaungBambuMesh();
        }

        // 2. Netizenia Architecture Catalog (36 Tipe Prosedural Lengkap)
        if (typeof NETIZENIA_BUILDINGS !== 'undefined' && NETIZENIA_BUILDINGS[type]) {
            return createNetizeniaBuilding(type);
        }

        // 3. Fallback
        if (typeof createNetizeniaBuilding === 'function') {
            return createNetizeniaBuilding('rumah');
        }
        return this.createDefaultBuildingMesh(type);
    }"""

if old_create in code:
    code = code.replace(old_create, new_create)
    print("Updated createBuildingMeshByType successfully!")
else:
    print("Warning: old_create pattern not matched!")

# 3. Read meta entries from building_meta_entries.js
META_PATH = os.path.join(os.path.dirname(__file__), "scraped_netizenia", "building_meta_entries.js")
with open(META_PATH, "r", encoding="utf-8") as f:
    meta_entries_code = f.read()

# Replace metaCatalog definition
meta_search = "        const metaCatalog = {\n            balai_kota: {"
if meta_search in code:
    idx = code.find(meta_search)
    end_idx = code.find("        };\n\n        return metaCatalog[type]", idx)
    if end_idx != -1:
        heritage_block = code[idx:end_idx]
        new_meta_catalog = heritage_block + ",\n\n            // --- 36 Model Scraped Republik Netizenia v2 ---\n" + meta_entries_code
        code = code[:idx] + new_meta_catalog + code[end_idx:]
        print("Updated metaCatalog with 36 buildings successfully!")

with open(BLD_LOADER_PATH, "w", encoding="utf-8") as f:
    f.write(code)

print("Saved updated building_loader.js!")

