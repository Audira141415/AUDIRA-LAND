# 🏙️ AUDIRA-LAND

> **Kota 3D Gotong Royong Digital yang dibangun bersama oleh warga secara persisten di browser ponsel.**

---

## 🌟 Konsep & Fitur Utama

- **Dunia 3D Persisten**: Satu kota bersama yang dibagi menjadi 25 distrik (grid 5 × 5). Perubahan bangunan tersimpan permanen di cloud database.
- **Klaim & Bangun Mandiri**: Pemain mengklaim kavling kosong, lalu mendirikan rumah, warung, atau ruko dengan jam bangun nyata (*real-time hours*).
- **Ekonomi Gotong Royong**: Dapatkan koin dari bekerja di ruko warga atau fasilitas umum. Pajak harian otomatis masuk ke kas kota.
- **Demokrasi Pembangunan (Voting)**: Ajukan usulan pembangunan fasilitas umum (Masjid Raya, Rumah Sakit, Balai Warga, Taman Kota) untuk divoting oleh seluruh warga.
- **Dual Camera Mode**:
  - **Mode Peta (Isometrik 3D)**: Geser, cubit zoom, dan putar sudut pandang kota.
  - **Mode Tokoh (Walk 3D)**: Jelajahi jalanan dengan avatar, kontrol joystick, lari, lompat, balon chat, dan emote interaktif.
- **Gaya Visual Tinta Hangat**: Nuansa kertas krem, kayu cokelat, genteng terakota, dan aksen emas dengan garis tinta tipis khas Nusantara.
- **Zero Server Cost**: Dijalankan di Cloudflare Pages CDN berbicara langsung ke Supabase PostgreSQL via RPC berkeamanan tinggi.

---

## 🚀 Alur Pengembangan 11 Langkah

1. **Fondasi Data**: Skema Supabase, RLS, settings, distrik, dan `get_city_snapshot`.
2. **Peta Kosong**: Engine Three.js, grid deterministik, jalan, kavling, kamera sentuh, siang-malam WIB.
3. **Akun & Profil**: Supabase Auth, pendaftaran warga, pilihan profesi, HUD pemain.
4. **Klaim & Bangun**: RPC klaim baris terkunci, progres crane/proyek, model bangunan modular perdana.
5. **Ekonomi & Kerja**: Koin, kas kota, pajak harian, kerja harian, ticker berita kota.
6. **Voting Fasilitas**: Usulan bangunan publik, kuorum voting, pembangunan otomatis saat disetujui.
7. **Dunia Hidup**: Pejalan kaki NPC, lalu lintas kendaraan, instanced props trotoar.
8. **Gaya Visual Fasad**: Kalibrasi palet, outline siluet tinta, pencahayaan terukur, model fasad kaya budaya.
9. **Optimasi Performa**: Chunk merging 8 × 8, LOD drawRange, antrean bangun 8ms/frame, auto mode hemat.
10. **Sosial & Walk Mode**: Chat real-time, joystick virtual, animasi gerak, mode foto jam WIB.
11. **Rilis & Pratinjau**: Uji automated device 390px, validasi zero-leak, deployment produksi.

