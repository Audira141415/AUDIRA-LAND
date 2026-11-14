import os
import re

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
app_js_path = os.path.join(SCRAPED_DIR, "app.dbbd84e3f1.js")

with open(app_js_path, "r", encoding="utf-8", errors="ignore") as f:
    js = f.read()

# Find merge function
idx = js.find("function merge(")
if idx != -1:
    print(f"Found merge at {idx}:")
    print(js[idx:idx+2500])
    out_merge = os.path.join(SCRAPED_DIR, "netizenia_merge.js")
    with open(out_merge, "w", encoding="utf-8") as f:
        f.write(js[idx:idx+3500])
else:
    print("merge function not found directly as 'function merge('")
    # let's search for "const merge=" or "var merge="
    for m in re.finditer(r'(?:const|let|var)\s+merge\s*=', js):
        pos = m.start()
        print(f"merge var at {pos}:", js[pos:pos+2000])

# Find PAL definition
for m in re.finditer(r'PAL\s*=\s*\{', js):
    pos = m.start()
    print(f"PAL at {pos}:", js[pos:pos+1500])

# Find GENTENG, ZONE_BASE, AKSEN
for name in ["GENTENG", "ZONE_BASE", "AKSEN", "ROADP", "LANTAI", "PINTU_W"]:
    for m in re.finditer(rf'{name}\s*=', js):
        pos = m.start()
        print(f"{name} at {pos}:", js[pos:pos+300])


