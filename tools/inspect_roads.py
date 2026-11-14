PD = 43
N = 217
HALF = (N - 1) // 2
T = 8.0

def wx(a):
    return (a - HALF) * T

def roadI(a):
    t = a % PD
    return 3 if t < 2 else (2 if (t - 2) % 7 == 6 else 0)

def roadJ(a):
    t = a % PD
    return 3 if t < 2 else (1 if (t - 2) % 3 == 2 else 0)

print("--- Vertical Roads (COLS) in active district (86..129) ---")
for a in range(86, 130):
    r = roadI(a)
    if r > 0:
        print(f"Col tile {a}: class {r} -> wx={wx(a):.1f}")

print("\n--- Horizontal Roads (ROWS) in active district (86..129) ---")
for a in range(86, 130):
    r = roadJ(a)
    if r > 0:
        print(f"Row tile {a}: class {r} -> wz={wx(a):.1f}")

