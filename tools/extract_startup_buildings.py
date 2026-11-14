import os

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
app_js_path = os.path.join(SCRAPED_DIR, "app.dbbd84e3f1.js")

with open(app_js_path, "r", encoding="utf-8", errors="ignore") as f:
    js = f.read()

snippet = js[365000:368500]
out_path = os.path.join(SCRAPED_DIR, "startup_buildings_snippet.js")
with open(out_path, "w", encoding="utf-8") as f:
    f.write(snippet)

print("Startup snippet saved. Length:", len(snippet))
print(snippet[:1500])


