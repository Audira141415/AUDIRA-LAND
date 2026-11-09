# AUDIRA LAND

Kota pulau isometrik. Warga datang naik kapal feri, dapat rumah dan pekerjaan.

## Jalankan lokal

Butuh Node 22.13+ (pakai SQLite bawaan Node, tanpa `npm install`).

```bash
npm run seed        # 1.000 warga contoh (opsional)
npm run seed:antre  # 20 warga contoh antre kapal (opsional)
npm run dev         # http://localhost:5173  ·  admin: http://localhost:5173/admin
```

Saat pertama jalan, server membuat `ADMIN_TOKEN` di `server/.env`. Pengaturan lain ada di `server/.env.example`.
Hapus semua data contoh: `npm run seed:hapus`. Buka `/?demo` untuk mode demo tanpa server.

Deploy ke VPS (systemd + Caddy HTTPS, cadangan harian): lihat [DEPLOY.md](DEPLOY.md).

## Peta: dua kawasan

Pulau 112×64 petak, dibelah sungai dengan 3 jembatan kayu (`js/world.js`, semua deterministik dari `SEED`).

| | Kampung Nyiur (barat) | Kota Cakrawala (timur) |
|---|---|---|
| Rumah | rumah panggung bambu, dinding anyaman, atap rumbia daun kelapa (5 penghuni) | villa modern bertingkat dengan kolam renang (3 penghuni), apartemen |
| Kerja | warung bambu, kebun kelapa, sawah, Pasar Rakyat Nyiur, puskesmas | menara kantor kaca, mal, butik, Balai Kota, Menara AUDIRA, sekolah, pelabuhan feri |
| Jalan | tanah padat, tanpa mobil | aspal bermarka, mobil |

Detail Kampung Nyiur: rumah panggung (tiang + tangga) atau rumah darat berteras dengan emperan rumbia; halaman berisi properti acak (jemuran kain, sumur timba, kandang ayam, kayu bakar, gentong, pagar bambu, kelapa); Pasar Rakyat berupa lapak bambu; perahu jukung bercadik di pantai; pos ronda dengan kentongan. Animasi (`js/kampung.js`): asap dapur, ayam berkeliaran di halaman, layangan di atas sawah (siang), pelita di pintu (malam).

Rumah dan kerja warga tetap ditentukan nomor urut (`seq`), jadi warga bisa tinggal di kampung dan bekerja di kota (menyeberang jembatan) atau sebaliknya. **Mengubah peta mengubah rumah, kerja, dan gaji semua warga**; server membaca `js/world.js` saat mulai, jadi restart server setelah mengubahnya.

**Kunci peta**: server menyimpan sidik jari peta (rumah, kerja, jabatan, gaji untuk warga ke-1 s.d. 20.000). Kalau `js/world.js` berubah setelah ada warga, server menolak jalan. Kembalikan perubahan, atau jalankan sekali dengan `IZINKAN_UBAH_PETA=1` bila memang disengaja.

## Kota tumbuh bersama warga

- Semua kavling mulai sebagai **tanah kosong berpatok** dengan papan "RENCANA RUMAH / SAWAH / KANTOR / SEKOLAH …". Hanya Balai Kota, Menara AUDIRA, dermaga, dan mercusuar yang sudah berdiri.
- Bangunan berdiri saat **warga pertama tinggal** (rumah, villa, apartemen, rumah bambu) **atau bekerja** di kavling itu (sawah, kebun, warung, kantor, mal, sekolah, dll). Asap dapur, ayam, pelita, dan layangan juga baru muncul di kavling yang hidup.
- Rumah diisi dari pusat tiap kawasan ke luar; Kampung dan Kota bergantian sebanding kapasitasnya.
- **Pekerjaan mengikuti kawasan rumah**: warga Kampung bekerja di sawah, kebun, warung, pasar, puskesmas; warga Kota di kantor, mal, butik, sekolah, balai, menara, pelabuhan. Tempat kerja dekat pusat diisi duluan (maks 4 orang per tempat di putaran pertama).
- Semuanya diturunkan dari nomor urut warga (`seq`), jadi server (gaji/kerja) dan semua perangkat tetap sama. Ubah peta (`js/world.js`) **sebelum** warga asli masuk; mengubahnya kemudian menggeser rumah & pekerjaan semua warga.

