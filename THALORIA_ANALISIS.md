# Analisis thaloriacity.com + Blueprint Game Serupa (AUDIRA LAND)

Tanggal scrape: 9 Nov 2026. Sumber: halaman publik, `residents.json`, endpoint `/api/*` yang dipanggil halaman, header komentar file JS.
Catatan: kode, nama, dan aset Thaloria milik pemiliknya. Dokumen ini hanya membedah konsep & arsitektur. Bangun versi sendiri dengan kode, nama, dan gambar orisinal.

---

## 1. Konsep inti

**"Kota virtual isometrik yang dihuni follower Instagram."**

- Siapa pun yang follow `@thaloriacity` otomatis jadi warga.
- Warga baru "tiba" naik pesawat di Bandara, jadwal penerbangan beberapa kali sehari (tiap 5 menit di jam tertentu).
- Tiap warga dapat: rumah/unit rusun, tempat kerja, jabatan (naik seiring lama tinggal), gaji, saldo.
- Nama warga bisa dicari di peta.
- Saat scrape: **26.889 warga**, milestone 100.000 warga dirayakan dengan tugu.

Loop growth-nya: konten IG → follow → "nama saya ada di kota" → share → follow lagi. Game adalah mesin akuisisi follower.

## 2. Fitur yang terlihat

| Area | Halaman | Isi |
|---|---|---|
| Peta Kota | `/` (index) | Peta isometrik, rumah, rusun, kantor, ibadah, sekolah, pasar, mall, stadion, bandara, pesawat & mobil bergerak, pencarian warga |
| Taman Warga | `/taman.html` | Ruang sosial: jalan-jalan, ngobrol, nongkrong pakai avatar |
| Alun-alun | `/alun.html` | Area hangout: Alun-alun, Air Panas, Pantai, Sawah + arena |
| Rumahku | `/rumah.html` | Rumah pribadi, prabot, mobil, stiker dari tamu, "ketuk pintu" |
| Balai Warga | `/balai.html` | KTW (Kartu Tanda Warga), lencana, gelar, Buku Warga |
| Kerja | `/kerja.html` | Mini-game kerja: petani, nelayan, koki, polisi razia; hasil dipakai kota |
| Bursa Saham | `/saham.html` | Beli saham perusahaan kota pakai saldo game, harga ikut aktivitas kerja, dividen tiap 2 hari |
| Event | `/event` | Halaman event/lomba |

Fitur lintas halaman (bar bawah + kolom ikon kanan):
- **Radio Thaloria 99.9**: musik lo-fi bebas royalti, crossfade 4 dtk, penyiar AI ("Nala") muncul berkala.
- **Koran Thaloria**: headline, pengumuman walikota, kalender kota.
- **Pesan Warga** & **Surat** (DM antar warga, tambah teman).
- **Dompet**: saldo, gaji per detik (gaji/86.400), asal penghasilan.
- **Kabar untukmu**: notifikasi kejadian pribadi.
- **Toa Kota**: siaran pesan 30 detik ke semua warga online, berbayar via Saweria (min Rp5.000).
- **Pesta Rumah**: warga buka pesta 1 jam, balon muncul di atas rumahnya di peta, warga lain bisa masuk.
- **Voting warga**: menentukan fasilitas kota berikutnya.
- **Musim/event dekorasi**: Halloween, musim hujan, cut-scene intro 2,5 dtk sekali sehari.
- **Lencana & gelar**: 1 gelar + 1 lencana di atas kepala avatar.
- **Damkar**: event kebakaran (endpoint `/api/damkar`).

## 3. Monetisasi

1. **Sponsor in-world**: papan reklame (S/M/L petak), hologram di puncak gedung, restoran yang bisa diambil alih merek, "peternakan mitra" 2×2 kavling (contoh: New Yolk). Kontak sewa via WhatsApp.
2. **Mode demo mitra**: `/?demo=<merek>` menampilkan merek calon sponsor di kota asli, hanya lokal di perangkat. Alat jualan yang cerdas.
3. **Saweria**: Toa berbayar, bundel item (mis. Bundel Halloween ≥ Rp30.000: topi, kostum, hewan, aura).
4. **Lomba berhadiah** dari sponsor (Rp500.000) mendorong engagement.

## 4. Arsitektur teknis

**Frontend: vanilla JS, tanpa framework.** Multi-page (`.html` per area), skrip klasik bernama Bahasa Indonesia, versi via `?v=N`.

