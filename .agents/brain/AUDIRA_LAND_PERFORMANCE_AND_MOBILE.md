# AUDIRA-LAND — Mobile Performance & Optimization Standard

> **Aturan Utama**: Tes selalu di HP lambat (Viewport 390 px dengan CPU Throttling 4×). Game harus tetap mulus tanpa freeze saat distrik baru dimuat!

---

## 1. Strategi Pengurangan Draw Call (693 ➔ ~100 Draw Calls)

1. **Chunk Mesh Merging (8 × 8 Petak)**:
   - Bangunan yang telah selesai di dalam satu chunk 8 × 8 petak digabungkan menjadi satu single `BufferGeometry` statis.
   - Deteksi interaksi/klik pengguna menggunakan invisible bounding box proxy, bukan raycasting ke ribuan poligon individual.
2. **InstancedMesh untuk Seluruh Props Jalan**:
   - Satu `THREE.InstancedMesh` per jenis prop: Pohon peneduh, tiang lampu jalan, pagar, motor parkir, gerobak sate, tong sampah, hydrant air.
   - Matrix posisi diperbarui hanya dalam radius kamera aktif (260 unit di ponsel, 420 unit di desktop).
   - Seluruh props hanya memakan tambahan 4–6 draw calls.

---

## 2. Level of Detail (LOD) & Garis Tinta Adaptif

- **LOD Dekat (< 80 unit)**: Detail penuh fasad, kusen jendela 3D, pot bunga, dan garis tinta siluet.
- **LOD Sedang (80 – 200 unit)**: Fasad disederhanakan, garis tinta dinonaktifkan, detail kecil dipangkas melalui `drawRange`.
- **LOD Jauh (> 200 unit)**: Bentuk kubus massa bangunan (*bounding mass*), bayangan dinonaktifkan.
- **Batas Jarak Pandang (> 460 unit)**: Chunk tidak digambar sama sekali (*frustum & distance culling*).

---

## 3. Antrean Pembuatan Bertahap (Stepped Build Queue)

- Saat data distrik baru diterima dari RPC Supabase, browser **dilarang keras** membuat ratusan mesh secara bersamaan dalam satu frame (menyebabkan frame-drop parah).
- Gunakan antrean berjangka:
  - Jatah waktu pembuatan maksimal **8 milidetik per frame** pada ponsel (12 ms pada desktop).
  - Bangunan yang paling dekat dengan titik kamera dibuat terlebih dahulu.
  - Memanfaatkan `requestAnimationFrame` untuk membagi pembuatan mesh ke frame berikutnya.

---

## 4. Mode Hemat Baterai Otomatis (Low-Power Fallback)

- Engine memantau FPS secara berkala.
- **Deteksi Otomatis**: Jika FPS berada di bawah 26 FPS selama 150 frame pertama:
  - Turunkan `devicePixelRatio` ke 1.0.
  - Nonaktifkan bayangan real-time (ganti dengan shadow plane kontak statis).
  - Pangkas jumlah NPC dari 60 menjadi 25.
  - Tampilkan toast ramah ke pemain: *"Mode performa hemat baterai diaktifkan agar permainan tetap lancar."*

