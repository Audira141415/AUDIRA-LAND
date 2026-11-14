import os
import re
import json

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
cat_file = os.path.join(SCRAPED_DIR, "netizenia_cat_full.js")

with open(cat_file, "r", encoding="utf-8", errors="ignore") as f:
    cat_code = f.read()

# Let's inspect all keys and their m function bodies
keys = [
    "rumah", "rumah2", "kos", "warung", "kafe", "toko", "bengkel", "sawah",
    "kantor", "taman", "lapangan", "sekolah", "rs", "polisi", "penjara",
    "pasar", "ibadah", "pln", "stadion", "istana", "tugu", "mulyo", "posko",
    "bank", "barak", "waduk", "apartemen", "pabrik", "pkl", "ruko", "kebun",
    "terminal", "pangkalan", "proyek_gedung", "proyek_rumah", "lahan_material"
]

print(f"Total keys to extract: {len(keys)}")

# Let's extract each building's exact definition block
extracted_buildings = {}

for k in keys:
    # search for k: { ... }
    m = re.search(rf'\b{k}\s*:\s*\{{', cat_code)
    if not m:
        print(f"Warning: {k} not found!")
        continue
    start = m.start()
    
    # find closing bracket
    bracket_count = 0
    in_string = False
    quote_char = ''
    escape = False
    end = -1
    
    for i in range(m.end() - 1, len(cat_code)):
        ch = cat_code[i]
        if in_string:
            if escape:
                escape = False
            elif ch == '\\':
                escape = True
            elif ch == quote_char:
                in_string = False
        else:
            if ch in ('"', "'", '`'):
                in_string = True
                quote_char = ch
            elif ch == '{':
                bracket_count += 1
            elif ch == '}':
                bracket_count -= 1
                if bracket_count == 0:
                    end = i + 1
                    break
    
    if end != -1:
        block = cat_code[start:end]
        extracted_buildings[k] = block
        print(f"Extracted {k}: length {len(block)}")
    else:
        print(f"Error parsing closing bracket for {k}")

print(f"\nSuccessfully extracted {len(extracted_buildings)} out of {len(keys)} buildings!")

# Save to a json or js file
out_path = os.path.join(SCRAPED_DIR, "all_extracted_buildings.json")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump({k: extracted_buildings[k] for k in extracted_buildings}, f, indent=2)
print(f"Saved extracted buildings to {out_path}")


