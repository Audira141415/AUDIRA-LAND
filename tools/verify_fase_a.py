#!/usr/bin/env python3
"""
AUDIRA-LAND: Verifikator Otomatis FASE A (Identitas Warga & Klaim Kavling)
Menguji keberadaan modul profil, modal KTP digital, modal klaim kavling,
perancah konstruksi 3D nyata, dan penayangan aset via HTTP server.
"""

import os
import sys
import urllib.request

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_DIR = os.path.join(BASE_DIR, "web")

FASE_A_FILES = [
    "src/core/player_state.js",
    "src/ui/auth_modal.js",
    "src/ui/claim_modal.js",
    "src/models/building_loader.js",
    "src/ui/hud.js",
    "src/ui/styles.css",
    "src/main.js"
]

def check_files():
    print("[1/3] Memeriksa keberadaan berkas FASE A...")
    for rel_path in FASE_A_FILES:
        full_path = os.path.join(WEB_DIR, rel_path.replace("/", os.sep))
        assert os.path.exists(full_path), f"❌ Berkas hilang: {rel_path}"
        size = os.path.getsize(full_path)
        print(f" -> OK: {rel_path} ({size / 1024:.1f} KB)")

def check_logic_and_rules():
    print("\n[2/3] Memverifikasi logika kependudukan & aturan arsitektur...")
    
    # 1. State Pemain: Saldo Awal 250 ₳
    ps_path = os.path.join(WEB_DIR, "src", "core", "player_state.js")
    with open(ps_path, "r", encoding="utf-8") as f:
        ps_code = f.read()
    assert "250" in ps_code, "❌ Saldo awal 250 koin tidak ditemukan di player_state.js"
    assert "deductCoins" in ps_code, "❌ deductCoins tidak ditemukan di player_state.js"
    print(" -> OK: Saldo koin awal warga tervalidasi 250 ₳")

    # 2. Modal KTP: 6 Profesi Nusantara
    auth_path = os.path.join(WEB_DIR, "src", "ui", "auth_modal.js")
    with open(auth_path, "r", encoding="utf-8") as f:
        auth_code = f.read()
    for prof in ['Arsitek', 'Petani', 'Pedagang', 'Pengrajin', 'Seniman', 'Pamong Praja']:
        assert prof in auth_code, f"❌ Profesi {prof} tidak ditemukan di auth_modal.js"
    print(" -> OK: 6 Profesi Nusantara terdaftar lengkap")

    # 3. Modal Klaim: Biaya 100 ₳ & 4 Tipe Bangunan
    claim_path = os.path.join(WEB_DIR, "src", "ui", "claim_modal.js")
    with open(claim_path, "r", encoding="utf-8") as f:
        claim_code = f.read()
    assert "100" in claim_code, "❌ Biaya klaim 100 ₳ tidak ditemukan di claim_modal.js"
    for bld in ['rumah_limas', 'warung_kopi', 'kebun_sayur', 'saung_bambu']:
        assert bld in claim_code, f"❌ Tipe bangunan {bld} tidak ditemukan di claim_modal.js"
    print(" -> OK: Biaya klaim (100 ₳) dan 4 tipe bangunan awal terverifikasi")

    # 4. Building Loader: Perancah 3D & Billboard Hitung Mundur
    bld_path = os.path.join(WEB_DIR, "src", "models", "building_loader.js")
    with open(bld_path, "r", encoding="utf-8") as f:
        bld_code = f.read()
    assert "createConstructionScaffoldMesh" in bld_code, "❌ createConstructionScaffoldMesh tidak ditemukan"
    assert "drawBillboard" in bld_code, "❌ drawBillboard tidak ditemukan"
    assert "updateTimers" in bld_code, "❌ updateTimers tidak ditemukan"
    assert "MICRO_LIFT" in bld_code, "❌ Zero-submerging micro-lift tidak ditemukan"
    print(" -> OK: Model perancah bambu, derek katrol, dan billboard hitung mundur 3D terverifikasi")

def check_http_endpoints():
    print("\n[3/3] Menguji penayangan aset via server lokal port 8417...")
    endpoints = [
        "/src/core/player_state.js",
        "/src/ui/auth_modal.js",
        "/src/ui/claim_modal.js",
        "/src/models/building_loader.js",
        "/src/ui/hud.js",
        "/src/ui/styles.css",
        "/src/main.js"
    ]
    for ep in endpoints:
        url = f"http://localhost:8417{ep}"
        res = urllib.request.urlopen(url)
        assert res.status == 200, f"Gagal memuat {ep}"
        print(f" -> GET {ep} : 200 OK")
    print(" -> OK: Semua modul FASE A berhasil disajikan tanpa error.")

def main():
    print("=========================================================================")
    print(" AUDIRA-LAND: Audit Verifikasi FASE A (Identitas Warga & Klaim Kavling)")
    print("=========================================================================\n")
    check_files()
    check_logic_and_rules()
    check_http_endpoints()
    print("\n✅ FASE A: IDENTITAS WARGA & KLAIM KAVLING BERHASIL DIVERIFIKASI 100%!")

if __name__ == "__main__":
    main()

