import os

MAIN_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "src", "main.js")

with open(MAIN_PATH, "r", encoding="utf-8") as f:
    code = f.read()

# 1. Add import
if "traffic_system.js" not in code:
    code = code.replace(
        "import { BuildingLoader } from './models/building_loader.js';",
        "import { BuildingLoader } from './models/building_loader.js';\nimport { TrafficSystem } from './models/traffic_system.js';"
    )

# 2. Add instantiation in constructor
if "this.traffic =" not in code:
    code = code.replace(
        "this.buildingLoader = new BuildingLoader(this.scene,",
        "this.traffic = new TrafficSystem(this.scene);\n\n        this.buildingLoader = new BuildingLoader(this.scene,"
    )

# 3. Add update in animate
if "this.traffic.update(dt);" not in code:
    code = code.replace(
        "this.camera.update(dt);",
        "this.camera.update(dt);\n\n        // 1b. Update Simulasi Lalu Lintas Kendaraan\n        this.traffic.update(dt);"
    )

with open(MAIN_PATH, "w", encoding="utf-8") as f:
    f.write(code)

print("Updated main.js with TrafficSystem successfully!")

