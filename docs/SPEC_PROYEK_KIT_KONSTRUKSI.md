# Spek: Properti Proyek dari Construction Site Kit (Polyfork)

Tanggal: 2026-11-13. Status: selesai (diuji 390 px, +2 draw call).

## Tujuan

Proyek rumah warga (`stage: 'proyek'`) saat ini hanya punya perancah prosedural, derek kotak, dan pekerja kotak dari `construction_fx.js`. Tambahkan properti asli dari Polyfork Construction Site kit (`construction-site-9e40b0`, CC BY 4.0) supaya proyek terlihat seperti lokasi kerja sungguhan, dan pertajam tema kaya vs miskin.

## Kontras Have vs Have-Not

| Desa | Cara membangun | Properti |
| :--- | :--- | :--- |
| Have (`is_have` / sisi kota) | Mesin modern | Mini excavator (berayun menggali), toilet portabel, papan K3, kerucut lalu lintas, palet material |
| Have-Not | Tenaga tangan | Molen semen kecil, karung pasir (dumpy bag), gundukan tanah/pasir, palet material |

Desa ditentukan dari `data.is_have`; bila tidak ada, dari posisi X dunia (> `RIVER_MAX_X` = Have-Not), sama dengan `building_loader`.

## Tata letak kavling 1×1 (7,2 m, koordinat lokal kavling, depan = +Z)

- Rumah tumbuh menempati belakang: x −3,0..3,0, z −3,6..1,0.
- Zona depan z 1,0..3,6 dipakai bersama:
  - Tiang derek prosedural (building_loader) di (2,4; 2,4).
  - Jalur gerobak dipindah ke z 1,6; pusat gerobak x −0,5..2,1 (jejak gerobak + pekerja ±−1,6..3,2).
  - Beban derek di (0,4; 2,4) (di bawah lengan derek); dasarnya tidak pernah di bawah 1,9 m agar tidak menembus pekerja gerobak.
  - Sudut kiri depan: mesin/molen + gundukan.
  - Tepi depan: papan/kerucut (Have) atau karung (Have-Not).
- Zero-Submerging: dasar model = puncak alas pasir perancah + 0,02 m (kota y 0,10; desa y 0,05). Alas pasir loader lebih tinggi dari y 0 lokal.

## Anggaran

- Properti statis semua proyek dekat (maks 6, radius 120 m) dilebur jadi **1 Mesh** (material vertex-color bersama), disusun ulang hanya bila daftar proyek dekat berubah.
- Excavator: **1 InstancedMesh** (maks 6), berayun yaw ±0,5 rad.
- Total tambahan maks **+2 draw call** pass utama, dan +2 di pass bayangan (keduanya castShadow).
- Model yang tiba terlambat (lewat batas tunggu preload) tetap muncul: jumlah model termuat ikut kunci susun ulang. Kunci diurutkan per id agar pergeseran jarak tidak memicu susun ulang. Tidak ada tambahan di bundel JS awal: semua kode di chunk lazy `construction_fx.js`; model dimuat lazy lewat `preloadPolyfork` yang disuntik.
- Model gagal dimuat: proyek tetap tampil seperti sebelumnya (tanpa properti).

## Uji

- Proyek uji Have dan Have-Not di browser 390 px: properti di dalam kavling, tidak menembus rumah/derek/jalur gerobak, dasar di permukaan.
- Draw call pass utama sebelum/sesudah (shadow map dimatikan saat mengukur).
- Proyek selesai/dihapus: properti hilang.
