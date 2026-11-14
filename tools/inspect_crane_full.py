import os
import re

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
app_js_path = os.path.join(SCRAPED_DIR, "app.dbbd84e3f1.js")

with open(app_js_path, "r", encoding="utf-8", errors="ignore") as f:
    js = f.read()

# Let's see the craneGeo definition and how it is added in Netizenia
pos = js.find("craneGeo=")
print("Snippet around craneGeo:")
print(js[pos:pos+700])

# Also find where crane is added:
crane_uses = [m.start() for m in re.finditer(r'craneGeo', js)]
print(f"craneGeo used at positions: {crane_uses}")
for p in crane_uses:
    print(js[p-50:p+150])
    print("-" * 30)

