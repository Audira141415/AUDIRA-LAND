# Deploy AUDIRA LAND

Satu proses Node, satu file SQLite. Cukup VPS kecil (1 vCPU, 1 GB RAM) dengan domain.

## 1. Server

```bash
# Ubuntu 24.04: Node 22.13+ (pakai NodeSource atau nvm)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs caddy
sudo useradd -r -m -d /srv/audira audira
sudo -u audira git clone https://github.com/Audira141415/AUDIRA-LAND.git /srv/audira/app
```

## 2. Konfigurasi

```bash
cd /srv/audira/app
sudo -u audira cp server/.env.example server/.env
sudo -u audira nano server/.env   # HOST=127.0.0.1, FERRY_EVERY_S=300, TRUST_PROXY=1
```

`ADMIN_TOKEN` dibuat otomatis saat pertama jalan (lihat `server/.env`). Simpan baik-baik, jangan dibagikan.

**Bekukan peta sebelum warga asli masuk.** Rumah, kerja, dan gaji diturunkan dari `js/world.js`. Setelah ada warga, server menolak jalan bila peta berubah (lihat `IZINKAN_UBAH_PETA`).

## 3. systemd

`/etc/systemd/system/audira.service`:

```ini
[Unit]
Description=AUDIRA LAND
After=network.target

[Service]
User=audira
WorkingDirectory=/srv/audira/app
ExecStart=/usr/bin/node server/server.mjs
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now audira
journalctl -u audira -f
```

## 4. HTTPS (Caddy)

`/etc/caddy/Caddyfile`:

```
audira.example.id {
  encode gzip
  reverse_proxy 127.0.0.1:5173
}
```

```bash
sudo systemctl reload caddy
```

Caddy mengurus sertifikat HTTPS dan meneruskan WebSocket Taman/Pesta tanpa pengaturan tambahan.

## 5. Cadangan

- Server membuat cadangan harian otomatis: `server/data/backup/audira-YYYY-MM-DD.db` (menyimpan `BACKUP_KEEP` hari terakhir).
- Salin folder itu ke luar VPS secara berkala, mis. `rclone copy /srv/audira/app/server/data/backup remote:audira-backup`.
- Pulihkan: hentikan service, salin cadangan ke `server/data/audira.db`, hapus `audira.db-wal` dan `audira.db-shm`, jalankan lagi.

## 6. Update

```bash
cd /srv/audira/app && sudo -u audira git pull && sudo systemctl restart audira
```

Bila server menolak jalan dengan pesan "js/world.js berubah setelah ada warga", update itu mengubah peta. Batalkan, atau jalankan sekali dengan `IZINKAN_UBAH_PETA=1` bila memang disengaja.
