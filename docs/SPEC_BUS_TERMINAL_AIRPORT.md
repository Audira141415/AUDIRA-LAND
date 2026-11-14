# SPEC — Terminal Bis & Bandara AUDIRA

Status: draft → implementasi. Target: game web `web/` (Three.js r128, ES module, tanpa build step).

## Tujuan
1. Beberapa **TERMINAL BIS** kecil tersebar di titik-titik kota dekat jalan arteri.
2. Satu **BANDARA MEGAH** di tepi kota (lahan kosong besar, utara-barat kota).

Semua **statis** (aset dunia, bukan persistensi Supabase). Zero-Submerging mutlak, anggaran draw < 100
@390px/4× throttle, bundel JS gzip < 160 KB (modul besar lazy-load).

## Peta zona yang sudah terpakai (hindari tabrakan)
- Grid kota aktif: tile i 72..140 → X −288..256; tile j 86..129 → Z −176..168. Sungai X −16..16.
- Arteri (world): vertikal X≈−176 & X≈168/176; horizontal Z≈−176 & Z≈168 (membingkai distrik pusat k12).
- Theme Park: barat, X −472..−296, Z −174..160.
- Zoo: timur (fokus ~X 359, Z 194).
- Stadion Have: X −168, Z −330..−176.5 (selatan Have).
- Playground Have-Not: X 54, Z −332 (selatan Have-Not).
- Pantai/laut (fishing): selatan, pasir Z −296..−468, X −285..365.
- Sawah pedesaan (rural): timur X 264..378; teras utara X 24..270, Z 184..300; teras selatan X 24..270, Z −300..−184.
- Snow valley: utara jauh, Z ≥ 286.
- Pita terbuka aman: **utara-tengah** Z 176..184, X −288..24 (barat sawah utara, selatan snow); **selatan-tengah**
  Z −184..−296, X −150..−20 (timur stadion, barat sawah selatan, utara pantai).

## 1. Terminal Bis — `web/src/models/bus_terminals.js` (lazy)
Tersebar di pita terbuka aman di tepi distrik pusat, menempel arteri Z=±176 (tak menabrak lot/jalan/sungai).
Have-Not dibingkai teras sawah di utara+selatan, jadi terminal ada di sisi Have + tengah (dekat jembatan).

Titik tetap (world X,Z), dasar = `getSurfaceIndex().at(x,z).y + MICRO_LIFT`:
- TB1 Utara-Barat (Have): (−130, 190)
- TB2 Utara-Tengah (dekat jembatan): (−40, 190)
- TB3 Selatan-Barat (Have): (−130, −198)
- TB4 Selatan-Tengah (dekat jembatan): (−40, −198)
- + sampai 1 terminal tambahan di tile `isOpenSpace` KERING (bukan kolam) Have-Not jika ada, jarak ≥ 110 m.

Tiap terminal (±20×12 m): apron aspal + marka teluk bis, kanopi peron (atap + tiang), bangku, papan
"TERMINAL BIS AUDIRA", tiang lampu, 1–2 bis parkir. Rotasi menghadap arteri terdekat.

## 2. Bandara Megah — `web/src/models/airport.js` (lazy)
Lokasi: pita terbuka utara-barat. Area X −285..10, Z 182..284 (barat teras sawah utara, selatan snow valley).
- **Runway** timur-barat (sumbu X), Z≈206, panjang ~270 m (X −270..0), lebar 18 m, marka tengah putus-putus,
  threshold/piano keys, nomor "09"/"27", lampu tepi.
- **Taxiway** sejajar Z≈230, garis kuning.
- **Apron** utara Z 244..278 + marka parkir.
- **Terminal penumpang** megah (fasad kaca, kanopi, atap gelombang) Z≈270, X −120..10.
- **Menara ATC** tinggi ~26 m dengan kabin kaca + lampu beacon berkedip.
- **2 pesawat** parkir di apron (prosedural: badan, sayap, ekor, mesin, jendela).
- Papan "BANDARA AUDIRA" + logo in-scene (anti-reupload, brand di dunia).
- Dasar: slab tarmac sendiri (top ~0.25) di atas tanah y≈0; semua objek `bottomY ≥ surfaceY`.

## Anggaran draw
- Semua bagian statis (kedua modul): `bakeStatic` → ~1–2 draw lambert vertex-color masing-masing.
- Papan nama: SATU atlas tekstur per modul (1 draw). Lampu (Basic, protected night): 1 draw per modul.
- Bis parkir: 1 `InstancedMesh` (`city-bus-49fd97`) untuk SEMUA terminal.
- Pesawat parkir: prosedural, ikut dilebur ke static bandara (0 draw tambahan).
- Total tambahan ≈ 7–9 draw. Target total tetap < 100.

## Aset & kredit
- Reuse `city-bus-49fd97` (Polyfork CC BY 4.0, sudah terdaftar di `docs/CREDITS_POLYFORK.md`).
- Bandara & struktur terminal: 100% prosedural (BoxGeometry + Lambert), tanpa aset baru.

## Tambahan (2026-11-14, revisi)
- **Pesawat terbang**: `airport.js` kini punya 1 pesawat yang terbang berputar (elips) di atas bandara,
  dilebur jadi 1 mesh (bakeStatic) dan digerakkan di `update()` (naik-turun + bank). ~1 draw.
- **Pelabuhan besar** — `web/src/models/harbor.js` (lazy). Pesisir selatan-timur (pusat X 270, Z −430),
  memakai laut selatan (y −0.25). Dermaga 240 m, 3 crane gantry peti kemas, tumpukan kontainer warna-warni,
  2 kapal kargo (lambung di permukaan air, kontainer+anjungan+cerobong), 3 gudang, pemecah gelombang +
  mercusuar (beacon hijau berkedip), gerbang + papan "⚓ PELABUHAN AUDIRA". Semua statis dilebur bakeStatic
  (~2-3 draw) + air 1 + papan 1 + lampu 1 + beacon 1. Zero-Submerging: struktur di darat; lambung kapal di
  permukaan air. Preset kamera "⚓ Pelabuhan".
