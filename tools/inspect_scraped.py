import os
import re
import json

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
app_js_path = os.path.join(SCRAPED_DIR, "app.dbbd84e3f1.js")
index_html_path = os.path.join(SCRAPED_DIR, "index.html")

print("Analyzing app.dbbd84e3f1.js ...")
with open(app_js_path, "r", encoding="utf-8", errors="ignore") as f:
    js_content = f.read()

print(f"File size: {len(js_content)} chars")

# Let's search for keywords related to buildings, models, meshes, types
keywords = [
    "building", "house", "gedung", "rumah", "warung", "balai", "kantor",
    "createBuilding", "makeBuilding", "buildMesh", "geometry", "BoxGeometry",
    "CylinderGeometry", "CATALOG", "BUILDINGS", "TYPES", "TIERS", "upgrade"
]

print("\n--- Keyword frequencies ---")
for kw in keywords:
    matches = len(re.findall(re.escape(kw), js_content, re.IGNORECASE))
    print(f"'{kw}': {matches}")

# Let's search for building definitions or catalogs
# E.g. arrays or objects defining buildings
# Look for patterns like building types, { id: '...', name: '...', ... }
matches = re.findall(r'(\b[a-zA-Z0-9_]*BUILDING[a-zA-Z0-9_]*\b)', js_content)
print(f"\nMatches for *BUILDING*: {set(matches[:20])}")

matches = re.findall(r'(\b[a-zA-Z0-9_]*CATALOG[a-zA-Z0-9_]*\b)', js_content)
print(f"Matches for *CATALOG*: {set(matches[:20])}")

# Let's search for functions that generate 3D models (Three.js Group, Mesh, etc.)
# Find occurrences of THREE.Group or new THREE.Mesh
model_funcs = re.findall(r'(function\s+([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*\{[^}]*new THREE\.Group[^}]*\})', js_content)
print(f"Functions creating THREE.Group: {len(model_funcs)}")

# Write a tool to dump all building-related objects and function snippets to a text report
out_analysis = os.path.join(SCRAPED_DIR, "analysis_summary.txt")

with open(out_analysis, "w", encoding="utf-8") as out:
    out.write("=== REPUBLIK NETIZENIA V2 APP.JS ANALYSIS ===\n\n")
    # Search for building catalog array/object
    # Let's find patterns like: const BUILDINGS = ... or buildings: [...]
    catalog_matches = re.findall(r'([a-zA-Z0-9_$]+\s*=\s*\[\s*\{\s*id:\s*["\'][^"\']+["\'][^\]]+\])', js_content)
    out.write(f"Catalog Array Matches ({len(catalog_matches)}):\n")
    for cm in catalog_matches:
        out.write(cm[:500] + "\n---\n")

print(f"Done initial scan. Saved to {out_analysis}")

