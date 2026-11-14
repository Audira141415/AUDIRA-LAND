# Spek: Tata Kota Organik (tidak kotak-kotak)

Tanggal: 2026-11-13 • Status: **dikerjakan** (2026-11-13): `web/src/core/road_network.js` + semua pemakai `roadI/roadJ` diganti.

## Masalah

Jalan dihitung dengan rumus periodik 1 dimensi (`roadI(i)`, `roadJ(j)`; `PD = 43`):
gang tiap 3 petak, kolektor tiap 7 petak, arteri di tepi distrik, semuanya lurus dari ujung ke ujung peta.
Hasilnya blok seragam seperti papan catur.

Rumus yang sama disalin di 5 tempat (harus diganti semua):
`web/src/core/constants.js`, `web/src/core/grid.js` (baris ±20–31, 131, 212, 241, 1034–1056, 1155, 1317),
`web/src/core/city_layout.js` (28–29, 52, 95–100), `web/src/models/traffic_system.js` (15–19, 134, 163),
`web/src/models/living_world.js` (18, 100).

## Rencana

1. **Satu peta jalan 2D bersama** `web/src/core/road_network.js`: `roadAt(i, j)` → 0 kavling, 1 gang, 2 kolektor, 3 arteri.
   Dibangkitkan deterministik dari seed tetap (posisi yang dilihat warga tidak berubah antar muat), disimpan
   sebagai `Uint8Array` untuk lookup O(1).
2. **Arteri tetap lurus** (tepi distrik + jembatan sungai) supaya lalu lintas dan jembatan aman.
3. **Kolektor** jarak bervariasi 5–9 petak per wilayah, boleh bergeser (jog) 1 petak di persimpangan.
4. **Gang terputus**: segmen gang mulai/berhenti di kolektor, menghasilkan pertigaan (T) dan jalan buntu;
   ukuran blok berbeda-beda (2×3 sampai 4×6 petak).
5. **Blok ruang terbuka**: sebagian blok jadi taman/lapangan/alun-alun kecil (tidak bisa diklaim).
6. Desa Have-Not (timur sungai) lebih jarang jalannya dan blok lebih besar (pedesaan); Desa Have lebih rapat.
7. Ganti semua pemakai `roadI/roadJ` dengan `roadAt`. Geometri jalan di `grid.js` dibangun per segmen
   (bukan per baris penuh), tetap dilebur `bakeStatic` (draw call ≤ 100).
8. Tata ulang: `CityLayout.place` otomatis memindah bangunan yang kini kena jalan (deterministik).

## Verifikasi

- Tidak ada bangunan di atas jalan/sungai (cek occupancy vs `roadAt`).
- Lalu lintas hanya lewat jalan yang tersambung (tidak lewat jalan buntu terputus).
- Draw call ≤ 100 di semua preset kamera, layar 390 px.
- Klik kavling (`getPlotFromWorld`) dan klaim tetap jalan; aturan Have-Not (`village_rules.js`) tetap berlaku.
