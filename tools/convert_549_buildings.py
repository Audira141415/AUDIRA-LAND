import os
import json

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
buildings_json_path = os.path.join(SCRAPED_DIR, "live_get_buildings.json")
web_data_dir = os.path.join(os.path.dirname(__file__), "..", "web", "public", "data")
os.makedirs(web_data_dir, exist_ok=True)

with open(buildings_json_path, "r", encoding="utf-8") as f:
    raw_buildings = json.load(f)

print(f"Loaded {len(raw_buildings)} raw live buildings from Netizenia.")

# Netizenia Grid Constants
HALF = 108
T_NETIZENIA = 8.0

# AUDIRA-LAND Scale Factor
# We scale both the world coordinates and building meshes so that 1 Netizenia lot (8m) maps to AUDIRA cell (3.1m spacing)
SCALE = 3.1 / T_NETIZENIA  # 3.1 / 8.0 = 0.3875

processed = []
for b in raw_buildings:
    w = b.get("w", 1)
    h = b.get("h", 1)
    i = b.get("i", 108)
    j = b.get("j", 108)
    
    # Calculate Netizenia center
    net_x = (i - HALF) * T_NETIZENIA + (w - 1) * T_NETIZENIA / 2.0
    net_z = (j - HALF) * T_NETIZENIA + (h - 1) * T_NETIZENIA / 2.0
    
    # Scale to AUDIRA-LAND world coordinates
    audira_x = round(net_x * SCALE, 3)
    audira_z = round(net_z * SCALE, 3)
    
    # Clean label
    label = b.get("label") or b.get("type", "Bangunan")
    owner_name = b.get("owner") or ("Negara" if b.get("owner_kind") == "negara" else "Warga")
    
    stage = b.get("stage", "jadi")
    if stage not in ["jadi", "bangun", "sketsa"]:
        stage = "jadi"
    
    item = {
        "id": f"net-{b['id']}",
        "net_id": b["id"],
        "type": b.get("type", "rumah"),
        "title": label,
        "district_key": b.get("d", "k12"),
        "grid_i": i,
        "grid_j": j,
        "width": w,
        "height": h,
        "stage": stage,
        "floors": b.get("floors", 1),
        "facing": b.get("facing", 0),
        "zone": b.get("zone", "KOTA"),
        "owner_name": owner_name,
        "owner_kind": b.get("owner_kind", "pribadi"),
        "owner_color": b.get("owner_color"),
        "progress": b.get("progress", 1.0),
        "worldX": audira_x,
        "worldZ": audira_z,
        "is_public": b.get("owner_kind") == "negara"
    }
    processed.append(item)

out_file = os.path.join(web_data_dir, "live_buildings.json")
with open(out_file, "w", encoding="utf-8") as f:
    json.dump(processed, f, indent=2)

print(f"Saved {len(processed)} processed buildings to {out_file} ({os.path.getsize(out_file)} bytes)!")

# Also copy live_get_city_snapshot.json to public/data/
snap_src = os.path.join(SCRAPED_DIR, "live_get_city_snapshot.json")
snap_dst = os.path.join(web_data_dir, "city_snapshot.json")
with open(snap_src, "r", encoding="utf-8") as f_in:
    snap_data = json.load(f_in)
with open(snap_dst, "w", encoding="utf-8") as f_out:
    json.dump(snap_data, f_out, indent=2)
print(f"Saved live city snapshot to {snap_dst} ({os.path.getsize(snap_dst)} bytes)!")


