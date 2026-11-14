import os
import json
import re

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
buildings_json_path = os.path.join(SCRAPED_DIR, "all_extracted_buildings.json")

with open(buildings_json_path, "r", encoding="utf-8") as f:
    buildings = json.load(f)

print(f"Loaded {len(buildings)} buildings.")

# Let's inspect the exact text of some buildings to see formatting
for k in ["rumah", "warung", "istana"]:
    print(f"=== {k} ===")
    print(buildings[k][:200])


