import os

PLAYER_STATE_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "src", "core", "player_state.js")
MAIN_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "src", "main.js")

# 1. Update player_state.js
with open(PLAYER_STATE_PATH, "r", encoding="utf-8") as f:
    ps_text = f.read()

if "setCityTreasury(amount)" not in ps_text:
    ps_text = ps_text.replace(
        "    saveTreasury(amount) {",
        "    setCityTreasury(amount) {\n        this.saveTreasury(amount);\n        this.notify();\n    }\n\n    saveTreasury(amount) {"
    )
    with open(PLAYER_STATE_PATH, "w", encoding="utf-8") as f:
        f.write(ps_text)
    print("Added setCityTreasury to player_state.js!")

# 2. Update main.js
with open(MAIN_PATH, "r", encoding="utf-8") as f:
    main_text = f.read()

old_load = """    async loadStarterWorld() {
        try {
            // 1. Ambil Snapshot Kota
            const { data: snapshot } = await getCitySnapshot();
            if (snapshot && snapshot.settings) {
                console.log(`[Kota] Terhubung ke: ${snapshot.settings.city_name}`);
            }

            // 2. Ambil Bangunan Perdana di k12 (Alun-Alun Merdeka)
            const { data: buildings } = await getDistrictBuildings('k12');
            if (buildings && buildings.length > 0) {
                this.buildingLoader.loadBuildings(buildings);
                console.log(`[Aset] Berhasil memuat ${buildings.length} bangunan publik perdana di k12.`);
            }
        } catch (err) {
            console.warn('[Kota] Gagal memuat data awal, menggunakan default offline:', err);
        }
    }"""

new_load = """    async loadStarterWorld() {
        try {
            // 1. Ambil Snapshot Kota (Kas, Berita, & Donasi Warga)
            const { data: snapshot } = await getCitySnapshot();
            if (snapshot) {
                if (snapshot.kas !== undefined) {
                    playerState.setCityTreasury(snapshot.kas);
                }
                if (snapshot.news && Array.isArray(snapshot.news)) {
                    snapshot.news.forEach(n => {
                        playerState.addNews(n.kind || 'kota', n.text || n.message);
                    });
                }
                if (snapshot.donations && Array.isArray(snapshot.donations)) {
                    snapshot.donations.forEach(d => {
                        playerState.addNews('donasi', `💖 Donatur terbaru: ${d.name} · Rp${d.amount} · "${d.message}"`);
                    });
                }
                console.log(`[Kota] Snapshot dimuat: Kas ${snapshot.kas || 5380} ₳, ${snapshot.news?.length || 0} berita.`);
            }

            // 2. Ambil Seluruh Bangunan Hidup Kota (549 Bangunan Hasil Scraping Netizenia v2)
            const { data: buildings } = await getDistrictBuildings('k12');
            if (buildings && buildings.length > 0) {
                this.buildingLoader.loadBuildings(buildings);
                console.log(`[Aset] Berhasil memuat ${buildings.length} bangunan hidup di kawasan kota!`);
            }
        } catch (err) {
            console.warn('[Kota] Gagal memuat data awal, menggunakan default offline:', err);
        }
    }"""

if old_load in main_text:
    main_text = main_text.replace(old_load, new_load)
    with open(MAIN_PATH, "w", encoding="utf-8") as f:
        f.write(main_text)
    print("Updated loadStarterWorld in main.js!")
else:
    print("Warning: old_load not matched in main.js!")


