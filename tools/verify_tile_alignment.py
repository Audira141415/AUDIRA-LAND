import json

T = 8.0
HALF = 108

with open('F:/AUDIRA-INTEGRASI-BLEDER-ROBLOX/AUDIRA-LAND/web/data/live_buildings.json', 'r', encoding='utf-8') as f:
    bldgs = json.load(f)

for b in bldgs[:10]:
    i, j, w, h = b['grid_i'], b['grid_j'], b['width'], b['height']
    min_x = (i - HALF) * T
    max_x = min_x + w * T
    center_x = (min_x + max_x) / 2.0
    min_z = (j - HALF) * T
    max_z = min_z + h * T
    center_z = (min_z + max_z) / 2.0
    print(f"{b['id']}: {b['type']} ({w}x{h}) @ tile [{i},{j}] -> X: [{min_x:.1f} .. {max_x:.1f}], center=({center_x:.1f}, {center_z:.1f})")
