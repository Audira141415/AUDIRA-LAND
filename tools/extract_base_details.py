import os

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
app_js_path = os.path.join(SCRAPED_DIR, "app.dbbd84e3f1.js")

with open(app_js_path, "r", encoding="utf-8", errors="ignore") as f:
    js = f.read()

# Extract from index 271500 to 276000
chunk = js[271500:276000]
out_file = os.path.join(SCRAPED_DIR, "base_and_merge_full.js")
with open(out_file, "w", encoding="utf-8") as f:
    f.write(chunk)
print(f"Saved base_and_merge_full.js ({len(chunk)} chars)")


