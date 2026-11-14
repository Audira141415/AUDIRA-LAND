import os
import re

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
app_js_path = os.path.join(SCRAPED_DIR, "app.dbbd84e3f1.js")

with open(app_js_path, "r", encoding="utf-8", errors="ignore") as f:
    js = f.read()

# Find BASE definition
for m in re.finditer(r'BASE\s*=\s*\{', js):
    pos = m.start()
    print(f"BASE at {pos}:", js[pos:pos+1500])

# Also let's extract all window, door, fence, awning, stairs, props helpers between index 8000 and 11500
out_helpers = os.path.join(SCRAPED_DIR, "netizenia_all_helpers.js")
with open(out_helpers, "w", encoding="utf-8") as f:
    f.write(js[8000:11300])
print(f"Saved all helpers (3300 chars) to {out_helpers}")


