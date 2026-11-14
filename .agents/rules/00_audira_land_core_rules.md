# AUDIRA-LAND — Aturan Inti Pengembangan (Core Rules)

Semua agen, developer, dan pipeline yang bekerja pada proyek **AUDIRA-LAND** wajib mematuhi aturan baku berikut tanpa pengecualian:

---

## 1. Keamanan Database: RLS-First & No Direct Client Writes
- **Dilarang Keras**: Memberikan hak tulis (`INSERT`, `UPDATE`, `DELETE`) secara langsung kepada role `anon` maupun `authenticated` pada tabel database mana pun.
- **Wajib Mutlak**: Seluruh transaksi mutasi (klaim kavling, bangun, percepat waktu, kerja, voting, kirim chat) wajib diproses melalui fungsi PostgreSQL berstatus `SECURITY DEFINER` dengan `search_path = public`.
- **Anti Balapan (Race Condition)**: Setiap aksi yang melibatkan kuota atau kepemilikan kavling wajib mengunci baris target menggunakan `SELECT ... FOR UPDATE`.

---

## 2. Zero-Submerging Surface Policy (Semua Objek di Atas Tanah)
- Semua bangunan modular, trotoar, tiang lampu, gerobak, motor, pohon, dan avatar karakter **wajib berdiri 100% di atas permukaan jalan/tanah** (`bottomY >= surfaceY`).
- Terapkan micro-lift $+0.02$ unit untuk mencegah Z-fighting antar lantai dan permukaan tanah pendukung.

---

## 3. Disiplin Anggaran Performa Mobile (Mobile-First 390px)
- **Ukuran Bundle**: File JavaScript aplikasi terkompresi maksimal **160 KB (gzip)**.
- **Draw Call**: Maksimal 100 draw calls pada tampilan kota dengan teknik chunk merging 8 × 8 petak dan InstancedMesh untuk props.
- **Anti Freeze**: Dilarang memuat ratusan mesh dalam 1 frame. Batasi proses konstruksi maksimal **8 milidetik per frame** di perangkat seluler.

---

## 4. Gaya Visual Tinta Hangat & Fasad Kaya Budaya
- Patuhi token warna: Kertas krem (`#FFF9EC`), kayu cokelat (`#5B3A24`), genteng terakota (`#C8553D`), aksen emas (`#E9A91E`), dan garis tinta siluet.
- Jangan gunakan aset fotorealistik berat atau tekstur berlebihan. Gunakan material Lambert datar bergaris siluet bersih khas AUDIRA.