## Huruf raksasa "CITY HAVE" & "CITY HAVE NOT"

Dua tulisan besar ala huruf di bukit (`js/landmark.js`), satu huruf per petak, lokasinya dicari otomatis di deret petak rumput/pasir kosong:
- **CITY HAVE** di Kota Cakrawala (utara pusat kota, dekat pantai): huruf putih mengilap berpunggung baja di atas kaki beton; malam hari bercahaya putih hangat.
- **CITY HAVE NOT** di Kampung Nyiur (dekat pantai barat daya): huruf anyaman daun kelapa disangga dua tiang bambu dan diikat ijuk; malam hari diterangi pelita kecil.

## Flyover penyeberang sungai

Tiga jembatan datar diganti flyover (`js/flyover.js`): dek aspal setinggi 0,8 di atas sungai dengan tanjakan 2 petak di tiap ujung, pilar beton, pagar dua sisi, dan tiang lampu. Warga dan kendaraan yang lewat ikut naik mengikuti tanjakan (`AL.groundZ`). Malam hari untaian LED warna-warni di pagar berkelip berkejaran, kepala lampu berdenyut, dan cahayanya memantul di air.

## Pusat pemerintahan

Sudah berdiri sejak awal di dekat pusat tiap kawasan (`js/pemerintahan.js`, lokasi & jabatan di `js/world.js`):

| Kawasan | Gedung | Jabatan (naik tiap 5 level) | Gaji dasar/hari |
|---|---|---|---|
| Kota Cakrawala | Balai Kota, Menara AUDIRA, **Gedung DPRD** (kubah & pilar), **Kantor Camat**, **Polsek**, **Kantor Pos**, **Pos Damkar** | mis. DPRD: Staf Sekretariat → Ketua DPRD; Polsek: Bhayangkara → Kapolsek | DPRD 150, Camat 120, Polsek 115, Damkar 100, Pos 85 |
| Kampung Nyiur | **Kantor Lurah** (pendopo joglo + kentongan), **Kantor Camat**, **Pos Polisi** | Lurah: Staf Kelurahan → Lurah | Lurah 95 |

Pegawainya warga sendiri: pekerjaan tetap mengikuti kawasan rumah. Pegawai Kantor Pos dapat bonus profesi di mini-game Kurir.

## Landmark: Tugu Dua Tepi

Berdiri di tengah sungai pemisah Kampung Nyiur dan Kota Cakrawala, di utara jembatan tengah (`js/landmark.js`). Tiang kiri bambu beranyam daun kelapa (kampung), tiang kanan kaca & baja (kota); lengkung separuh bambu separuh baja bertemu di lambang AUDIRA emas. Malam hari lambang menyala dan memancarkan dua sorot: hangat (kampung) dan sejuk (kota). Ketuk tugu untuk kartu berisi maknanya dan jumlah warga tiap kawasan.

## Alur warga

1. Pengunjung klik **Jadi warga**, isi username Instagram, centang persetujuan → status `pending`.
2. Admin cek profil lalu **Setujui** → dapat nomor urut (`seq`) dan kursi kapal berikutnya (maks `FERRY_CAP` per kapal, tiap `FERRY_EVERY_S` detik).
3. Saat kapal sandar, warga turun dan berjalan ke rumahnya. Rumah & kerja dihitung dari `seq`, jadi semua perangkat melihat hal yang sama.
4. **Minta keluar dari kota** → masuk daftar admin → **Hapus dari kota**.

Tidak ada verifikasi identitas otomatis: siapa pun bisa mengetik username orang lain. Itu sebabnya setiap pendaftar perlu disetujui admin.
Tidak ada scraping Instagram.

