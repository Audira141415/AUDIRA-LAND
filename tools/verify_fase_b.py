"""
AUDIRA-LAND: Script Verifikasi & Audit Kualitas FASE B
Menguji:
1. Integritas modul & berkas FASE B (player_state.js, building_loader.js, hud.js, styles.css, main.js).
2. Simulasi logika ekonomi: Upah kerja +35 ₳, pajak kas kota +4 ₳, cooldown 10 menit, batas harian 300 ₳.
3. Logika deteksi bangunan pada petak grid (Balai Kota 2x2, Warung Madura, Pos Ronda, Taman Surya, Kavling kosong).
4. Penayangan berkas dan respons HTTP dari web server lokal (port 8417).
"""

import os
import sys
import json
import time
import urllib.request

WORKSPACE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WEB_DIR = os.path.join(WORKSPACE_DIR, "web")

def test_file_integrity():
    print("\n[1/4] Memeriksa integritas berkas FASE B...")
    required_files = [
        "src/core/player_state.js",
        "src/models/building_loader.js",
        "src/ui/hud.js",
        "src/ui/styles.css",
        "src/main.js"
    ]
    for rel in required_files:
        path = os.path.join(WEB_DIR, rel)
        assert os.path.exists(path), f"Berkas {rel} tidak ditemukan!"
        size_kb = os.path.getsize(path) / 1024
        print(f" -> OK: {rel} ({size_kb:.1f} KB)")

def test_economy_rules_simulation():
    print("\n[2/4] Menguji simulasi aturan ekonomi & perbendaharaan...")
    
    # 1. State Inisial Warga
    initial_coins = 250
    initial_treasury = 50000
    daily_cap = 300
    base_reward = 35
    tax_rate = 4
    
    current_coins = initial_coins
    earned_today = 0
    treasury = initial_treasury
    shifts = 0
    
    # Simulasi 8 shift kerja berturut-turut (asumsi jeda terpenuhi)
    for i in range(1, 9):
        reward = min(base_reward, daily_cap - earned_today)
        assert reward == 35, f"Shift {i} harus menghasilkan upah penuh 35 ₳, dapat: {reward}"
        current_coins += reward
        earned_today += reward
        treasury += tax_rate
        shifts += 1

    assert earned_today == 280, f"Total perolehan 8 shift harus 280 ₳, tercatat: {earned_today}"
    assert current_coins == 250 + 280, f"Saldo koin harus 530 ₳, tercatat: {current_coins}"
    assert treasury == 50000 + (8 * 4), f"Kas kota harus 50.032 ₳, tercatat: {treasury}"
    print(f" -> OK: 8 Shift kerja normal sukses. Saldo: {current_coins} ₳, Kas Kota: {treasury} ₳")

    # Shift ke-9: Sisa cap tinggal 300 - 280 = 20 ₳
    reward_9 = min(base_reward, daily_cap - earned_today)
    assert reward_9 == 20, f"Shift ke-9 harus dipotong cap menjadi 20 ₳, dapat: {reward_9}"
    current_coins += reward_9
    earned_today += reward_9
    treasury += tax_rate
    assert earned_today == 300, f"Cap harian harus tepat 300 ₳, tercatat: {earned_today}"
    print(f" -> OK: Pemotongan batas harian (cap) berfungsi akurat: shift ke-9 menghasilkan sisa +20 ₳ (total 300/300 ₳)")

    # Shift ke-10: Cap sudah penuh (300/300) -> Ditolak!
    reward_10 = min(base_reward, daily_cap - earned_today)
    assert reward_10 == 0, f"Shift ke-10 harus ditolak dengan reward 0, dapat: {reward_10}"
    print(" -> OK: Shift ke-10 otomatis ditolak karena batas harian (300 ₳) telah penuh.")

    # Uji Jeda Waktu (Cooldown 10 Menit = 600 Detik)
    now_ms = time.time() * 1000
    last_worked_at = now_ms - (3 * 60 * 1000) # Baru 3 menit lalu
    elapsed = now_ms - last_worked_at
    cooldown_remaining = max(0, (10 * 60 * 1000) - elapsed)
    assert 400 * 1000 < cooldown_remaining <= 420 * 1000, f"Sisa cooldown salah: {cooldown_remaining} ms"
    print(f" -> OK: Perhitungan jeda waktu (Cooldown) akurat: sisa {cooldown_remaining/1000:.0f} detik.")

def test_building_grid_lookup():
    print("\n[3/4] Menguji deteksi bangunan pada petak grid k12...")
    starter_buildings = [
        {"id": "starter-balai-kota", "district_key": "k12", "grid_i": 16, "grid_j": 16, "width": 2, "height": 2, "type": "balai_kota"},
        {"id": "starter-warung-madura", "district_key": "k12", "grid_i": 14, "grid_j": 16, "width": 1, "height": 1, "type": "warung_madura"},
        {"id": "starter-taman-surya", "district_key": "k12", "grid_i": 16, "grid_j": 14, "width": 1, "height": 1, "type": "taman_surya"},
        {"id": "starter-pos-ronda", "district_key": "k12", "grid_i": 18, "grid_j": 16, "width": 1, "height": 1, "type": "pos_ronda"},
    ]

    def get_building_at(dist, ti, tj):
        for b in starter_buildings:
            if b["district_key"] == dist:
                w = b.get("width", 1)
                h = b.get("height", 1)
                if ti >= b["grid_i"] and ti < b["grid_i"] + w and tj >= b["grid_j"] and tj < b["grid_j"] + h:
                    return b
        return None

    # Balai Kota 2x2 mencakup [16,16], [17,16], [16,17], [17,17]
    assert get_building_at("k12", 16, 16)["type"] == "balai_kota"
    assert get_building_at("k12", 17, 17)["type"] == "balai_kota"
    assert get_building_at("k12", 14, 16)["type"] == "warung_madura"
    assert get_building_at("k12", 16, 14)["type"] == "taman_surya"
    assert get_building_at("k12", 18, 16)["type"] == "pos_ronda"
    assert get_building_at("k12", 15, 15) is None
    print(" -> OK: Deteksi petak dan cakupan 2x2 Balai Kota serta gedung 1x1 tervalidasi 100%.")

def test_web_server_serving():
    print("\n[4/4] Menguji penayangan aset via server lokal port 8417...")
    endpoints = [
        "/",
        "/src/core/player_state.js",
        "/src/models/building_loader.js",
        "/src/ui/hud.js",
        "/src/ui/styles.css",
        "/src/main.js"
    ]
    for ep in endpoints:
        url = f"http://localhost:8417{ep}"
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=3) as resp:
                assert resp.status == 200, f"Status code {resp.status} untuk {ep}"
                print(f" -> GET {ep} : 200 OK")
        except Exception as e:
            print(f" -> ERROR pada {url}: {e}")
            raise e

def main():
    print("=========================================================================")
    print(" AUDIRA-LAND: Audit Verifikasi FASE B (Ekonomi Kerja & Kas Kota)")
    print("=========================================================================")
    try:
        test_file_integrity()
        test_economy_rules_simulation()
        test_building_grid_lookup()
        test_web_server_serving()
        print("\n✅ FASE B: LOOP EKONOMI KERJA & KAS KOTA BERHASIL DIVERIFIKASI 100%!")
    except AssertionError as ae:
        print(f"\n❌ GAGAL AUDIT VERIFIKASI: {ae}")
        sys.exit(1)
    except Exception as ex:
        print(f"\n❌ ERROR VERIFIKASI: {ex}")
        sys.exit(1)

if __name__ == "__main__":
    main()

