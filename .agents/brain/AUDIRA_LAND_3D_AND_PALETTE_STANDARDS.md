# AUDIRA-LAND — 3D Visual Standards & Design Tokens ("Gaya Tinta Hangat")

> **Identitas Visual**: Kertas krem hangat, kayu jati cokelat, genteng terakota merah bata, dedaunan tropis, aksen emas berkilau, dan garis siluet tinta tipis yang tegas.

---

## 1. Token Palet Warna CSS & Konstanta 3D

```css
:root {
  /* Tinta & Kontur */
  --ink: #2E2117;              /* Teks utama & garis luar gelap */
  --muted: #7A6652;            /* Keterangan & teks sekunder */
  --line: rgba(94, 62, 32, .16);/* Garis pembatas halus */

  /* Permukaan & Panel */
  --panel-solid: #FFF9EC;      /* Latar kartu & bottom sheet (kertas krem) */
  --panel2: #F6EAD2;           /* Bagian dalam sub-panel */
  --cream: #FFF2D6;            /* Teks kontras di atas kayu */

  /* Kayu & Material Alami */
  --wood: #5B3A24;             /* Kayu gelap dock menu & tombol */
  --wood2: #7A5234;            /* Kayu sedang */
  --terracotta: #C8553D;       /* Genteng terakota tradisional */

  /* Status & Aksen */
  --gold: #E9A91E;             /* Tombol utama, milikku, menu aktif */
  --gold-soft: #FFE7B0;        /* Sorot kavling terpilih */
  --green: #2F7D5B;            /* Berhasil, setuju, vegetasi subur */
  --blue: #3F6E9E;             /* Voting publik & air sungai */
  --red: #C8553D;              /* Peringatan & tolak */

  /* Tipografi */
  --f-display: "Fredoka", "Trebuchet MS", system-ui, sans-serif;
  --f-body: "Nunito", system-ui, -apple-system, sans-serif;

  /* Radius & Bayangan */
  --r-card: 18px;
  --r-button: 14px;
  --r-dock: 22px;
  --shadow-warm: 0 10px 28px rgba(72, 40, 12, .22), 0 2px 5px rgba(72, 40, 12, .14);
}
```

---

## 2. Standar Skala 3D & Proporsi Dunia

- **Satuan Dasar**: 1 Unit 3D = 1 Meter nyata.
- **Tinggi Lantai Bangunan**: 3.2 m (lantai dasar ruko usaha 4.2 m).
- **Tinggi Karakter Avatar**: 1.70 m (proporsi Chibi 1:6.5 tanpa fitur wajah detail, mengutamakan siluet topi/pakaian).
- **Dimensi Pintu**: 1.0 m × 2.1 m.
- **Dimensi Mobil/Angkot**: Panjang 4.3 m, lebar 1.8 m, tinggi 1.9 m.
- **Kepadatan Kavling**: Bangunan mengisi 90% lebar × 92% kedalaman kavling agar lingkungan kota terlihat rapat, hidup, dan tidak gersang.

---

## 3. Gaya Fasad Bangunan Modular

Setiap model bangunan dirancang modular dengan tata bahasa fasad yang padat:
- **Minimal 25 elemen per fasad depan**: Jendela berbingkai kayu, kanopi teras, papan nama toko, kotak meteran listrik/AC, talang air, tanaman pot teras.
- **Variasi Procedural dari Seed**: Dua warung dengan tipe yang sama akan memiliki perbedaan warna cat dinding, model kanopi kain, dan posisi bangku depan berdasarkan *seed* posisi kavling.
- **Garis Tinta Siluet (*Ink Outline*)**:
  - Ketebalan 1.4 px pada mode peta isometrik.
  - Ketebalan 1.8 px pada mode jalan-jalan (Walk Mode).
  - Warna garis menggunakan warna lokal material yang digelapkan (bukan hitam pekat mati).

---

## 4. Siklus Cahaya Mengikuti Jam WIB Nyata

- Matahari directional light tunggal dengan shadow map teroptimasi (1024 × 1024).
- Suhu warna langit dan ambient light bertransisi otomatis sesuai jam WIB:
  - **Pagi (06:00 - 09:00)**: Cahaya keemasan lembut, bayangan panjang ke barat.
  - **Siang (10:00 - 15:00)**: Cahaya cerah hangat (kecerahan V 0.58–0.64).
  - **Sore / Golden Hour (16:30 - 18:00)**: Warna jingga hangat merata ke genteng terakota.
  - **Malam (18:30 - 05:00)**: Langit biru pekat (kecerahan V 0.30–0.40), lampu jalan dan jendela ruko/rumah otomatis menyala kuning hangat (*emissive glow*).

