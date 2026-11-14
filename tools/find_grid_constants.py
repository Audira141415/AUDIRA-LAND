import os
import re

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
app_js_path = os.path.join(SCRAPED_DIR, "app.dbbd84e3f1.js")

with open(app_js_path, "r", encoding="utf-8", errors="ignore") as f:
    js = f.read()

# Search for T=
for m in re.finditer(r'\bT\s*=\s*([0-9.]+)', js):
    print(f"T= match at {m.start()}:", js[m.start()-20:m.start()+60])

# Search for N=
for m in re.finditer(r'\bN\s*=\s*([0-9]+)', js):
    print(f"N= match at {m.start()}:", js[m.start()-20:m.start()+60])

# Search for HALF=
for m in re.finditer(r'\bHALF\s*=\s*([0-9]+)', js):
    print(f"HALF= match at {m.start()}:", js[m.start()-20:m.start()+60])


