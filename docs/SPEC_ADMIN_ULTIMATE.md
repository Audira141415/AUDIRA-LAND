# SPEC — Panel Pengelola Kota "Ultimate" (2026-11-13)

Tujuan: walikota bisa mengendalikan SELURUH kota dari satu panel, dan perubahan dunia (cuaca, waktu,
lalu lintas, keramaian, acara, mode perawatan) tampil di layar SEMUA warga, bukan hanya di layar admin.

## Prinsip
- Server tetap otoritatif. Semua aksi lewat RPC `admin_*` (`supabase/admin_panel.sql`) yang memanggil
  `assert_walikota()`. Panel hanya tampilan.
- Kontrol dunia disimpan di `settings.city_controls` (jsonb). `get_city_snapshot` sudah memuat baris
  `settings`, jadi warga menerimanya tanpa RPC baru. Klien warga memuat ulang snapshot tiap 45 dtk.
- Aturan main ditegakkan server lewat `public.city_block(kind)` di RPC warga
  (`register_home`, `claim_plot_and_build`, `work_at_building`, `harvest_building`,
  `submit_proposal`, `vote_proposal`, `send_chat`, `register_player`).
- Setiap aksi admin tercatat di `public.admin_audit` (siapa, aksi, detail, waktu).
- Chunk panel tetap lazy dan tidak mengimpor modul bundel utama. CSS panel disuntik oleh chunk.

## `settings.city_controls`
| Kunci | Nilai | Efek |
| :--- | :--- | :--- |
| `weather` | `bebas` / `auto` / `cerah` / `hujan` / `salju` | Paksa cuaca di semua layar (`bebas` = warga pilih sendiri) |
| `time` | `bebas` / `auto` / `siklus` / `fajar` / `siang` / `senja` / `malam` | Paksa waktu |
| `traffic` | 0–2 | Kecepatan lalu lintas (0 = jalan ditutup) |
| `crowd` | -1 (otomatis) atau 0–1 | Keramaian pejalan kaki/stadion/taman |
| `event` | `none` / `festival` / `kerja_bakti` / `pasar_malam` / `libur` / `darurat` | Spanduk acara kota |
| `event_title` | teks ≤ 60 | Judul spanduk |
| `wage_mult` | 0,5–3 | Pengali upah kerja (server) |
| `cooldown_min` | 0–120 | Jeda kerja (server, default 10) |
| `maintenance` | bool | Semua aksi warga ditolak server + spanduk |
| `maintenance_msg` | teks ≤ 120 | Pesan perawatan |
| `chat_locked` / `build_frozen` / `work_frozen` / `vote_frozen` | bool | Kunci fitur warga |

## Tab panel
1. 📊 Dasbor — KPI (kas, warga, aktif 24 jam, bangunan, proyek, kerja hari ini, koin beredar, chat 24 jam),
   grafik kerja per jam 24 jam, komposisi desa, aktivitas admin terbaru.
2. 🎛️ Kendali Dunia — cuaca, waktu, lalu lintas, keramaian, acara, mode perawatan, kunci fitur,
   + skenario sekali ketuk (Normal, Festival Malam, Badai, Kerja Bakti, Libur Nasional, Perawatan).
3. 💰 Ekonomi — kas ±, pengali upah, jeda kerja, batas koin harian, kuorum & durasi voting, nama kota,
   bansos merata (dari kas, filter desa).
4. 🏗️ Tata Kota — daftar semua bangunan (cari, filter tahap/jenis, halaman), lihat di peta, percepat,
   lindungi/buka, ganti jenis, pindah pemilik, gusur; selesaikan semua; dirikan fasilitas publik di kavling.
5. 🗺️ Distrik — 25 distrik: buka/kunci, ganti nama, biaya buka.
6. 👥 Warga — cari/filter/urut, saldo, peran (warga/arsitek), bisukan chat, bekukan akun, reset jeda, keluarkan.
7. 🗳️ Voting — semua usulan: setujui (+bangun), tolak, perpanjang 24 jam, hapus.
8. 📢 Siaran — pengumuman, kirim kabar kota per kategori, hapus kabar, moderasi chat, bersihkan chat.
9. 📜 Log — 100 aksi admin terakhir.

## Penerimaan
- Non-walikota: semua RPC baru 42501. Anon: tidak punya EXECUTE.
- Kontrol tersimpan → warga lain melihat efek ≤ 45 dtk; admin melihat seketika.
- Mode perawatan/kunci → RPC warga mengembalikan `success:false` dengan pesan jelas.
- HP 390 px: 0 elemen keluar layar, target sentuh ≥ 44 px, teks ≥ 12 px. JS awal gzip ≤ 160 KB.
