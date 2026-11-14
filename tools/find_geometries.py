import os
import re

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
app_js_path = os.path.join(SCRAPED_DIR, "app.dbbd84e3f1.js")

with open(app_js_path, "r", encoding="utf-8", errors="ignore") as f:
    js = f.read()

# Search for BoxGeometry
for m in re.finditer(r'new THREE\.BoxGeometry', js):
    pos = m.start()
    print(f"BoxGeometry at {pos}:", js[pos-50:pos+200])
    print("="*40)

# Search for CylinderGeometry
for m in re.finditer(r'new THREE\.CylinderGeometry', js):
    pos = m.start()
    print(f"CylinderGeometry at {pos}:", js[pos-50:pos+200])
    print("="*40)


