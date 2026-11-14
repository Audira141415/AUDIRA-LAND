import os
import re

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
app_js_path = os.path.join(SCRAPED_DIR, "app.dbbd84e3f1.js")

with open(app_js_path, "r", encoding="utf-8", errors="ignore") as f:
    js = f.read()

# Let's search for "BUILDINGS" in JS
print("--- SEARCH FOR BUILDINGS ---")
for m in re.finditer(r'BUILDINGS', js):
    start = max(0, m.start() - 100)
    end = min(len(js), m.end() + 200)
    print(js[start:end])
    print("="*60)
    break

# Let's search for "rumah"
print("\n--- SEARCH FOR 'rumah' CONTEXTS ---")
found_rumah = set()
for m in re.finditer(r'["\']([a-zA-Z0-9_\-\s]*rumah[a-zA-Z0-9_\-\s]*)["\']', js, re.IGNORECASE):
    found_rumah.add(m.group(1))
print("Rumah occurrences:", found_rumah)

# Let's search for "gedung"
found_gedung = set()
for m in re.finditer(r'["\']([a-zA-Z0-9_\-\s]*gedung[a-zA-Z0-9_\-\s]*)["\']', js, re.IGNORECASE):
    found_gedung.add(m.group(1))
print("Gedung occurrences:", found_gedung)

# Let's search for all mesh creation or model creation in Three.js
print("\n--- SEARCH FOR MESH CREATION & PROCEDURAL GENERATORS ---")
for m in re.finditer(r'(function\s+([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*\{[^{}]*(?:THREE|Mesh|Group)[^}]*\})', js):
    print("Function:", m.group(2))
    print(m.group(1)[:300])
    print("-" * 40)

# Let's search for Object definitions with icon/cost/name or similar
print("\n--- SEARCH FOR BUILDING ARRAYS/OBJECTS ---")
matches = re.finditer(r'\{[^{}]*name\s*:\s*["\'][^"\']+["\'][^{}]*(?:cost|price|income|tipe|type|category)[^{}]*\}', js, re.IGNORECASE)
for idx, m in enumerate(matches):
    if idx < 15:
        print(f"Building/Item {idx}:", m.group(0))


