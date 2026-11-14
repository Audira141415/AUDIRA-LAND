import os

modal_path = os.path.join(os.path.dirname(__file__), "..", "web", "src", "ui", "claim_modal.js")

with open(modal_path, "r", encoding="utf-8") as f:
    code = f.read()

print("Claim modal length:", len(code))

