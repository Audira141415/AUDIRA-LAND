import json

T = 8.0
HALF = 108

# Load raw Supabase live buildings
with open('F:/AUDIRA-INTEGRASI-BLEDER-ROBLOX/AUDIRA-LAND/tools/scraped_netizenia/live_get_buildings.json', 'r', encoding='utf-8') as f:
    raw = json.load(f)

print(f"Loaded {len(raw)} raw buildings from Supabase live dump.")

processed = []
for b in raw:
    b_id = b.get('id')
    b_type = b.get('type', 'rumah')
    b_stage = b.get('stage', 'jadi')
    b_title = b.get('title') or b_type.replace('_', ' ').title()
    b_i = b.get('i', 108)
    b_j = b.get('j', 108)
    b_w = b.get('w', 1)
    b_h = b.get('h', 1)
    b_facing = b.get('facing', 0)
    b_floors = b.get('floors', 1)
    b_zone = b.get('zone', 'KOTA')
    b_owner_name = b.get('owner_name', 'Warga')
    b_owner_kind = b.get('owner_kind', 'warga')
    b_owner_color = b.get('owner_color', None)
    b_progress = b.get('progress', 1.0)
    
    # 1:1 Mathematical Center in 8-meter tile space
    min_x = (b_i - HALF) * T
    max_x = min_x + b_w * T
    center_x = (min_x + max_x) / 2.0

    min_z = (b_j - HALF) * T
    max_z = min_z + b_h * T
    center_z = (min_z + max_z) / 2.0

    processed.append({
        "id": f"net-{b_id}",
        "net_id": b_id,
        "type": b_type,
        "title": b_title,
        "district_key": "k12",
        "grid_i": b_i,
        "grid_j": b_j,
        "width": b_w,
        "height": b_h,
        "stage": b_stage,
        "floors": b_floors,
        "facing": b_facing,
        "zone": b_zone,
        "owner_name": b_owner_name,
        "owner_kind": b_owner_kind,
        "owner_color": b_owner_color,
        "progress": b_progress,
        "worldX": round(center_x, 3),
        "worldZ": round(center_z, 3),
        "is_public": True
    })

# Save to web/data/live_buildings.json and web/public/data/live_buildings.json
for out_path in [
    'F:/AUDIRA-INTEGRASI-BLEDER-ROBLOX/AUDIRA-LAND/web/data/live_buildings.json',
    'F:/AUDIRA-INTEGRASI-BLEDER-ROBLOX/AUDIRA-LAND/web/public/data/live_buildings.json'
]:
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(processed, f, indent=2, ensure_ascii=False)

print(f"Successfully generated {len(processed)} live buildings with 1:1 true scale (T = 8.0)!")
