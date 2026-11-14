import os
import re
import urllib.request
import json

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
app_js_path = os.path.join(SCRAPED_DIR, "app.dbbd84e3f1.js")

with open(app_js_path, "r", encoding="utf-8", errors="ignore") as f:
    js = f.read()

# 1. Search for LEGACY definition
leg_idx = js.find("LEGACY=[")
if leg_idx != -1:
    print(f"Found LEGACY=[ at {leg_idx}")
    end_leg = js.find("];", leg_idx)
    legacy_str = js[leg_idx:end_leg+2]
    out_leg = os.path.join(SCRAPED_DIR, "legacy_buildings.js")
    with open(out_leg, "w", encoding="utf-8") as f:
        f.write(legacy_str)
    print(f"Saved LEGACY ({len(legacy_str)} bytes) to {out_leg}")
    print("Snippet:", legacy_str[:400])

# 2. Search for how snapshot or buildings are loaded when connected
for m in re.finditer(r'supabase\s*\.\s*rpc\s*\(\s*[\'"]([^\'"]+)[\'"]', js):
    print("Found supabase.rpc:", m.group(1))

# 3. Search for .from(
for m in re.finditer(r'\.from\s*\(\s*[\'"]([^\'"]+)[\'"]', js):
    print("Found .from:", m.group(1))

# Let's inspect what RPC functions exist in supabase
# CFG.url: "https://bwubqnfvdxwhwwiibdzv.supabase.co"
# CFG.key: "sb_publishable_cn9p-oE4k2FM9pdqF_tbcg_i0wqTWos"

SUPABASE_URL = "https://bwubqnfvdxwhwwiibdzv.supabase.co"
API_KEY = "sb_publishable_cn9p-oE4k2FM9pdqF_tbcg_i0wqTWos"

print("\n--- Testing Supabase API Endpoints ---")
# Try getting snapshot or buildings from live Supabase
headers = {
    "apikey": API_KEY,
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# Let's try RPC calls commonly used: get_city_snapshot, get_buildings, snapshot, etc.
candidates = ["get_city_snapshot", "snapshot", "get_buildings", "city_snapshot", "get_map"]
for cand in candidates:
    url = f"{SUPABASE_URL}/rest/v1/rpc/{cand}"
    req = urllib.request.Request(url, data=b"{}", headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            data = resp.read()
            print(f"[SUCCESS] RPC {cand}: returned {len(data)} bytes")
            with open(os.path.join(SCRAPED_DIR, f"live_{cand}.json"), "wb") as out_f:
                out_f.write(data)
    except Exception as e:
        print(f"[FAIL] RPC {cand}: {e}")