| File | Ukuran | Peran |
|---|---|---|
| `ringan.js` | 2 KB | Deteksi perangkat lemah (`deviceMemory ≤ 2GB`) → tier `lemah`/`biasa`, dimuat paling awal |
| `kota.js` | 595 KB | Mesin peta kota (dulu inline, dipindah supaya CSP ketat + bytecode cache V8) |
| `karakter.js` | 223 KB | Avatar prosedural dari seed + jenis kelamin, aksesoris, hewan pendamping. **Semua digambar kode, tanpa file gambar** |
| `dompet.js` | 96 KB | Sidebar ikon seragam: Dompet, Surat, Kabar |
| `toa.js` | 27 KB | Siaran berbayar |
| `lencana.js` | 23 KB | Lencana & gelar, dipakai server + klien |
| `pesta-rumah.js` | 21 KB | Pesta rumah |
| `intro.js` + `intro/<tema>.js` | 19 KB | Mesin cut-scene + file tema per event |
| `musim.js` | 18 KB | Lapisan dekorasi musiman, klien saja |
| `cetak.js` | 10 KB | **Cetak biru bangunan**: 1 bangunan = 1 blok JSON bentuk primitif |
| `radio.js` | 8 KB | Mesin radio |
| `hunian.js` | 5 KB | Daftar gedung hunian, kuota, alamat; dipakai bersama klien & server |

**Rendering: Canvas 2D** (bukan WebGL, bukan Pixi/Phaser).
- Proyeksi isometrik digambar manual dengan poligon.
- Bangunan statis di-cache sebagai sprite per kavling (kanvas kecil), ditempel tiap frame.
- Tangga skala sprite 1,25× supaya pinch-zoom tidak me-render ulang; zoom maks HP 5×.
- Resolusi dibatasi (1,5× laptop, 2× HP), turun otomatis kalau FPS jatuh.
- Mobil: badan dari sprite kecil, lampu sorot pakai blend `lighter`.
- Warga di jalan dibatasi 70 (HP 40); cek ±1.500 warga per frame bergiliran.

**Tata kota:**
- Grid: blok 6×6 berisi 2×2 kavling 3×3, jalan 1 lajur tiap 7 petak, jalan protokol 2 lajur.
- Nama jalan: utara-selatan = nama burung, barat-timur = nama bunga.
- Kawasan hunian berpola tetap dari **hash posisi**, jadi semua perangkat melihat kota identik tanpa kirim data per petak.
- Kota satelit dibuka saat warga melewati ambang (`sats`/`satc`: 50.000, 100.000).
- Pembangunan punya `t0` dari server, jadi semua penonton lihat progres sama.

**Data & server:**
- `residents.json` (±60 KB) = satu snapshot kota: jumlah warga, radio, pengumuman, kalender, jadwal penerbangan, sponsor, cetak biru bangunan (`cb`), snapshot kavling (`snap`), warga baru (`baru`).
- Data warga individual **tidak** dikirim penuh: kota diturunkan deterministik dari jumlah & seed. Hemat bandwidth untuk 26K+ warga.
- Polling dalam "ember" 15 detik (`?t=<bucket>`) supaya Cloudflare cache menjawab; jadwal polling diacak.
- Hosting di belakang **Cloudflare** (beacon, speculation rules, RUM).
- Endpoint: `/api/toa`, `/api/pesta-rumah`, `/api/damkar`, `/api/saham/ringkas`, `/media/*` (webp, mp3).
- Admin terpisah (`/admin.html`, di-disallow robots): editor kota, panel warga (kunci level, judul jabatan khusus), tempel cetak biru.

**Contoh cetak biru (`cb`) bangunan:**
```json
{"n":"Gereja Thaloria","uk":1,"jenis":"Tempat ibadah",
 "g":[["kotak",0.2,0.2,3.6,3.6,1,"#cfd8c4"],["kotak",1,0.4,2,2.6,34,"#f2ede4"],["jendela",1,0.4,2,...]]}
```
Bangunan = daftar primitif (`kotak`, `jendela`, …) dengan posisi, ukuran, tinggi, warna. Tidak ada kode dieksekusi, aman ditempel admin.

**Sinkron follower IG:** daftar `baru` berisi `[username, timestamp_jadwal]`. Kemungkinan besar diambil berkala dari daftar follower (scraper/API pihak ketiga) lalu dijadwalkan ke penerbangan berikutnya.

## 5. Kenapa ini berhasil

