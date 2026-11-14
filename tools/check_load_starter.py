import os

MAIN_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "src", "main.js")
with open(MAIN_PATH, "r", encoding="utf-8") as f:
    text = f.read()

idx = text.find("async loadStarterWorld()")
print(text[idx:idx+1200])


