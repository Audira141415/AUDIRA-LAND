# Panduan Setup Fondasi Data Supabase — AUDIRA-LAND (Tahap 01)

> **Arsitektur Zero-Server-Cost**: AUDIRA-LAND menggunakan PostgreSQL Supabase sebagai satu-satunya backend state persisten. Seluruh mutasi data dikontrol melalui fungsi `SECURITY DEFINER` dengan Row Level Security (RLS). Tidak memerlukan server daemon Node.js / VPS terpisah!

---

## 1. Persiapan Akun & Proyek Supabase

1. Buka [https://supabase.com](https://supabase.com) dan login (atau buat akun gratis).
2. Klik tombol **New Project**.
3. Masukkan data proyek:
   - **Name**: `AUDIRA-LAND`
   - **Database Password**: Buat password yang kuat dan simpan di pengelola sandi.
   - **Region**: Pilih region terdekat (misalnya: `Singapore (ap-southeast-1)`).
   - **Pricing Plan**: Free Tier ($0/bulan).
4. Klik **Create new project** dan tunggu 1-2 menit hingga provisioning database selesai.

---

## 2. Menjalankan Skrip SQL Idempotent

Skrip SQL AUDIRA-LAND telah dirancang **100% idempotent** (aman dijalankan berulang kali kapan saja tanpa merusak data atau menimbulkan duplikasi).

1. Buka dashboard proyek Supabase Anda.
2. Di bilah menu kiri, pilih ikon **SQL Editor** (atau tekan shortcut keyboard).
3. Klik **New query** (atau tombol `+`).
4. Buka file:
   [`F:\AUDIRA-INTEGRASI-BLEDER-ROBLOX\AUDIRA-LAND\supabase\schema.sql`](file:///F:/AUDIRA-INTEGRASI-BLEDER-ROBLOX/AUDIRA-LAND/supabase/schema.sql)
5. Salin seluruh isi file (764 baris) dan tempel (*paste*) ke dalam SQL Editor Supabase.
6. Klik tombol hijau **Run** (atau tekan `Ctrl + Enter`).
7. Pada tab **Results**, Anda akan melihat output JSON dari pemanggilan `select public.get_city_snapshot();` dengan status sukses:
   ```json
   {
     "stats": {
       "population": 0,
       "completed_buildings": 4,
       "satisfaction_score": 82
     },
     "districts": [
       {"key": "k00", "name": "Pesisir Sunda Kelapa", "ring": 2, "is_unlocked": false, ...},
       ...
       {"key": "k12", "name": "Alun-Alun Merdeka", "ring": 0, "is_unlocked": true, ...}
     ],
     "settings": {
       "city_name": "AUDIRA-LAND",
       "city_treasury": 50000,
       "daily_tax": 10,
       "daily_coin_cap": 300,
       "vote_quorum": 5
     },
     "news": [...]
   }
   ```

---

## 3. Mengambil Kredensial API

Untuk menghubungkan antarmuka Web 3D Three.js ke database:

1. Di dashboard Supabase, klik ikon roda gigi **Project Settings** di kiri bawah.
2. Pilih submenu **Data API** (atau **API**).
3. Salin dua nilai berikut:
   - **Project URL**: contoh `https://abcdefghijklm.supabase.co`
   - **Project API Keys** -> **anon / public**: contoh `eyJhbGciOi...`
4. Tempelkan kredensial tersebut ke file konfigurasi klien:
   [`web/src/api/config.js`](file:///F:/AUDIRA-INTEGRASI-BLEDER-ROBLOX/AUDIRA-LAND/web/src/api/config.js)

---

## 4. Uji Coba Panggilan API sebagai Tamu (`anon`)

Anda dapat memverifikasi bahwa RPC publik dapat diakses tanpa login menggunakan cURL atau browser console:

### Menggunakan cURL:
```bash
curl -X POST "https://<PROJECT-REF>.supabase.co/rest/v1/rpc/get_city_snapshot" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json"
```

### Menggunakan JavaScript di Browser:
```javascript
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabase = createClient('https://<PROJECT-REF>.supabase.co', '<ANON_KEY>');

const { data, error } = await supabase.rpc('get_city_snapshot');
console.log('Snapshot AUDIRA-LAND:', data);
```

---

## 5. Ringkasan Keamanan & RLS

| Tabel | Akses `anon` (Tamu) | Akses `authenticated` (Warga Login) | Mutasi Data |
| :--- | :--- | :--- | :--- |
| `settings` | SELECT | SELECT | Hanya melalui fungsi internal |
| `players` | SELECT | SELECT (milik sendiri & publik) | Melalui `register_player` & RPC aksi |
| `districts` | SELECT | SELECT | Kas negara via usulan disetujui |
| `buildings` | SELECT | SELECT | Melalui `claim_plot_and_build` (Row Locking) |
| `proposals` | SELECT | SELECT | Melalui `submit_proposal` |
| `proposal_votes`| Tidak ada | SELECT | Melalui `vote_proposal` (1 Warga = 1 Suara) |
| `jobs` | Tidak ada | SELECT (milik sendiri) | Melalui `work_at_building` (Batas 300 ₳) |
| `news` | SELECT | SELECT | Otomatis dibuat saat event kota terjadi |
| `chat` | SELECT | SELECT | Melalui `send_chat` (1-150 karakter) |
| `rpc_cache` | Tersembunyi | Tersembunyi | Diatur otomatis oleh trigger & RPC |

---

## 6. Checklist Verifikasi Tahap 01

- [x] Ekstensi `pgcrypto` aktif.
- [x] 11 tabel inti terpasang dengan constraint valid.
- [x] Regex distrik `^k(0[0-9]|1[0-9]|2[0-4])$` memvalidasi tepat 25 distrik.
- [x] 25 distrik terisi (`k12` terbuka, `k00`..`k24` terdistribusi Ring 0/1/2).
- [x] 4 bangunan starter terpasang di `k12` (Balai Kota, Warung Madura, Taman Surya, Pos Ronda).
- [x] Ticker berita awal terisi pengumuman pembukaan kota.
- [x] Row Level Security (RLS) aktif pada semua 11 tabel.
- [x] Hak akses `GRANT EXECUTE` diberikan pada 8 fungsi RPC.
- [x] RPC `get_city_snapshot()` dan `get_buildings('k12')` berhasil mengembalikan data JSON.

**Tahap 01 (Fondasi Data) Selesai 100%. Siap melanjutkan ke Tahap 02 (Peta Deterministik 3D)!**

