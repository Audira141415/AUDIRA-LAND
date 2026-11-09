# Technical Preferences · AUDIRA LAND

Sumber utama: `project.yaml` di root. File ini cadangan yang dibaca skill CCGS bila kunci di `project.yaml` tidak ada.

## Engine & Language

- **Engine**: Tanpa engine (web). Peta dan taman digambar dengan Canvas 2D.
- **Language**: JavaScript (skrip klasik di `js/`, ES module di `server/`)
- **Rendering**: Canvas 2D isometrik, sprite cache per tingkat zoom, tanah sebagai Path2D
- **Physics**: Tidak ada. Gerak lewat jalur BFS di grid.

## Input & Platform

- **Target Platforms**: Web (HP dan desktop)
- **Input Methods**: Sentuh, mouse, keyboard
- **Primary Input**: Sentuh (geser, cubit, ketuk)
- **Gamepad Support**: None
- **Touch Support**: Full
- **Platform Notes**: Lebar 375 px harus nyaman. Safe area atas/bawah. Mode ringan untuk HP RAM ≤ 2 GB.

## Naming Conventions

- **Variables & functions**: camelCase, boleh nama Bahasa Indonesia (`lotCard`, `kapal`)
- **Files**: huruf kecil, tanda hubung (`taman-map.json`)
- **Constants**: UPPER_SNAKE (`FERRY_EVERY_S`)

## Performance Budgets

- **Target Framerate**: 60 fps desktop, ≥ 30 fps HP murah
- **Frame Budget**: 16,7 ms
- **Memory Ceiling**: cache sprite maks 700 entri

## Testing

- **Framework**: Belum ada. Verifikasi dengan menjalankan game di browser dan screenshot.
- **Required Tests**: rumus ekonomi (gaji, saldo, level), API server

## Forbidden Patterns

- Scraping Instagram
- Menampilkan username tanpa persetujuan atau persetujuan admin
- Dependensi npm tanpa alasan kuat

## Allowed Libraries / Addons

- Tidak ada. Server memakai modul bawaan Node saja.
