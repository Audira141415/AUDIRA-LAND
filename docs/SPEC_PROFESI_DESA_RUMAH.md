# Spek: Onboarding Warga — Desa, Profesi & Rumah 5 Menit

Tanggal: 2026-11-13

## Alur (wizard 4 langkah di `AuthModal`)

1. **Instagram** — follow @audira.id, isi username (wajib, `^[a-z0-9._]{1,30}$` setelah `@` dibuang).
2. **Desa** — pilih tempat tinggal:
   - `have` → **Desa Have** (barat sungai, X < −16 m): kota mapan, dekat Alun-Alun, rumah gedong.
   - `have_not` → **Desa Have-Not** (timur sungai, X > +16 m): pedesaan, lahan luas, pekarangan.
3. **Profesi** — pilih 1 dari 12 (`web/src/core/professions.js`): Petani, Dokter, Polisi, Guru,
   Pedagang, Nelayan, Perawat, Pemadam Kebakaran, Tukang Bangunan, Koki, Programmer, Seniman.
4. **Konfirmasi** — ringkasan (username, desa, profesi, durasi bangun) → tombol terbitkan KTP.

Tombol "Lanjut" nonaktif sampai langkah itu valid. Tombol "Kembali" tersedia di langkah 2–4.

## Rumah

- Setelah submit: kavling 1×1 dicari otomatis di sisi sungai yang dipilih
  (`CityLayout.findNearest`, titik awal have = (96,96), have_not = (112,96)), jadi tidak menabrak jalan,
  sungai, atau bangunan lain.
- Rumah dibuat dengan `stage: 'proyek'`, `build_started_at = now`, `build_finished_at = now + 5 menit`
  (`HOUSE_BUILD_MS = 300000`). Perancah + billboard hitung mundur tampil, lalu `updateTimers`
  mengubahnya jadi bangunan jadi.
- Tipe rumah: have → `rumah` (katalog Netizenia), have_not → `rumah_limas`.
- Saat selesai: status di `localStorage` (`audira_user_buildings`) diperbarui ke `selesai`,
  berita kota + toast "Rumah selesai".
- Refresh halaman di tengah proses: rumah dimuat lagi sebagai proyek dan timer melanjutkan dari jam nyata.
- Satu warga = satu rumah awal. Daftar ulang username yang sama tidak membuat rumah kedua.

## State pemain (tambahan)

`village: 'have' | 'have_not'`, `professionId`, `homeId`, `assignedLot` (grid + world).

## Supabase

- `players.village text check (village in ('have','have_not'))`, nullable untuk data lama.
- `register_player(p_username, p_profession, p_avatar_color, p_village default null)`; profesi
  divalidasi terhadap daftar resmi di server.
- Belum ada di versi ini: waktu bangun rumah otoritatif di server (sekarang jam klien). Lihat catatan
  di MEMORY.md.
