# Spek: Ciri Khas Desa Have & Desa Have-Not

Tanggal: 2026-11-13 • Status: **draf, belum dikerjakan**

Pemilik proyek memilih empat lapisan: tampilan kota, suasana & suara, warga & kegiatan, dan aturan main.
Batas pembeda tetap sungai: Have = barat (`i < 106`, X < −16 m), Have-Not = timur (`i > 109`, X > +16 m).
Penentu sisi di semua modul: `isHaveNotTile(i)` dari `web/src/core/village_rules.js` (atau `x > 16` untuk posisi dunia).

## Prinsip

- Satu sumber data: `web/src/core/village_identity.js` (baru) berisi tabel `VILLAGE_IDENTITY.have` / `.have_not`
  (palet, jenis jalan, perabot jalan, bobot kendaraan, peran warga, suara, angka ekonomi). Modul lain hanya membaca tabel ini.
- Anggaran HP tetap: draw call ≤ 100 di semua preset kamera (390 px, dengan `updateDetailLOD`), JS gzip ≤ 160 KB.
  Perabot baru wajib `InstancedMesh` atau ikut `bakeStatic`; tidak ada aset unduhan.
- Zero-Submerging: semua objek baru `bottomY ≥ permukaan + 0.02`.
- Deterministik: penempatan perabot memakai seed tetap (sama tiap muat).

## 1. Tampilan kota (`grid.js`, `city_trees.js`, `traffic_system.js`)

| Unsur | Desa Have | Desa Have-Not |
| :--- | :--- | :--- |
| Permukaan jalan | aspal gelap, marka putih putus-putus | tanah/makadam cokelat, tanpa marka, gang = jalan setapak |
| Tepi jalan | trotoar keramik abu + kanstin | rumput liar + parit kecil |
| Lampu jalan | tiang lampu modern (LED putih) | tiang kayu + lampu bohlam kuning, sebagian lampu teplok |
| Pagar kavling | pagar besi/tembok rendah | pagar bambu / tanaman beluntas |
| Pohon & taman | pohon peneduh rapi, taman berpaving, air mancur kecil | pisang, kelapa, bambu, kebun pekarangan, jemuran |
| Kendaraan | mobil, taksi, bus kota (bobot tinggi), ojek | motor, sepeda onthel, becak, gerobak, sesekali pikap sayur; tanpa bus |
| Warna tanah kavling | rumput hijau rata | tanah cokelat bercampur rumput |

Kendaraan: `traffic_system.js` memilih tipe kendaraan per lajur dari bobot desa tempat lajur itu dimulai.
Kendaraan besar boleh menyeberang jembatan, tapi tidak masuk gang Have-Not.

## 2. Suasana & suara (`ambience.js`, `lighting.js`, `weather.js`)

- Suara mengikuti posisi target kamera (crossfade ±1,5 dtk saat target melewati sungai):
  - Have: dengung lalu lintas, klakson sesekali, keramaian; malam: musik kafe lirih.
  - Have-Not: kokok ayam pagi, kicau burung, angin di sawah; malam: jangkrik, katak, kentongan ronda; azan di jam salat (opsional, bisa dimatikan).
- Semua suara tetap disintesis Web Audio (0 KB aset), mengikuti pilihan bisu yang ada.
- Warna: Have sedikit lebih dingin/terang (lampu kota malam, jendela menyala lebih banyak);
  Have-Not lebih hangat (asap dapur `ChimneySmoke`, kabut tipis pagi dari `weather_mist` lebih tebal di timur).

## 3. Warga & kegiatan (`living_world.js`)

- Pejalan kaki memilih peran sesuai sisi sungai tempat mereka lahir:
  - Have: pekerja kantoran (kemeja, tas), pedagang toko, pelajar berseragam, pelari pagi.
  - Have-Not: petani bawa cangkul/caping, ibu menggendong bakul, anak main layangan di lapangan/sawah, penjual jamu gendong.
- Kegiatan diam (tidak berjalan, `InstancedMesh`): Have = warga duduk di kafe/bangku taman;
  Have-Not = ronda malam di `pos_ronda`, jemuran pakaian, ibu-ibu ngobrol di depan warung.
- Kepadatan: Have lebih ramai di siang; Have-Not ramai pagi (berangkat ke sawah) dan sore.

## 4. Aturan main (`player_state.js`, `claim_modal.js`, `hud.js`, `supabase/schema.sql`)

| Aturan | Desa Have | Desa Have-Not |
| :--- | :--- | :--- |
| Biaya klaim kavling | 150 ₳ | 60 ₳ |
| Upah kerja dasar | 35 ₳ × 1,2 = 42 ₳ | 35 ₳ |
| Bonus profesi | +50% (tetap) | +50% (tetap) |
| Bonus khas | **Pajak kota**: 10% upah masuk kas kota | **Gotong royong**: +10 ₳ bila bekerja di bangunan milik warga lain di desa yang sama; **panen** `sawah`/`kebun_sayur` tiap 24 jam memberi 15 ₳ ke pemiliknya |
| Batas tinggi bangunan | bebas | 1 lantai (sudah ada, `village_rules.js`) |

- Desa warga diambil dari `playerState.state.village`; tempat kerja dinilai dari sisi sungai bangunan.
- Kartu kerja dan kartu klaim menampilkan aturan desa (ikon + satu baris), misalnya "Desa Have-Not: kavling murah 60 ₳".
- Supabase: angka ekonomi juga ditegakkan di RPC server (klaim & kerja) sebelum dianggap sah; jam panen pakai `now()` server.

## Urutan kerja (tiap tahap diverifikasi terpisah)

1. `village_identity.js` + aturan main (logika murni, bisa diuji tanpa browser).
2. Tampilan kota: jalan, trotoar, lampu, pagar, pohon, kendaraan.
3. Warga & kegiatan.
4. Suasana & suara.
5. Supabase RPC + skema (belum diterapkan ke DB live tanpa izin pemilik).

## Verifikasi

- Screenshot 390 px kedua sisi sungai di preset `have`, `havenot`, `river`: perbedaan terlihat tanpa membaca papan nama.
- Draw call ≤ 100 di semua preset; tidak ada error console.
- Tes logika: klaim Have 150 ₳ / Have-Not 60 ₳; upah Have 42 ₳ (+bonus profesi); gotong royong +10 ₳ hanya untuk bangunan warga lain di desa yang sama; panen tidak bisa diambil dua kali dalam 24 jam.
- Kendaraan besar tidak pernah berada di gang Have-Not.
- Verifikator independen (sesuai `AGENTS.md`) memeriksa tanpa membaca kesimpulan pembuat.
