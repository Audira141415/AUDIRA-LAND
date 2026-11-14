import os
import re

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
cat_file = os.path.join(SCRAPED_DIR, "netizenia_cat_full.js")

with open(cat_file, "r", encoding="utf-8", errors="ignore") as f:
    cat_code = f.read()

# Let's inspect some building m() implementations:
# e.g. rumah, warung, kantor, rs, sekolah, apartemen, istana, stadion, pabrik, masjid (ibadah)
sample_keys = ["rumah", "rumah2", "warung", "kafe", "kantor", "sekolah", "rs", "apartemen", "istana", "stadion", "ibadah", "pasar"]

for k in sample_keys:
    pos = cat_code.find(f"{k}:{{")
    if pos != -1:
        # find m:
        m_pos = cat_code.find("m:(", pos)
        next_entry = cat_code.find("\n", m_pos + 100) # or look for end of function
        print(f"=== [{k}] ===")
        print(cat_code[m_pos:m_pos+350])
        print("...")