1. **Identitas personal**: namamu ada di kota, punya rumah & pekerjaan. Orang suka mencari namanya sendiri.
2. **Gratis & tanpa login berat**: cukup follow.
3. **Hidup terus**: pesawat datang tiap 5 menit, mobil lalu-lalang, radio menyala, gaji naik per detik.
4. **Konten IG otomatis**: tiap milestone, lomba, bangunan baru = bahan posting.
5. **Ringan di HP murah**: Canvas 2D, sprite cache, mode ringan. Target pasar Indonesia.
6. **Sosial bertahap**: lihat → cari nama → KTW → taman → pesta → toa berbayar.

---

## 6. Blueprint game serupa: AUDIRA LAND (usulan)

Bedakan tema supaya bukan tiruan. Opsi:
- **Pulau/kepulauan** (warga tiba naik kapal feri, bukan pesawat).
- **Desa Nusantara** (sawah, pasar, balai desa, pelabuhan).
- **Kota luar angkasa / koloni** (roket mendarat, kubah).
- **Kota bawah laut**.

### Stack rekomendasi
| Lapisan | Pilihan | Alasan |
|---|---|---|
| Render peta | Canvas 2D + sprite cache (seperti mereka) **atau** PixiJS v8 | Pixi mempercepat batching ribuan sprite; Canvas 2D paling ringan & tanpa dependensi |
| Avatar | Prosedural dari seed (canvas) | Tanpa aset, tak terbatas variasi |
| Frontend | Vite + TypeScript, multi-page | Modular, tetap ringan |
| Backend | Cloudflare Workers + D1 (SQLite) + KV/R2 | Murah, cache edge, cocok pola "ember 15 dtk" |
| Realtime (taman/chat) | Durable Objects WebSocket | Room per taman |
| Sinkron follower | Cron Worker | Lihat catatan risiko di bawah |

### Struktur data minimum
```ts
// snapshot kota (di-cache edge per 15 dtk)
type CitySnapshot = {
  v: number; epoch: string; n: number;          // jumlah warga
  baru: [username: string, arriveAt: number][]; // antrean kedatangan
  arrivals: { every: number; next: number };    // jadwal kapal/pesawat
  buildings: Blueprint[];                       // bangunan khusus dari admin
  sponsors: Sponsor[]; news: News[]; calendar: Event[];
};
// warga diturunkan deterministik: index → hash → rumah, kerja, look
function residentAt(i: number, username: string) {
  const h = hash32(username);
  return { home: pickHome(i), job: pickJob(h), look: mkLook(h), level: levelFromDays(daysSince(joined)) };
}
```

### Fase MVP
1. **Peta isometrik statis**: grid, jalan, kavling dari hash posisi, pan/pinch-zoom, sprite cache.
2. **Warga deterministik**: daftar username → rumah + kerja + avatar seed; pencarian nama, kartu warga.
3. **Kedatangan hidup**: kapal/pesawat tiap N menit, warga jalan ke rumah, mobil di jalan.
4. **Ekonomi dasar**: gaji per detik, jabatan naik per lama tinggal, dompet.
5. **Konten kota**: koran, pengumuman, kalender, radio lo-fi bebas royalti.
6. **Sosial**: KTW (klaim akun), taman realtime, pesan, pesta rumah.
7. **Monetisasi**: slot sponsor (papan/hologram/toko), mode demo mitra, siaran berbayar, item kosmetik.
8. **Admin**: editor cetak biru JSON, kelola warga, event musiman.

### Risiko & catatan
- **Sinkron follower Instagram**: API resmi Meta tidak menyediakan daftar follower untuk akun biasa. Scraping melanggar ToS Instagram dan berisiko akun dibatasi. Alternatif aman: warga daftar sendiri (ketik username + verifikasi lewat DM/kode di bio), atau form komentar/DM ke bot via Instagram Messaging API resmi.
- **Privasi**: menampilkan username orang di web publik. Sediakan opsi keluar kota (opt-out) dan halaman kebijakan privasi.
- **Pembayaran**: Saweria/Trakteer cukup untuk awal; catat sebagai donasi + item kosmetik, bukan judi/undian.
- **Skala**: jangan kirim data per warga. Pakai pola deterministik + snapshot ter-cache seperti mereka.

---

## 7. Langkah berikut
1. Pilih tema & nama kota.
2. Prototipe Fase 1 (peta isometrik + zoom) di folder ini.
3. Tentukan metode onboarding warga (daftar sendiri vs bot DM).
