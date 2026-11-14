import os
import json

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
snap_path = os.path.join(SCRAPED_DIR, "live_get_city_snapshot.json")

with open(snap_path, "r", encoding="utf-8") as f:
    snap = json.load(f)

print("Kas:", snap.get("kas"))
print("News sample:", snap.get("news")[:3])
print("Donations sample:", snap.get("donations")[:3])


