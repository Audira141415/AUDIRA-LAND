import os

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
app_js_path = os.path.join(SCRAPED_DIR, "app.dbbd84e3f1.js")

with open(app_js_path, "r", encoding="utf-8", errors="ignore") as f:
    js = f.read()

pos = js.find("craneGeo=")
if pos != -1:
    print("craneGeo found at", pos)
    print(js[pos-50:pos+350])
else:
    print("craneGeo not found directly")


