import os
import re

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
app_js_path = os.path.join(SCRAPED_DIR, "app.dbbd84e3f1.js")

with open(app_js_path, "r", encoding="utf-8", errors="ignore") as f:
    js = f.read()

# Let's extract the geometry helper section from around index 8000 to 11500
start_idx = js.find("box=")
if start_idx != -1:
    section_start = max(0, start_idx - 500)
    section_end = js.find("CAT={")
    print(f"Geometry primitives section from {section_start} to {section_end}")
    primitives_code = js[section_start:section_end]
    
    out_prim = os.path.join(SCRAPED_DIR, "netizenia_primitives.js")
    with open(out_prim, "w", encoding="utf-8") as f:
        f.write(primitives_code)
    print(f"Saved primitives code ({len(primitives_code)} chars) to {out_prim}")

# Also let's find how array P is converted into Three.js meshes
# Let's search for "P=" or "for(const" or "makeVisual"
mv_idx = js.find("function makeVisual(")
if mv_idx != -1:
    mv_section = js[mv_idx:mv_idx+6000]
    out_mv = os.path.join(SCRAPED_DIR, "makeVisual_detailed.js")
    with open(out_mv, "w", encoding="utf-8") as f:
        f.write(mv_section)
    print(f"Saved detailed makeVisual to {out_mv}")

# Also search for where P is processed into geometries
for m in re.finditer(r'P\s*=\s*\[\]', js):
    idx = m.start()
    print(f"P=[] at {idx}: {js[idx:idx+300]}")
    print("="*50)

