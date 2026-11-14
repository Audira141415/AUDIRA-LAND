import os
import json
import re

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
buildings_json_path = os.path.join(SCRAPED_DIR, "all_extracted_buildings.json")

with open(buildings_json_path, "r", encoding="utf-8") as f:
    buildings = json.load(f)

print(f"Loaded {len(buildings)} buildings from JSON.")

# Let's inspect the code of each building and check if there are any undefined globals or variables
# Expected inputs to building.m: (a, t, o, n, e, s, r, l, i)
# Where in Netizenia:
# a = width in world units (w * T - 0.8)
# t = depth in world units (h * T - 0.8)
# o = aksen color
# n = wall color
# e = ? (extra / floor)
# s = floors (e.g. 3, 5, 8)
# r = zone (e.g. "KOTA", "KAMPUNG", "CBD")
# l = roof color (e.g. genteng color)
# i = context object { adj: {}, lw, lh, floors, zone, seed }

print("All 36 keys:", list(buildings.keys()))