## Dompet & ekonomi

Tombol dompet (paling atas di kolom kanan peta). Masuk dengan username + kode KTW (sesi sama dengan Taman/pesta).

- **Saldo** = gaji yang sudah terkumpul sejak tiba (rumus yang sama dengan kartu warga, dihitung server dengan menjalankan `js/world.js` di Node) + buku besar (`ledger`). Saldo bertambah tiap detik.
- **Pemasukan**: gaji otomatis, **absen harian** (50 + 5×level koin, sekali per hari WIB), kiriman warga lain, hadiah admin (*Cari & hapus warga* › **Beri koin**, boleh minus untuk koreksi).
- **Pengeluaran**: **Butik** aksesori avatar (kepala, mata, leher, aura; 450–12.000 koin). Barang yang dibeli langsung dipakai dan tampil di peta, Taman, dan pesta (perubahan tampil langsung di room realtime).
- **Kirim koin** ke warga lain: min 10, maks 5.000 per hari per pengirim, tidak bisa ke diri sendiri.
- Koin hanya berlaku di dalam game: tidak bisa dibeli dengan uang dan tidak bisa dicairkan.

## Mini-game kerja

Pill **Kerja** di kiri bawah peta → `/kerja`. Tiga pekerjaan, ronde 30 detik (+3 dtk hitung mundur), sentuh atau klik:

| Game | Cara main | Skor | Koin/poin | Bonus profesi ×1,5 |
|---|---|---|---|---|
| Nelayan · Pancing Teluk | kail berayun, ketuk untuk menjatuhkan | ikan +1, ikan emas +3, sepatu 0 (maks 40) | 6 | kerja di pelabuhan |
| Petani · Panen Kilat | sawah 4×4, padi matang 1,2 dtk | matang +1, masih hijau −1 (maks 90) | 3 | sawah/taman |
| Kurir Pasar · Sortir Paket | paket turun makin cepat, pilih gerobak sewarna | benar +1, salah −1 (maks 80) | 3,5 | pasar/toko |

- Tanpa login = **Latihan** (tanpa koin). Warga KTW: ronde dibuka server (`seed` + waktu mulai), lalu skor dikirim di akhir.
- **Skor diputar ulang di server.** Logika game ada di `js/kerja-sim.js` (langkah tetap 1/60 dtk) dan dipakai peramban maupun server. Klien hanya mengirim daftar ketukan `[langkah, x, y]`; server menjalankan ulang ronde dari seed yang sama dan memakai skor hasilnya. Skor kiriman klien diabaikan.
- Ronde dibatalkan bila: ketukan > 15 per detik, > 360 ketukan, ketukan "dari masa depan" menurut jam server, selesai < 28,5 dtk, atau > 3 menit. Satu ronde aktif per warga.
- Bot yang mengetuk dengan pola manusia tetap mungkin; papan peringkat hanya untuk warga yang disetujui admin dan punya kode KTW.
- Batas: 400 koin dari kerja per hari (sisanya terpotong), 25 ronde per hari. Upah masuk buku besar dengan jenis `kerja` dan tampil di riwayat dompet.
- "Hasil kota hari ini" menjumlah ikan, ikat padi, dan paket dari semua warga.

### Papan peringkat & juara mingguan

- Di `/kerja` (bagian **Papan peringkat**, tautan langsung `/kerja.html#peringkat`): 10 besar tiap pekerjaan, **Minggu ini** atau **Hari ini**. Satu baris per warga (skor terbaiknya); seri dimenangkan yang lebih dulu mencapainya. Warga yang dihapus tidak tampil.
- Kartu pekerjaan menampilkan peringkat mingguanmu; layar akhir ronde memberi tahu rekor pribadi baru dan posisimu.
- Minggu berjalan Senin 00.00 – Minggu 23.59 WIB. Setelah minggu ditutup, juara 1/2/3 tiap pekerjaan otomatis dapat **1.000 / 600 / 300 koin** (jenis `juara` di dompet), dan Koran memuat pengumuman juara.
- Juara minggu lalu dapat lencana 🥇🥈🥉 di kartu warganya di peta, selama seminggu.

