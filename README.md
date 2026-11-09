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

## Peta: dua kawasan

Pulau 112×64 petak, dibelah sungai dengan 3 jembatan kayu (`js/world.js`, semua deterministik dari `SEED`).

| | Kampung Nyiur (barat) | Kota Cakrawala (timur) |
|---|---|---|
| Rumah | rumah panggung bambu, dinding anyaman, atap rumbia daun kelapa (5 penghuni) | villa modern bertingkat dengan kolam renang (3 penghuni), apartemen |
| Kerja | warung bambu, kebun kelapa, sawah, Pasar Rakyat Nyiur, puskesmas | menara kantor kaca, mal, butik, Balai Kota, Menara AUDIRA, sekolah, pelabuhan feri |
| Jalan | tanah padat, tanpa mobil | aspal bermarka, mobil |

Detail Kampung Nyiur: rumah panggung (tiang + tangga) atau rumah darat berteras dengan emperan rumbia; halaman berisi properti acak (jemuran kain, sumur timba, kandang ayam, kayu bakar, gentong, pagar bambu, kelapa); Pasar Rakyat berupa lapak bambu; perahu jukung bercadik di pantai; pos ronda dengan kentongan. Animasi (`js/kampung.js`): asap dapur, ayam berkeliaran di halaman, layangan di atas sawah (siang), pelita di pintu (malam).

Rumah dan kerja warga tetap ditentukan nomor urut (`seq`), jadi warga bisa tinggal di kampung dan bekerja di kota (menyeberang jembatan) atau sebaliknya. **Mengubah peta mengubah rumah, kerja, dan gaji semua warga**; server membaca `js/world.js` saat mulai, jadi restart server setelah mengubahnya.

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
- Anti-curang dasar: selesai < 28,5 dtk ditolak, skor di atas batas wajar membatalkan ronde, satu ronde aktif per warga, ronde > 3 menit kedaluwarsa. Skor tidak diputar ulang di server, jadi ini pagar, bukan bukti.
- Batas: 400 koin dari kerja per hari (sisanya terpotong), 25 ronde per hari. Upah masuk buku besar dengan jenis `kerja` dan tampil di riwayat dompet.
- "Hasil kota hari ini" menjumlah ikan, ikat padi, dan paket dari semua warga.

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
| server → klien | `welcome {you, users, chat, tokenOk}` · `join {u}` · `leave {id}` · `move {id, x, y, fx, fy}` · `say {id, name, m, ts}` · `emote {id, e}` · `err {m, fatal?}` |

Server hanya menyimpan petak tujuan tiap orang; jalur dihitung sama di semua klien (BFS pada `js/taman-map.json`), dimulai dari `fx, fy`.

## API

| Metode | Path | Isi |
|---|---|---|
| GET | `/api/city?b=<ember15dtk>` | `residents [seq,u,tiba,kapal]`, `queue`, jadwal kapal |
| GET | `/api/warga?u=` | status satu username |
| POST | `/api/daftar` | `{username, setuju:true}` |
| POST | `/api/keluar` | `{username}` |
| GET | `/api/kabar?b=<ember30dtk>` | 20 kabar terbaru (sematan dulu) + acara 60 hari ke depan |
| GET | `/api/kerja/kota` | hasil kerja seluruh kota hari ini |
| GET | `/api/kerja` | koin kerja hari ini, rekor, bonus profesi (header `Authorization: Bearer <token sesi>`) |
| POST | `/api/kerja/mulai` · `/api/kerja/selesai` | `{game}` → `{round, seed, durasi}` · `{round, score}` → `{koin, terpotong, bonus, sisaHariIni}` |
| GET | `/api/butik` | katalog aksesori |
| GET | `/api/dompet` | saldo, gaji, riwayat, barang (header `Authorization: Bearer <token sesi>`) |
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
| GET | `/api/taman` | `{online}` |
| POST | `/api/masuk` | `{username, kode}` → `{token}` |
| POST | `/api/sesi/hapus` | `{token}` |
| GET/POST | `/api/admin/{ringkas,cari,setujui,tolak,impor,hapus,pertahankan,kode,bisukan,kabar,kabar/hapus,acara,acara/hapus,sponsor,sponsor/hapus,radio,radio/atur,radio/unggah,radio/ubah,radio/hapus,koin}` | header `Authorization: Bearer <ADMIN_TOKEN>` |
