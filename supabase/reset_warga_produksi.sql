-- =============================================================================
-- AUDIRA-LAND: RESET DATA WARGA UNTUK PRODUKSI
-- Jalankan SEKALI di Supabase SQL Editor sebelum kota dibuka untuk umum.
-- PERINGATAN: menghapus permanen semua warga, bangunan milik warga, kerja, voting,
-- chat, berita, dan donasi. Bangunan publik (owner_id null) dan distrik tetap ada.
-- Export/backup tabel dulu bila datanya masih dibutuhkan.
-- =============================================================================
begin;

delete from public.proposal_votes;
delete from public.proposals;
delete from public.jobs;
delete from public.chat;
delete from public.donations;
delete from public.news;
delete from public.rpc_cache;

-- Bangunan milik warga (bangunan publik/negara tidak punya owner_id)
delete from public.buildings where owner_id is not null or is_public = false;

delete from public.players;

-- Akun anonim/auth warga lama. Hapus tanda komentar bila akun login juga harus hilang.
-- delete from auth.users;

update public.settings set
    city_treasury = 50000,
    donation_collected = 0,
    announcement = 'AUDIRA-LAND resmi dibuka! Daftar jadi warga, pilih desa & profesi, rumahmu langsung dibangun.',
    updated_at = now()
where id = 1;

update public.districts set is_unlocked = (key = 'k12'), unlocked_at = case when key = 'k12' then now() end;

insert into public.news (category, message)
values ('kota', 'AUDIRA-LAND resmi dibuka! Selamat datang, warga pertama.');

commit;