## Pesta Rumah

Warga KTW (sudah masuk di Taman, token tersimpan di perangkat) bisa membuka pesta 60 menit di rumahnya lewat tombol **Pesta** di peta.

- Tema: **Nongkrong santai**, **Pesta dansa** (lampu disko, bola disko), **Karaoke** (panggung + mic), **Ulang tahun** (kue berlilin, balon, spanduk).
- Di peta muncul balon di atas rumah tuan rumah; kartu rumahnya punya tombol **Datang ke pesta**. Daftar semua pesta ada di tombol **Pesta**.
- Ruang pesta = room realtime sendiri (mesin Taman, peta `js/pesta-map.json`), maks 30 tamu. Aturan obrolan sama dengan Taman: tamu bisa jalan & emote, warga KTW bisa ngobrol.
- Tuan rumah bisa **Tutup pesta** kapan saja; pesta juga otomatis selesai setelah 60 menit. Semua tamu dipulangkan dengan layar "Pestanya sudah usai".
- Batas: satu pesta per warga per 6 jam, maks 20 pesta bersamaan. Admin yang menghapus warga juga menutup pestanya.

## Radio AUDIRA FM 99,1

Tombol radio ada di kolom kanan peta dan di header Taman. Pendengar harus mengetuk **Putar** (aturan peramban: suara butuh ketukan).

- **Putaran** = lagu generatif + lagu unggahan, bergantian. Posisi siaran dihitung dari jam server sejak `epoch`, jadi semua pendengar mendengar bagian yang sama; yang baru menyalakan langsung masuk di tengah lagu.
- **Lagu generatif** lo-fi (150 dtk) disintesis WebAudio di perangkat: akord, bass, drum, melodi, derau piringan hitam. Judul, kunci, tempo, dan progresi diturunkan dari seed, jadi sama untuk semua orang. Tanpa file dan tanpa hak cipta pihak lain.
- **Lagu unggahan**: admin › *Radio* › unggah MP3 (maks 20 MB, wajib isi lisensi/sumber). Durasi dibaca di peramban admin. Disajikan dari `/media/` dengan dukungan Range supaya bisa lompat ke posisi siaran.
- **Penyiar**: suara sintetis peramban berbahasa Indonesia (`speechSynthesis`) membacakan jam, kabar teratas, acara hari ini, warga baru, sponsor, dan lagu berikutnya; musik dipelankan saat penyiar bicara. Jeda minimal diatur admin. Kalau perangkat tidak punya suara `id-ID`, naskah tetap tampil sebagai teks.
- Mengubah pengaturan atau daftar lagu memulai putaran baru (epoch baru) untuk semua pendengar.

## Slot Sponsor

Tiga jenis slot, dihitung otomatis dari peta (sama di semua perangkat):

| Slot | Id | Tampilan |
|---|---|---|
| Papan reklame | `papan:x,y` | papan di tepi jalan (±7 lokasi), nama + tagline |
| Hologram | `holo:<kavling>` | panel melayang beranimasi di atas menara/kantor pusat kota |
| Toko bermerek | `toko:<kavling>` | toko diwarnai merek, papan nama merek |

Admin › *Slot Sponsor*: pilih slot, nama (maks 24 huruf), tagline, dua warna, tautan https, tanggal mulai–selesai, catatan internal. Pratinjau visual langsung di form. Satu slot hanya untuk satu merek di periode yang sama.

