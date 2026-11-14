import os
import re

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
app_js_path = os.path.join(SCRAPED_DIR, "app.dbbd84e3f1.js")

with open(app_js_path, "r", encoding="utf-8", errors="ignore") as f:
    js = f.read()

# Search for CFG
for m in re.finditer(r'\bCFG\s*=\s*\{', js):
    pos = m.start()
    print(f"CFG at {pos}:", js[pos:pos+400])

# Search for rpc calls: .rpc(
for m in re.finditer(r'\.rpc\([\'"]([^\'"]+)[\'"]', js):
    print("RPC call:", m.group(1))

# Search for supabase.createClient or createClient
for m in re.finditer(r'createClient\([^)]+\)', js):
    print("createClient:", m.group(0))

# Search for how buildings are populated on the map
# In Netizenia, what function adds buildings?
# Earlier we saw `makeVisual(a)`. Where is `makeVisual` called?
print("\n--- Where is makeVisual called? ---")
for m in re.finditer(r'makeVisual\(', js):
    pos = m.start()
    print(f"makeVisual call at {pos}:", js[max(0, pos-100):min(len(js), pos+150)])
    print("-" * 40)


