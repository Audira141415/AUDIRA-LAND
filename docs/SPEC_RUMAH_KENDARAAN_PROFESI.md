# Spek: Rumah & Kendaraan Mengikuti Desa × Profesi

Tanggal: 2026-11-13. Lanjutan dari `SPEC_PROFESI_DESA_RUMAH.md`.

## Tujuan

Rumah awal warga dan kendaraannya ditentukan oleh **dua** pilihan saat daftar: desa (Have / Have-Not)
dan profesi. Contoh: Have-Not + Petani = Pondok Tani Jerami + Gerobak Sapi. Have + Polisi = Rumah
Dinas Polisi + Mobil Patroli. Ada 2 × 12 = 24 kombinasi, masing-masing satu rumah dan satu kendaraan.

## Data

`web/src/core/home_catalog.js` → `HOME_KITS[village][professionId] = { house, houseLabel, vehicle, vehicleLabel, vehicleLen }`.

- `house` / `vehicle` = id model Polyfork (CC BY 4.0), sumber `E:\ASET\ASSET-AUDIRA` (cache sama di
  `blender/exports/polyfork/raw/`). Diimpor dengan `tools/polyfork_import.py all --only <id,...>` ke
  `web/public/models/polyfork/` (1 mesh, dasar y = 0, depan +Z, kredit otomatis).
- `vehicleLen` = panjang kendaraan dalam meter (sepeda ±1,8, mobil ±4, truk ±5, perahu ±4,5).
- Thumbnail 160 px WebP di `web/public/thumbs/homes/<id>.webp` untuk pratinjau di wizard.

## Wizard (`AuthModal`)

1. Instagram → 2. Desa → 3. Profesi → 4. Konfirmasi (tetap 4 langkah).
- Langkah 3: setiap kartu profesi menampilkan baris kecil "🏠 <rumah> · 🚗 <kendaraan>" sesuai desa
  yang dipilih di langkah 2. Setelah profesi dipilih, panel pratinjau muncul di bawah grid berisi
  thumbnail rumah + kendaraan.
- Langkah 4: ringkasan menampilkan rumah dan kendaraan beserta thumbnail.

## Penempatan di kavling (1 petak = 8 m)

- Rumah: skala seragam agar pas 6,0 m (X) × 4,8 m (Z), tinggi maks 10 m (model kecil diperbesar, besar dikecilkan), digeser
  ke belakang (z = −4 + 0,4 + kedalaman/2).
- Kendaraan: diparkir menyamping di depan rumah (rotasi Y = π/2), panjang = `vehicleLen` dibatasi 5,6 m,
  pusat di z = +2,5.
- Zero-submerging: dasar model y = 0 lokal; grup ditaruh di `SURFACE_Y + MICRO_LIFT` oleh loader.
- Saat `stage: 'proyek'` hanya perancah yang tampil (perilaku lama). Kendaraan muncul bersama rumah jadi.

## State

- Data bangunan rumah: `type` tetap `rumah` / `rumah_limas` (asap dapur, lampu teplok, pejalan kaki
  tetap jalan), ditambah `pf_house`, `pf_vehicle`, `vehicle_len`. Judul memakai `houseLabel`.
- Warga: `vehicleId`, `vehicleLabel`; KTP menampilkan kendaraan.
- Model belum termuat: loader memuat id yang dibutuhkan di latar lalu mengganti mesh (pola sama dengan
  rumah Jawa). Gagal muat → rumah prosedural lama (fallback).

## Anggaran

48 model ±1–4 ribu segitiga, dimuat **hanya** untuk rumah warga yang ada (lazy), bukan saat start.
Satu rumah warga = 1 draw call setelah `compactObject` (material sama, vertex color).

## Belum di versi ini

- Kendaraan bisa dikendarai.

## Supabase (2026-11-13)

- Tabel `home_kits` (24 baris, PK village+profession, RLS baca-semua) = salinan `home_catalog.js`.
  Ubah daftar = ubah keduanya, lalu jalankan ulang `schema.sql` (upsert idempoten).
- `players`: `house_model`, `house_label`, `vehicle_model`, `vehicle_label`, diisi `register_player` dari `home_kits`.
- `buildings`: `pf_house`, `pf_vehicle`, `vehicle_len`; indeks unik satu rumah awal per pemilik. `get_buildings` mengembalikannya.
- RPC `register_home(p_i, p_j)`: wajib login & sudah daftar; kit dari server (bukan klien); kavling harus di desa
  pemain (`village_of_plot`) dan kosong; `stage proyek`, selesai `now() + 5 menit` (jam server); idempoten.
- Klien: setelah `register_player` sukses, panggil `registerHome`; hasil server (model, jam bangun, `server_id`)
  menimpa data lokal. `main.js` tidak memuat baris server yang `server_id`-nya sudah ada di cache lokal.
- Diuji di Postgres 16 (Docker, stub `auth.uid`): 24 kit, salah desa ditolak, kavling dobel ditolak, tanpa login ditolak, panggilan kedua idempoten, durasi 5 menit.