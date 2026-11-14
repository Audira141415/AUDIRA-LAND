# AUDIRA-LAND — Game Design Document & Architecture Guide

> **Visi**: Kota 3D Gotong Royong Digital yang dibangun bersama oleh warga netizen secara persisten, langsung di browser ponsel tanpa instalasi, didukung pipeline aset 3D Blender 5.2.2.

---

## 1. Identitas & Pilar Game

- **Nama Game**: **AUDIRA-LAND**
- **Slogan**: *"Kota Kita, Dibangun Bersama Warga"*
- **Genre**: Social 3D City-Builder & Citizen Life Simulator
- **Platform**: Web Mobile First (iPhone/Android via browser, responsive ke PC desktop)
- **Engine Renderer**: Three.js (r128 terkunci)
- **Database & Auth**: Supabase PostgreSQL 15+ dengan RLS & RPC Security Definer
- **Hosting**: Cloudflare Pages Edge CDN

---

## 2. Struktur Dunia & Sistem Distrik

Peta kota berbentuk grid 5 × 5 distrik (total 25 distrik):

```
+-----+-----+-----+-----+-----+
| k00 | k01 | k02 | k03 | k04 |  Ring 2: Pinggiran, Desa & Sawah Tropis
+-----+-----+-----+-----+-----+
| k05 | k06 | k07 | k08 | k09 |  Ring 1: Kawasan Perumahan & Kampung
+-----+-----+-----+-----+-----+
| k10 | k11 | k12 | k13 | k14 |  Ring 0: Pusat Kota / CBD (k12 di tengah)
+-----+-----+-----+-----+-----+
| k15 | k16 | k17 | k18 | k19 |  Ring 1: Kawasan Perumahan & Ruko
+-----+-----+-----+-----+-----+
| k20 | k21 | k22 | k23 | k24 |  Ring 2: Pinggiran & Ruang Terbuka Hijau
+-----+-----+-----+-----+-----+
```

- **Ring 0 (k12 - Pusat Kota)**: Distrik pertama yang langsung terbuka sejak awal game. Tempat berdirinya Balai Kota AUDIRA, Monumen Utama, dan kavling perdana.
- **Ring 1 (k06, k07, k08, k11, k13, k16, k17, k18)**: Distrik perumahan warga, sentra kuliner, warung kopi, dan ruko usaha.
- **Ring 2 (Distrik terluar)**: Distrik pedesaan, persawahan, bengkel, dan industri kreatif. Dibuka bertahap menggunakan kas kota yang terkumpul dari pajak dan donasi gotong royong.

---

## 3. Sistem Kavling & Jalan Deterministik

1. **Jalan Bertingkat**:
   - **Jalan Arteri**: Jalan protokol lebar dengan median hijau dan lampu jalan.
   - **Jalan Kolektor**: Jalan utama penghubung antar-distrik dengan trotoar 1.4 meter.
   - **Gang/Jalan Lingkungan**: Jalan santai antar-kavling rumah warga.
2. **Kavling Mandiri**:
   - Kavling 1 × 1 untuk rumah tinggal warga, warung kelontong, dan kedai kopi.
   - Kavling 2 × 2 atau 3 × 3 untuk ruko, klinik, kantor pos, dan taman RT.
   - Kavling Mega (4 × 4 ke atas) untuk fasilitas publik hasil voting (Rumah Sakit, Masjid Agung, Stadion Mini).
   - Seluruh kavling dihitung deterministik dari formula `grid_version` sehingga posisi jalan dan nomor kavling tidak membebani database.

---

## 4. Dua Mode Kamera Utama

### Mode A: Peta Isometrik 3D (Default)
- **Sudut Pandang**: Kamera orbital menunduk 41° dengan zoom terkunci 30°–49°.
- **Interaksi**:
  - Seret 1 jari / klik kiri: Pan menggeser peta.
  - Cubit 2 jari / gulir mouse: Zoom in/out.
  - Rotasi 2 jari / klik kanan: Memutar arah pandang kota 90°.
  - Ketuk kavling/bangunan: Membuka *Bottom Sheet* informasi pemilik, tahap bangun, dan tombol interaksi.

### Mode B: Tokoh / Avatar 3D (Walk Mode)
- **Sudut Pandang**: Third-person camera setinggi mata 1.55 m, FOV 65°–75°.
- **Kontrol Mobile**:
  - Floating virtual joystick di area kiri-bawah layar dengan deadzone 12%.
  - Tombol aksi jempol kanan: Lompat (76px), Lari (56px), Emote (56px), Balon Chat (56px).
- **Emote Interaktif**:
  - 👋 Lambai
  - 🕺 Joget
  - 🪑 Duduk santai di trotoar/warung
  - 🙌 Hore
- **Kontrol Desktop**: WASD untuk gerak, Spasi untuk lompat, Shift untuk lari, tombol 1–4 untuk emote.

---

## 5. Ekonomi & Loop Gotong Royong

- **Mata Uang**: Koin Audira (₳).
- **Penghasilan**:
  - Bekerja di ruko/warung warga lain atau fasilitas umum (maksimal batas harian misal 300 ₳).
  - Hasil sewa kamar/ruko milik sendiri yang diisi pekerja lain.
- **Pengeluaran**:
  - Biaya klaim kavling dan material konstruksi.
  - Biaya percepatan konstruksi jam nyata.
  - Pajak harian warga (10 ₳) yang otomatis masuk ke **Kas Kota AUDIRA**.
- **Voting Bangunan Publik**:
  - Warga dapat mengajukan usulan fasilitas baru.
  - Membutuhkan kuorum suara minimal setuju (misal 5–25 suara) dalam jendela waktu 24 jam.
  - Begitu lolos voting, kas kota mendanai dan proyek konstruksi crane dimulai secara otomatis.

