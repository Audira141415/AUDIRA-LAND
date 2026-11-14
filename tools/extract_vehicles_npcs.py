import os

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
app_js_path = os.path.join(SCRAPED_DIR, "app.dbbd84e3f1.js")

with open(app_js_path, "r", encoding="utf-8", errors="ignore") as f:
    js = f.read()

# Let's inspect vehicles section between index 330500 and 333000
veh_chunk = js[330500:333000]
out_path = os.path.join(SCRAPED_DIR, "netizenia_vehicles.js")
with open(out_path, "w", encoding="utf-8") as f:
    f.write(veh_chunk)

print("Vehicles chunk saved.")

# Also let's inspect NPCs section between index 329000 and 330500
npc_chunk = js[329000:330500]
out_npc = os.path.join(SCRAPED_DIR, "netizenia_npcs.js")
with open(out_npc, "w", encoding="utf-8") as f:
    f.write(npc_chunk)

print("NPCs chunk saved.")


