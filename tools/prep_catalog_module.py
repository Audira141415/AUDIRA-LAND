import os
import re

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
cat_file = os.path.join(SCRAPED_DIR, "netizenia_cat_full.js")

with open(cat_file, "r", encoding="utf-8", errors="ignore") as f:
    cat_code = f.read()

# Let's write an exporter that compiles all 36 building generators and helper functions into an ES module for AUDIRA-LAND!
# We can create a dedicated file: `AUDIRA-LAND/web/src/models/netizenia_catalog.js`

out_catalog_path = os.path.join(os.path.dirname(__file__), "..", "web", "src", "models", "netizenia_catalog.js")

# Let's inspect the entire helpers section in `netizenia_all_helpers.js`
helpers_path = os.path.join(SCRAPED_DIR, "netizenia_all_helpers.js")
with open(helpers_path, "r", encoding="utf-8") as f:
    helpers_code = f.read()

print("Helpers code length:", len(helpers_code))
print("CAT code length:", len(cat_code))


