import os
import json
from collections import Counter

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
buildings_json_path = os.path.join(SCRAPED_DIR, "live_get_buildings.json")

with open(buildings_json_path, "r", encoding="utf-8") as f:
    buildings = json.load(f)

print(f"Total live buildings: {len(buildings)}")

type_counts = Counter(b.get("type") for b in buildings)
print("\n--- Buildings by Type ---")
for t, c in type_counts.most_common():
    print(f"  {t:15s}: {c:3d}")

dist_counts = Counter(b.get("d") for b in buildings)
print("\n--- Buildings by District ---")
for d, c in sorted(dist_counts.items()):
    print(f"  {d:5s}: {c:3d}")

stage_counts = Counter(b.get("stage") for b in buildings)
print("\n--- Buildings by Stage ---")
for s, c in stage_counts.most_common():
    print(f"  {s:15s}: {c:3d}")


