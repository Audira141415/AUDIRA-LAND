import os
import re

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
cat_file = os.path.join(SCRAPED_DIR, "netizenia_cat_full.js")

with open(cat_file, "r", encoding="utf-8", errors="ignore") as f:
    cat_code = f.read()

# Let's parse each building in CAT
# Look for pattern: key: { n: "...", ... }
bld_keys = re.findall(r'(\b[a-zA-Z0-9_]+\b)\s*:\s*\{\s*n\s*:\s*["\']([^"\']+)["\']', cat_code)

print(f"Total buildings in CAT: {len(bld_keys)}")
out_summary = os.path.join(SCRAPED_DIR, "BUILDINGS_CATALOG_DETAILED.md")

with open(out_summary, "w", encoding="utf-8") as out:
    out.write("# 🏛️ REPUBLIK NETIZENIA V2 - COMPLETE BUILDING CATALOG (36 TIPE)\n\n")
    out.write("| No | ID Key | Nama Bangunan | Kind | Group | Dimensi (w x h) | Biaya | Deskripsi |\n")
    out.write("|:---|:---|:---|:---|:---|:---|:---|:---|\n")
    
    for idx, (k, name) in enumerate(bld_keys, 1):
        # find the chunk for this key
        pattern = rf'{k}\s*:\s*\{{(.*?)(?=\n\s*[a-zA-Z0-9_]+\s*:\s*\{{|\s*\}}\s*;?$)'
        m = re.search(pattern, cat_code, re.DOTALL)
        chunk = m.group(1) if m else ""
        
        kind = re.search(r'kind\s*:\s*["\']([^"\']+)["\']', chunk)
        grp = re.search(r'grp\s*:\s*["\']([^"\']+)["\']', chunk)
        w = re.search(r'w\s*:\s*([0-9.]+)', chunk)
        h = re.search(r'h\s*:\s*([0-9.]+)', chunk)
        cost = re.search(r'cost\s*:\s*([0-9.]+)', chunk)
        desc = re.search(r'd\s*:\s*["\']([^"\']+)["\']', chunk)
        
        k_val = kind.group(1) if kind else "-"
        g_val = grp.group(1) if grp else "-"
        w_val = w.group(1) if w else "1"
        h_val = h.group(1) if h else "1"
        c_val = cost.group(1) if cost else "0"
        d_val = desc.group(1) if desc else "-"
        
        out.write(f"| {idx} | `{k}` | **{name}** | {k_val} | {g_val} | {w_val}x{h_val} | Rp {c_val} | {d_val} |\n")

print(f"Catalog detailed table written to {out_summary}")


