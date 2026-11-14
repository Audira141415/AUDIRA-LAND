# SPEC — Palet Aset Admin (AUDIRA-LAND)

Fitur: super-admin (walikota) memilih aset dari daftar visual (manifest), menempatkannya di kota,
tersimpan di server (server-authoritative + RLS), dan tampil di dunia untuk SEMUA pemain.

Lapisan baru yang ringan ("custom placements") — BUKAN menumpuk ke tabel `buildings`. Bangunan yang
memang jadi milik kota tetap lewat jalur `buildings` yang ada (claim/proposal/dirikan_publik).

## 1. Kategori & sumber daftar

Sumber: `web/public/models/polyfork/manifest.json` (237 entri, tiap entri: `type`, `title`, `size`,
`triangles`, `file`, `credit` CC BY 4.0). Dibaca sekali oleh panel admin (lazy, admin-only — tidak
masuk bundel awal).

| Kategori | Sumber dari manifest | Catatan |
| :-- | :-- | :-- |
| 🌳 Pohon | `type: prop` yang judul/id cocok regex pohon/tanaman | tree, plant, bush, palm, bamboo, shrub, flower, grove, sapling, hedge, fern, blossom, magnolia, ginkgo, oak, birch, cherry, fir, orchard, sunflower |
| 🏠 Bangunan | `type: building` (51) | footprint maks ±12×9 m |
| 🐄 Ternak | `type: animal` (3: Cow, Goat, Farm Dog) | dirender STATIS (bukan animasi); glb apa pun bisa |
| 🚗 Kendaraan | `type: vehicle` (39) | dirender statis (parkir) |

Kategori diturunkan di klien dari `type` + regex pohon. Tidak ada daftar yang ditulis tangan.

## 2. Skema persist (Supabase, idempoten — ditambah ke `supabase/admin_panel.sql`)

Tabel `public.admin_placements`:

| Kolom | Tipe | Ket |
| :-- | :-- | :-- |
| id | uuid PK default gen_random_uuid() | |
| asset_id | text not null | id manifest, dicek `^[a-z0-9][a-z0-9-]{1,59}$` |
| category | text not null | in (pohon, bangunan, ternak, kendaraan) |
| world_x | double precision not null | meter, |x| ≤ 2000 |
| world_z | double precision not null | meter, |z| ≤ 2000 |
| rot_y | double precision not null default 0 | radian |
| scale | double precision not null default 1 | 0.25..4 |
| placed_by | uuid | auth.uid() admin |
| placed_name | text | username admin |
| created_at | timestamptz default now() | |

RLS: `enable row level security`. Policy **SELECT `using (true)`** (anon warga boleh baca untuk render).
TIDAK ada policy INSERT/UPDATE/DELETE → tulis hanya lewat RPC `security definer` + `assert_walikota()`.

### RPC
- `admin_place_asset(p_asset_id, p_category, p_world_x, p_world_z, p_rot_y default 0, p_scale default 1)`
  → `assert_walikota()`, validasi, insert, `admin_log('tempat_aset', …)`, return `{success, placement}`.
- `admin_remove_asset(p_id uuid)` → `assert_walikota()`, delete, `admin_log('hapus_aset')`, return `{success}`.
- `list_placements()` → **publik** (security definer, callable anon): return array semua placement
  (id, asset_id, category, world_x, world_z, rot_y, scale, placed_name, created_at). Dipakai render
  di boot untuk semua pemain.

Semua idempoten: `create table if not exists`, `create or replace function`, `drop policy if exists`
lalu `create policy`. Aman di-rerun.

## 3. Render (`web/src/models/admin_placements.js`, lazy)

- Di boot, `main.js` panggil `list_placements` (supabase-js RPC yang sudah dimuat) lalu buat lapisan.
  Modul render di-`import()` dinamis → tidak membebani bundel utama (budget 160 KB gzip).
- Per `asset_id`: muat glb via `preloadPolyfork([asset_id])`, lalu satu **InstancedMesh** berisi semua
  placement asset itu (geometri `pfGeo`, material `pfLiveMaterial()` = vertexColors agar warna glb tampil).
  Draw call = jumlah asset_id unik yang ditempatkan (biasanya 0–beberapa; jauh di bawah sisa budget).
- **Zero-Submerging**: y = `getSurfaceIndex().at(x,z).y + MICRO_LIFT(0.02)`. glb polyfork sudah dasar y=0.
- Skala: `scale` user × skala-ke-ukuran-asli (glb sudah dalam meter → pakai `scale` langsung).
- API modul: `add(row)` (tempat live tanpa reload), `remove(id)`, `dispose()`.

## 4. Alur tempat (UI — tab baru "Aset" di `admin_modal.js`, mobile-friendly)

1. Tab 🧩 Aset → chip kategori (Pohon/Bangunan/Ternak/Kendaraan).
2. Daftar dapat dicari (judul/id dari manifest) — tombol pilih per baris (min-height 44px).
3. Aset terpilih tampil; atur posisi:
   - Tombol **"Tempat di tengah layar"** → pakai `getCameraTarget()` (pusat kamera x/z).
   - ATAU input koordinat X / Z (meter).
   - Opsional: rotasi (0/90/180/270°) & skala (0.5–2).
4. Simpan → `admin_place_asset` → render live (`onWorldChanged('placement', {action:'add', row})`).
5. Daftar placement yang ada + tombol 🗑️ hapus (`admin_remove_asset` → `action:'remove'`).

Hook baru yang disuntik `main.js` ke `AdminModal`:
- `getCameraTarget()` → `{x, z}` dari `this.camera.target`.
- `onWorldChanged('placement', {action, row|id})` → teruskan ke lapisan render.

## 5. Anggaran (WAJIB)
- Draw calls total < 100 @ 390px/4× throttle: InstancedMesh per asset_id, tidak per objek.
- JS gzip < 160 KB: panel palet (fetch manifest) & modul render di-lazy-load; bundel utama tak bengkak.
- Server-authoritative + RLS admin-only tulis; schema idempoten; kredit CC BY 4.0 tetap di `docs/`.

## 6. Verifikasi
preview_start `audira-land` (5500) → login admin → tab Aset → tempatkan 1 pohon + 1 bangunan +
1 ternak + 1 kendaraan → console bersih, tampil (y benar), Draws < 100, reload → placement masih ada.
