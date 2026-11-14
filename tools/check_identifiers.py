import os
import json
import re

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
buildings_json_path = os.path.join(SCRAPED_DIR, "all_extracted_buildings.json")

with open(buildings_json_path, "r", encoding="utf-8") as f:
    buildings = json.load(f)

# Find all function calls and identifiers
identifiers = set()
for k, code in buildings.items():
    tokens = re.findall(r'\b[a-zA-Z_$][a-zA-Z0-9_$]*\b', code)
    for tok in tokens:
        identifiers.add(tok)

known_builtins = {
    "Math", "PI", "cos", "sin", "random", "min", "max", "floor", "abs", "round", "SQRT2",
    "a", "t", "o", "n", "e", "s", "r", "l", "i", "c", "u", "d", "h", "g", "p", "b", "f", "m", "w",
    "k", "v", "j", "x", "y", "z", "idx", "val", "adj", "lw", "lh", "floors", "zone", "seed",
    "const", "let", "var", "for", "if", "else", "return", "of", "in", "new", "true", "false",
    "null", "undefined", "length", "includes", "flat", "push"
}

helpers = {
    "box", "pyr", "roof", "cyl", "cone", "sph", "gbox", "gsph",
    "winRow", "winSide", "door", "flag", "tree", "bush", "fence",
    "tapak", "ovX", "lampPost", "clamp", "LANTAI", "LANTAI_USAHA",
    "PINTU_W", "PINTU_H", "PAL", "AKSEN", "GENTENG", "KUSEN", "KACA",
    "LAMPU", "RUMPUT", "PAVING", "WALLS", "ZONE_BASE", "G", "P"
}

unknown = set()
for tok in identifiers:
    if tok not in known_builtins and tok not in helpers and not tok.startswith("_"):
        unknown.add(tok)

print("Potentially unknown identifiers used inside building definitions:")
for u in sorted(unknown):
    print(" -", u)


