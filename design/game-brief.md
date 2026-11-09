# Game Brief: AUDIRA LAND

**One-sentence pitch:** Follow AUDIRA, naik kapal ke pulau, lalu lihat namamu punya rumah, kerja, dan naik jabatan di kota yang tumbuh bersama komunitasnya.

## Core loop
- Daftar (username IG) → disetujui → tiba naik kapal, dapat rumah & kerja
- Buka peta → cari nama → kartu warga: jabatan, lama tinggal, saldo bertambah
- Mampir taman / baca koran → lihat warga lain dan kabar kota
- Bagikan kartu ke IG, ajak teman → kota makin ramai → kembali lagi

## Player goal & fail state — what "working" looks like
- Tujuan: punya tempat di kota dan naik jabatan seiring lama tinggal. Sesi terasa lengkap bila pemain menemukan namanya dan melihat ada yang berubah sejak kunjungan terakhir.
- Tidak ada kalah. Gagal = nama tidak ketemu atau kartu tidak berubah → pemain tidak kembali.

## MVP — what must exist to be the game
1. Peta pulau isometrik yang hidup (kapal, mobil, pejalan, siang-malam), lancar di HP murah
2. Daftar → disetujui admin → tiba naik kapal terjadwal
3. Cari nama + kartu warga (rumah, kerja, jabatan, saldo)
4. Jabatan & gaji naik sesuai lama tinggal
5. Admin: setujui/tolak, impor, hapus, permintaan keluar
6. Taman warga realtime (chat untuk pemegang kode KTW)
7. Koran & kalender kota

## Out of scope — not building this
- Scraping Instagram atau sinkron follower otomatis
- Uang asli, jual-beli antar warga, bursa saham
- Mini-game kerja, kompetisi/PvP
- Kota satelit, aplikasi native
- Slot sponsor baru (yang sudah dibuat tetap, tidak ditambah dulu)

## Build order
1. Deploy publik + uji alur daftar → kapal dengan 20 follower asli (paling belum terbukti)
2. Alasan kembali: kartu bisa dibagikan ke IG + kabar pribadi (naik jabatan, tetangga baru)
3. Acara terjadwal di taman supaya ramai di jam tertentu
4. Skala 10.000+ warga (kirim perubahan saja di `/api/city`)
5. Art bible lalu poles visual

---
**Who it's for / what they feel:** Follower IG AUDIRA di Indonesia, buka dari HP: bangga melihat namanya punya rumah, ingin pamer ke teman.

**Art & audio direction:** Isometrik low-poly pastel cerah, pulau tropis Nusantara, UI krem-navy-koral; audio lo-fi pantai (belum ada).

**Reference game:** Thaloria City — kedatangan warga dan kartu warga; tanpa saham, mini-game kerja, dan kota satelit.
