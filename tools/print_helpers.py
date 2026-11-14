import os

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
helpers_path = os.path.join(SCRAPED_DIR, "netizenia_all_helpers.js")

with open(helpers_path, "r", encoding="utf-8", errors="ignore") as f:
    code = f.read()

print(code)

