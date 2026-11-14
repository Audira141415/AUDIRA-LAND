# Build rilis web (anggaran JS ≤ 160 KB gzip)

Folder: `web/`. Sekali saja: `npm install` (esbuild 0.24.2 + terser 5.36.0, devDependencies).

```bash
cd web
npm run build
```

Hasil:
- `web/build/main.js` + `web/build/chunk-*.js` — bundel ESM (esbuild, lalu terser).
- `web/index.release.html` — salinan `index.html` yang memuat `./build/main.js?v=<hash>`.
  Untuk deploy, sajikan file ini sebagai `index.html` bersama `build/`, `src/ui/styles.css`, `public/`, `data/`.

Mode dev tidak berubah: `index.html` tetap memuat `./src/main.js` mentah (tanpa build).

`npm run build` gagal (exit 1) bila muatan JS awal (main + chunk yang di-import statis) > 160 KB gzip.
Jalankan ulang setelah mengubah `src/`, karena `build/` tidak ikut berubah otomatis.

## Ukuran (2026-11-13, gzip -9)

| | gzip |
| :--- | ---: |
| Sebelum: semua `src/**/*.js` mentah | 293,8 KB (287 KiB) |
| Sesudah: muatan JS awal (`main.js` + chunk statis) | 154,3 KiB |
| Sesudah: total termasuk chunk lazy | 168,4 KiB |

three.js (`public/vendor/three.min.js`) dan Supabase (CDN) tidak dihitung.

## Yang diubah
- Modal Klaim Kavling, Status Desa, dan Dashboard Admin dimuat lewat `import()` saat pertama dibuka
  (`lazyModal()` di `src/main.js`). Ketiganya hanya dibuka lewat klik, jadi perilaku sama; pembukaan
  pertama menunggu satu file kecil.
- Kode mati dibuang (tidak dipanggil di mana pun): `BuildingLoader.createRuralVillageCompoundMesh`,
  `CityGrid.createGiantCityMonument`, `CityGrid.buildGrandBridge`,
  `PlayerState.registerNewCitizen`, `PlayerState.switchActiveCitizen`.
  Salinan sebelum dihapus: `backups/pre-build-20261113/src/`.

## Verifikasi
Layar 390 px: `index.release.html` dan `index.html` sama-sama 91 draw call, tanpa error konsol;
ketiga chunk modal termuat saat dipanggil. Status Desa dan Admin tampil. Klaim Kavling diuji sebagai
tamu, jadi menempuh alur "daftar KTP dulu" (sama seperti sebelumnya); form klaim untuk warga terdaftar belum diuji.
