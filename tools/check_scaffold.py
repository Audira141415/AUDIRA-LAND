import os

BLD_LOADER_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "src", "models", "building_loader.js")

with open(BLD_LOADER_PATH, "r", encoding="utf-8") as f:
    text = f.read()

idx = text.find("createConstructionScaffoldMesh(data) {")
print(text[idx:idx+2000])


