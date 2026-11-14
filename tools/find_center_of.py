import os
import re

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
app_js_path = os.path.join(SCRAPED_DIR, "app.dbbd84e3f1.js")

with open(app_js_path, "r", encoding="utf-8", errors="ignore") as f:
    js = f.read()

pos = js.find("function centerOf(")
if pos != -1:
    print("Found centerOf at", pos)
    print(js[pos:pos+300])
else:
    for m in re.finditer(r'centerOf\s*=\s*', js):
        p = m.start()
        print(f"centerOf= at {p}:", js[p:p+200])

# Also find wx(a)
pos_wx = js.find("wx=")
if pos_wx != -1:
    print("wx= at", pos_wx, js[pos_wx:pos_wx+150])


