# SPEC — Sistem Perjalanan (Darat · Laut · Udara)

Tanggal: 2026-11-14 · Modul: `web/src/core/travel_system.js` (chunk lazy, tidak menambah bundle utama)

## Tujuan
Warga bisa bepergian antar-simpul transportasi kota dengan membeli tiket (koin ₳):
bus lewat jalan raya, kapal lewat laut selatan, pesawat dari Bandara.

## Stasiun
| id | Nama | Moda | Titik turun (dunia) |
|---|---|---|---|
| bandara | Bandara AUDIRA | darat + udara | (-135, 190) |
| bis_utara | Terminal Bis Utara | darat | (-85, 190) |
| bis_selatan | Terminal Bis Selatan | darat | (-85, -198) |
| halte_havenot | Halte Desa Have-Not | darat | jalan terdekat ke (240, 10) |
| pelabuhan | Pelabuhan Peti Kemas | darat + laut | (270, -405) |
| pesiar | Terminal Pesiar | darat + laut | (-250, -405) |

## Rute & tarif
- **Bus (darat)**: semua stasiun saling terhubung. Jalur = BFS di peta jalan (`road_network.roadAt`),
  dari jalan terdekat stasiun asal ke jalan terdekat stasiun tujuan. Tarif 6 ₳; rute dari/ke Desa
  Have-Not bersubsidi 2 ₳ (tema Have vs Have-Not).
- **Kapal (laut)**: Pelabuhan ↔ Terminal Pesiar, berlayar lewat lepas pantai (z ≈ -520). 15 ₳.
- **Pesawat (udara)**: dari Bandara ke stasiun mana pun (lepas landas di runway, terbang, turun dekat
  tujuan, lanjut antar-jemput) 40 ₳; plus **Tur Udara Keliling Kota** (kembali ke Bandara) 25 ₳.

## Interaksi
- Mode Jalan: dalam radius 38 m dari titik stasiun muncul tombol mengambang "🎫 Loket <stasiun>".
- Tombol zona "🎫 Perjalanan" di panel sudut pandang: buka loket stasiun terdekat dari target kamera.
- Loket = modal daftar rute (ikon moda, durasi, tarif). Koin kurang → tombol nonaktif.
- Beli → `playerState.deductCoins` → perjalanan sinematik (kamera mengikuti kendaraan) →
  layar memudar → tokoh muncul di stasiun tujuan (`walk.pos` + `findFreeSpawn`) → toast "Tiba di …".
  Di luar Mode Jalan, hanya kamera yang ikut perjalanan.

## Anggaran performa
- Kendaraan perjalanan hanya ada selama perjalanan: bus/pesawat +1 draw call, feri +5 (prosedural).
  Saat tidak ada perjalanan: +0 draw call.
- Tanpa aset baru: bus `city-bus-49fd97` & pesawat `narrow-body-airliner-619183` (Polyfork, sudah
  dimuat, material vertex color `pfLiveMaterial`). Fallback kotak bila GLB tidak termuat.
- Jalan akses pesisir (`web/src/core/coast_roads.js`, 1 mesh = +1 draw call): barat x -268 (antara
  Taman Hiburan & Stadion) ke gerbang Terminal Pesiar; timur x 264 (celah sawah selatan & timur) ke
  gerbang Pelabuhan. Loket kedua stasiun pindah ke ujung jalan (gerbang darat, z -334). Sawah, pohon
  desa, satwa, dan pohon kota menghindari koridor lewat `onCoastRoad()`.
- Bundle: muatan awal 156,6 KB / 160 KB gzip (2026-11-14, setelah jalan pesisir).
- Semua kendaraan di atas permukaan (aturan zero-submerging): bus y = 0.02, kapal lunas di muka laut.
