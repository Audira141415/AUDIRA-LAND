import json

with open("F:/AUDIRA-INTEGRASI-BLEDER-ROBLOX/AUDIRA-LAND/web/data/live_buildings.json", "r", encoding="utf-8") as f:
    buildings = json.load(f)

types_in_live = set(b["type"] for b in buildings)
print(f"Total unique building types in live data: {len(types_in_live)}")
print("Types:", sorted(types_in_live))

stages_in_live = set(b["stage"] for b in buildings)
print("Stages:", sorted(stages_in_live))

