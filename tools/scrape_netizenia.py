import os
import sys
import re
import json
import urllib.request
import urllib.parse

BASE_URL = "https://republiknetizenia.pages.dev/v2/"
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "tools", "scraped_netizenia")
os.makedirs(OUT_DIR, exist_ok=True)

print(f"Scraping {BASE_URL} into {OUT_DIR}...")

req = urllib.request.Request(
    BASE_URL,
    headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
)

try:
    with urllib.request.urlopen(req) as resp:
        html = resp.read().decode("utf-8", errors="ignore")
except Exception as e:
    print(f"Error fetching main page: {e}")
    sys.exit(1)

html_path = os.path.join(OUT_DIR, "index.html")
with open(html_path, "w", encoding="utf-8") as f:
    f.write(html)
print(f"Saved index.html ({len(html)} bytes)")

# Find scripts, stylesheets, links
script_srcs = re.findall(r'<script[^>]*src=[\'"]([^\'"]+)[\'"]', html, re.IGNORECASE)
link_hrefs = re.findall(r'<link[^>]*href=[\'"]([^\'"]+)[\'"]', html, re.IGNORECASE)
inline_scripts = re.findall(r'<script(?![^>]*src)[^>]*>(.*?)</script>', html, re.DOTALL | re.IGNORECASE)

print(f"Found {len(script_srcs)} external scripts, {len(link_hrefs)} link tags, and {len(inline_scripts)} inline scripts.")

# Save inline scripts
for i, s in enumerate(inline_scripts):
    s_path = os.path.join(OUT_DIR, f"inline_script_{i}.js")
    with open(s_path, "w", encoding="utf-8") as f:
        f.write(s)
    print(f"Saved inline_script_{i}.js ({len(s)} bytes)")

# Download all external resources
all_resources = script_srcs + link_hrefs
downloaded_files = []

for rel_url in all_resources:
    full_url = urllib.parse.urljoin(BASE_URL, rel_url)
    clean_name = os.path.basename(urllib.parse.urlparse(rel_url).path)
    if not clean_name:
        clean_name = "asset_" + str(len(downloaded_files))
    
    local_path = os.path.join(OUT_DIR, clean_name)
    print(f"Downloading {full_url} -> {clean_name} ...")
    try:
        req_res = urllib.request.Request(
            full_url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        )
        with urllib.request.urlopen(req_res) as resp:
            content = resp.read()
            with open(local_path, "wb") as f:
                f.write(content)
            downloaded_files.append((clean_name, local_path, len(content)))
            print(f"  OK ({len(content)} bytes)")
    except Exception as err:
        print(f"  Failed: {err}")

print("\n--- Summary of Downloaded Resources ---")
for name, p, size in downloaded_files:
    print(f" - {name}: {size} bytes")

