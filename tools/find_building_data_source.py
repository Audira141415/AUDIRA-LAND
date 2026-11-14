import os
import re

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
app_js_path = os.path.join(SCRAPED_DIR, "app.dbbd84e3f1.js")

with open(app_js_path, "r", encoding="utf-8", errors="ignore") as f:
    js = f.read()

# Let's search for supabase queries: .from("...") or .from('...')
from_matches = re.findall(r'\.from\([\'"]([^\'"]+)[\'"]\)', js)
print("Supabase tables accessed with .from():", set(from_matches))

# Let's search for how buildings are fetched or loaded
print("\n--- Search for 'buildings' or 'bld' query in js ---")
for m in re.finditer(r'\.from\([\'"]buildings[\'"]\)[^;]+', js):
    print(m.group(0)[:300])
    print("="*50)

# Let's also check if there is an initial snapshot, static json, or default lots
print("\n--- Search for fetch() calls ---")
fetches = re.findall(r'fetch\([\'"]([^\'"]+)[\'"]\)', js)
print("Fetch calls with string URLs:", set(fetches))

# Also search for fetch with variables or endpoints
for m in re.finditer(r'fetch\([^)]+\)', js):
    print(m.group(0)[:150])
    print("-" * 30)


