import os
import json

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
buildings_json_path = os.path.join(SCRAPED_DIR, "live_get_buildings.json")

with open(buildings_json_path, "r", encoding="utf-8") as f:
    buildings = json.load(f)

i_vals = [b["i"] for b in buildings]
j_vals = [b["j"] for b in buildings]

print(f"Min i: {min(i_vals)}, Max i: {max(i_vals)}, Delta i: {max(i_vals) - min(i_vals)}")
print(f"Min j: {min(j_vals)}, Max j: {max(j_vals)}, Delta j: {max(j_vals) - min(j_vals)}")

# Center around 108
x_offsets = [(b["i"] - 108) for b in buildings]
z_offsets = [(b["j"] - 108) for b in buildings]
print(f"X offset range: {min(x_offsets)} to {max(x_offsets)}")
print(f"Z offset range: {min(z_offsets)} to {max(z_offsets)}")


