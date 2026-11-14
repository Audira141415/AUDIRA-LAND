import os

css_path = os.path.join(os.path.dirname(__file__), "..", "web", "src", "ui", "styles.css")
with open(css_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

print(f"Total lines in styles.css: {len(lines)}")
print("Lines 970 to 1020:")
print("".join(lines[970:1020]))