- **Tayangan** = kartu mitra dibuka, **klik** = tombol *Kunjungi* (lewat `/api/sponsor/klik`, 302 ke tautan). Masing-masing dihitung sekali per jam per pengunjung; CTR tampil di admin.
- **Tautan pratinjau** (`/?pratinjau=…`): tombol di admin menyalin tautan yang menampilkan merek calon mitra di slot pilihan, hanya di perangkat pembuka, tanpa menyimpan apa pun. Kirim ke calon mitra sebagai alat jualan.
- Perubahan sponsor tampil di peta paling lambat ±1 menit (cache 30 detik).

## Koran: Kabar & Kalender Kota

Tombol koran di kolom kanan peta membuka **Kabar** (berita/pengumuman, bisa disematkan, tautan hanya https) dan **Kalender** (acara 60 hari ke depan, tanggal WIB). Titik merah muncul kalau ada kabar yang belum dibaca di perangkat itu. Admin mengelola keduanya di `/admin` › *Kabar Kota* dan *Kalender Kota*.

### Kabar untukmu

Tab **Untukmu** di Koran (warga KTW yang sudah masuk): kejadian pribadi 14 hari terakhir, terbaru di atas, maks 30.

| Kabar | Sumber |
|---|---|
| ⬆️ Naik level, 🎖️ naik jabatan (tiap 5 level) | dihitung dari rumus jabatan (`AL.career`) dan tanggal tiba |
| 🏃 Disalip di papan peringkat | disimpan saat warga lain menyalip posisimu di 10 besar mingguan (maks sekali per 6 jam per pelaku per pekerjaan) |
| 💌 Kiriman koin, 🎁 hadiah admin, 🏆 hadiah juara | buku besar (`ledger`) |
| 🧳 Penghuni baru di rumahmu | warga lain yang tiba di kavling rumah yang sama |
| ⛴️ Hari pertama tiba | tanggal tiba |

Titik merah di tombol koran dan di tab Untukmu menyala kalau ada kabar pribadi yang belum dibuka di perangkat itu. Kalau kabar kota sudah terbaca, koran langsung membuka tab Untukmu.

## Lencana

Dompet › **Lencana**: 11 lencana yang didapat otomatis dari kegiatan. Yang belum didapat menampilkan kemajuannya. Warga memilih **satu** untuk dipakai: ikonnya tampil di depan nama di Taman dan pesta (langsung, realtime) dan di kartu warga di peta.

| Lencana | Syarat |
|---|---|
| 🥇 Juara Emas · 🏅 Naik Podium | juara 1 / masuk 3 besar papan kerja mingguan |
| 🧭 Warga Perintis | 100 warga pertama |
| ⭐ Pejabat Tinggi | Lv 26 |
| 🏛️ Sesepuh Pulau · 🏡 Warga Setia | tinggal 100 / 30 hari |
| ⚒️ Pekerja Keras | 50 ronde kerja berskor |
| 📅 Rajin Absen | 7 kali absen harian |
| 🤝 Dermawan | kirim total 1.000 koin |
| 🎉 Tuan Rumah | buka 3 pesta rumah |
| 🛍️ Kolektor Butik | punya 5 aksesori |

Syarat dicek server saat lencana dipakai (`server/lencana.mjs`).

## Taman Warga (realtime)

Buka `/taman.html` (atau tombol **Taman** di peta, atau tombol **Masuk Taman** di kartu taman). Klik petak untuk berjalan, tombol emote untuk 👋 ❤️ 😂 💃.

- **Tamu** bisa jalan dan pakai emote, tapi tidak bisa ngobrol.
- **Warga KTW** bisa ngobrol. Alurnya: admin buka `/admin` › *Cari & hapus warga* › **Buat kode KTW**. Kode 8 huruf tampil sekali (server hanya menyimpan hash-nya), lalu admin kirim lewat DM Instagram. Warga masuk di Taman dengan username + kode, lalu dapat token sesi yang disimpan di perangkatnya.
- Satu warga hanya bisa aktif di satu tab; tab lama dikeluarkan.
- Moderasi: pesan maks 120 huruf, jeda 1,5 dtk, tautan diganti `[tautan]`, kata kasar disensor. Admin bisa **Bisukan** atau **Hapus** (hapus juga mengeluarkan dari Taman dan mencabut sesi).
- Maks 60 orang per taman.

