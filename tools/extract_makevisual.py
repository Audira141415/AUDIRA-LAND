import os
import re

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
app_js_path = os.path.join(SCRAPED_DIR, "app.dbbd84e3f1.js")

with open(app_js_path, "r", encoding="utf-8", errors="ignore") as f:
    js = f.read()

# Locate makeVisual function
mv_pos = js.find("function makeVisual(")
if mv_pos != -1:
    print("Found makeVisual at index", mv_pos)
    snippet = js[mv_pos:mv_pos+8000]
    out_path = os.path.join(SCRAPED_DIR, "makeVisual_full.js")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(snippet)
    print(f"Saved makeVisual snippet to {out_path}")
else:
    print("makeVisual not found directly")

# Let's also look for all building types and categories in the code
# Search for array of building types or definitions
# Let's search for "types" or "TYPES" or "categories" or "CAT"
types_pattern = re.findall(r'(\b[a-zA-Z0-9_$]+\s*=\s*\{\s*["\']?(?:rumah|warung|kantor|taman|pabrik|jalan|hospital|sekolah)[^}]+\})', js, re.IGNORECASE)
print(f"Types dictionary patterns found: {len(types_pattern)}")
for tp in types_pattern[:5]:
    print(tp[:200])
    print("="*40)

# Also let's inspect the entire list of building definitions in JS
# Let's search for "catOf" or "BUILDING_TYPES" or "buildingTypes"
cat_pos = js.find("function catOf(")
if cat_pos != -1:
    print("Found catOf at index", cat_pos)
    print(js[cat_pos:cat_pos+1000])


