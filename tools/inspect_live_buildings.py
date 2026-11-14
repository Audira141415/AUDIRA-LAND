import os
import json

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
buildings_json_path = os.path.join(SCRAPED_DIR, "live_get_buildings.json")

with open(buildings_json_path, "r", encoding="utf-8") as f:
    data = json.load(f)

print(f"Type of data: {type(data)}")
if isinstance(data, list):
    print(f"Total live buildings in Netizenia: {len(data)}")
    print("\nSample 5 buildings:")
    for b in data[:5]:
        print(" ", b)
elif isinstance(data, dict):
    print("Keys in dictionary:", list(data.keys()))
    if "buildings" in data:
        print(f"Total buildings in dict: {len(data['buildings'])}")
        print("\nSample 5 buildings:")
        for b in data['buildings'][:5]:
            print(" ", b)

# Let's inspect city snapshot too
snapshot_path = os.path.join(SCRAPED_DIR, "live_get_city_snapshot.json")
with open(snapshot_path, "r", encoding="utf-8") as f:
    snap = json.load(f)
print("\nSnapshot keys:", list(snap.keys()) if isinstance(snap, dict) else len(snap))
if isinstance(snap, dict):
    for k in snap:
        val = snap[k]
        print(f"  - {k}: {type(val)} ({len(val) if hasattr(val, '__len__') else val})")