Protokol WebSocket `/ws/taman` (JSON, hanya dari Origin situs ini sendiri):

| Arah | Pesan |
|---|---|
| klien → server | `{t:'hello', token?}` (wajib pertama, dalam 8 dtk) · `{t:'move', x, y, fx, fy}` · `{t:'say', m}` · `{t:'emote', e}` |
| server → klien | `welcome {you, users, chat, tokenOk}` · `badge {id, b}` · `join {u}` · `leave {id}` · `move {id, x, y, fx, fy}` · `say {id, name, m, ts}` · `emote {id, e}` · `err {m, fatal?}` |

Server hanya menyimpan petak tujuan tiap orang; jalur dihitung sama di semua klien (BFS pada `js/taman-map.json`), dimulai dari `fx, fy`.

## Fitur kota

Semua modul di bawah didaftarkan di `server/server.mjs` (`MODS`) dan bisa dibuka dari tombol **Jelajah** di peta, kartu warga, atau tombol alat di kanan.

| Fitur | Server | Klien | Dibuka dari |
|---|---|---|---|
| Balai Warga (KTW, Buku Warga) | `server/balai.mjs` | `/balai`, `js/balai.js` | Jelajah, kartu warga › Kartu warga |
| Rumahku (ruang dalam, perabot, ketuk pintu, stiker) | `server/rumah.mjs` | `/rumah?u=`, `js/rumah.js` | Jelajah, kartu warga › Masuk rumah |
| Surat & teman | `server/surat.mjs` | `js/surat.js`, `css/surat.css` | tombol amplop, kartu warga › Kirim surat |
| Voting warga | `server/voting.mjs` | `js/voting.js`, `css/kota.css` | tombol kotak suara |
| Corong Kota (siaran 30 dtk, donasi Saweria) | `server/corong.mjs` | `js/corong.js`, `css/kota.css` | banner di atas peta, dialog Voting |
| Lomba & Event | `server/lomba.mjs` | `/event`, `js/event.js`, `css/event.css` | Jelajah |
| Pantai Nyiur (room realtime, maks 60) | `server/pantai.mjs` | `/pantai`, `js/pantai-config.js` | Jelajah |
| Cetak biru bangunan | `server/cetak.mjs` | `js/cetak.js` (validator), `js/cetak-gambar.js` (gambar) | admin › Cetak biru |
| Musim & intro harian | — | `js/musim.js`, `js/intro.js` | otomatis (uji: `?musim=hujan|agustus|tahunbaru|ramadan|lebaran`) |

Konfigurasi opsional di `server/.env`: `SAWERIA_URL` (tautan donasi Corong) dan `CORONG_HARGA` (teks harga, mis. `Rp10.000`).

Cetak biru: daftar primitif JSON per kavling (`kotak`, `jendela`, `atap`, `limas`, `kubah`, `tiang`, `bidang`, `pohon`, `teks`; format di kepala `js/cetak.js`). Kavling bercetak biru dianggap sudah berdiri walau belum ada warga. `GET /api/cetak` di-cache 60 dtk.

Belum tersambung: **Damkar** (`server/damkar.mjs`, event kebakaran bersama). Servernya ada, tetapi belum ada klien untuk menampilkan api dan tombol Siram, jadi sengaja tidak didaftarkan.

## API

