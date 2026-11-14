import os
import re

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
app_js_path = os.path.join(SCRAPED_DIR, "app.dbbd84e3f1.js")

with open(app_js_path, "r", encoding="utf-8", errors="ignore") as f:
    js = f.read()

# Find CAT={...}
cat_idx = js.find("CAT={")
if cat_idx != -1:
    print(f"Found CAT={{ at index {cat_idx}")
    # Let's find the matching closing bracket or scan until next major section
    # Let's extract 50,000 chars from cat_idx
    cat_chunk = js[cat_idx:cat_idx+100000]
    # Let's count brackets to find exact end of CAT
    bracket_count = 0
    end_idx = 0
    in_string = False
    escape = False
    quote_char = ''
    
    for i, ch in enumerate(cat_chunk):
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
                    end_idx = i + 1
                    break
    
    if end_idx > 0:
        cat_full = cat_chunk[:end_idx]
        print(f"Extracted CAT successfully: {len(cat_full)} characters")
        out_cat = os.path.join(SCRAPED_DIR, "netizenia_cat_full.js")
        with open(out_cat, "w", encoding="utf-8") as f:
            f.write("export const NETIZENIA_CAT = " + cat_full[4:] + ";\n")
        print(f"Saved full CAT to {out_cat}")
    else:
        print("Could not match brackets, saving first 40,000 chars")
        out_cat = os.path.join(SCRAPED_DIR, "netizenia_cat_partial.js")
        with open(out_cat, "w", encoding="utf-8") as f:
            f.write(cat_chunk[:40000])

# Let's also extract all building keys in CAT
cat_keys = re.findall(r'(\b[a-zA-Z0-9_]+\b)\s*:\s*\{\s*n\s*:\s*["\']([^"\']+)["\']', js[cat_idx:cat_idx+100000])
print(f"\nTotal Building Types Found in CAT: {len(cat_keys)}")
for key, name in cat_keys:
    print(f"  - [{key}]: \"{name}\"")

# Also find helper functions like tapak, LANTAI, box, roof, cylinder, etc.
helpers = ["tapak", "box", "roof", "roofHip", "roofGable", "fence", "tree", "plant", "window", "door", "stair"]
print("\n--- Helper functions around CAT ---")
for h in helpers:
    idx = js.find(f"function {h}(")
    if idx != -1:
        print(f"Helper {h} found at {idx}: {js[idx:idx+250]}")
    else:
        # maybe arrow or var
        idx2 = js.find(f"{h}=")
        if idx2 != -1 and idx2 > cat_idx - 10000 and idx2 < cat_idx + 100000:
            print(f"Helper {h}= found near CAT at {idx2}: {js[idx2:idx2+150]}")