| Metode | Path | Isi |
|---|---|---|
| GET | `/api/city?b=<ember15dtk>&after=<seq>` | `residents [seq,u,tiba,kapal]` dengan seq > `after` (klien hanya minta warga baru), `queue` utuh, jadwal kapal, `looks`, `juara`, `lencana` |
| GET | `/api/warga?u=` | status satu username |
| POST | `/api/daftar` | `{username, setuju:true}` |
| POST | `/api/keluar` | `{username}` |
| GET | `/api/kabar?b=<ember30dtk>` | 20 kabar terbaru (sematan dulu) + acara 60 hari ke depan |
| GET | `/api/kerja/kota` | hasil kerja seluruh kota hari ini |
| GET | `/api/kerja/peringkat?p=minggu\|hari` | 10 besar per pekerjaan, jumlah peserta, juara minggu lalu, hadiah, waktu tutup minggu |
| GET | `/api/kerja` | koin kerja hari ini, rekor, bonus profesi (header `Authorization: Bearer <token sesi>`) |
| POST | `/api/kerja/mulai` · `/api/kerja/selesai` | `{game}` → `{round, seed, durasi}` · `{round, ev:[[langkah,x,y],…]}` → `{score, koin, terpotong, bonus, sisaHariIni, peringkat, rekorBaru}` |
| GET | `/api/butik` | katalog aksesori |
| GET | `/api/dompet` | saldo, gaji, riwayat, barang (header `Authorization: Bearer <token sesi>`) |
| GET | `/api/kabarku` | kabar pribadi 14 hari terakhir `{items:[{t, kind, icon, text, link?, cari?}]}` (header `Authorization: Bearer <token sesi>`) |
| GET | `/api/lencana` | semua lencana + kemajuan + yang dipakai (header sama) |
| POST | `/api/lencana/pakai` | `{id}` atau `{id:null}` untuk melepas |
| POST | `/api/dompet/{absen,beli,pakai,kirim}` | `{}` · `{item}` · `{slot,item\|null}` · `{to,amount,note}` |
| GET | `/api/pesta` | pesta aktif, label tema |
| POST | `/api/pesta/buka` | `{token, theme}` |
| POST | `/api/pesta/tutup` | `{token}` |
| WS | `/ws/taman?room=pesta:<host>` | room pesta (protokol sama dengan Taman) |
| GET | `/api/radio` | epoch, rotasi, lagu aktif, jam server |
| GET | `/media/<file>.mp3` | lagu unggahan (mendukung Range) |
| GET | `/api/sponsor?b=<ember30dtk>` | sponsor yang sedang tayang |
| POST | `/api/sponsor/lihat` | `{id}` hitung tayangan |
| GET | `/api/sponsor/klik?id=` | 302 ke tautan mitra, hitung klik |
| GET | `/api/taman` | `{online, pantai}` |
| GET | `/api/balai/warga?u=` · `/api/balai/juara` | lencana, juara, rekor satu warga · papan juara |
| GET/POST | `/api/rumah`, `/api/rumah/{katalog,beli,pasang,ketuk,stiker,stiker/hapus}` | ruang rumah (header sesi untuk aksi) |
| GET/POST | `/api/surat/*` | percakapan, kirim, teman, minta, terima, tolak, batal, hapus, blokir, laporkan (header sesi) |
| GET/POST | `/api/voting` · `/api/voting/pilih` | polling aktif & riwayat · `{id, choice}` |
| GET/POST | `/api/corong`, `/api/corong/{riwayat,aku,ajukan}` | siaran yang tayang, riwayat, pengajuanku, `{text, donor}` |
| GET | `/api/lomba` | lomba berjalan, akan datang, selesai |
| GET | `/api/cetak` | cetak biru semua kavling |
| WS | `/ws/taman?room=pantai` | room Pantai Nyiur |
| POST | `/api/masuk` | `{username, kode}` → `{token}` |
| POST | `/api/sesi/hapus` | `{token}` |
| GET/POST | `/api/admin/{ringkas,cari,setujui,tolak,impor,hapus,pertahankan,kode,bisukan,kabar,kabar/hapus,acara,acara/hapus,sponsor,sponsor/hapus,radio,radio/atur,radio/unggah,radio/ubah,radio/hapus,koin}` · `/api/admin/{lomba,voting,corong,cetak,surat,rumah/stiker/hapus}…` | header `Authorization: Bearer <ADMIN_TOKEN>` |
