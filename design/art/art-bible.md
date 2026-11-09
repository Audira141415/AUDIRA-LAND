# Art Bible: AUDIRA LAND

> **Status**: Draft
> **Owned By**: art-director
> **Last Updated**: 2026-11-09
> **Art Director Sign-Off (AD-ART-BIBLE)**: SKIPPED 2026-11-09 — solo mode

`/art-bible` writes these nine sections in this order and replaces each
section's `[To be designed]` line as that section is approved. A section still
holding its placeholder is incomplete; a later run fills only those.

## 1. Visual Identity Statement

**Aturan visual:** Nama warga harus jadi hal paling mudah ditemukan dan paling layak dipamerkan di layar; semua elemen lain mundur supaya nama itu menonjol.

**Prinsip 1 · Nama di atas pemandangan**
- Nama, penanda rumah, dan kartu warga selalu kontras tertinggi: tinta navy `#14324a` di atas krem `#fffaf0`, aksen koral `#ff7a59`. Lingkungan memakai pastel bersaturasi lebih rendah.
- Uji: bila ambigu, pilih yang membuat nama pemain lebih cepat ketemu di layar 375 px, walau pemandangan jadi lebih polos.
- Melayani: "lihat namamu punya rumah" dan titik gagal "nama tidak ketemu".

**Prinsip 2 · Setiap rumah tampak milik seseorang**
- Rumah prosedural boleh mirip bentuknya, tapi beda di warna atap, pintu, atau pot/jemuran. Lampu jendela malam = ada penghuni.
- Ciri Nusantara (atap pelana, rumah panggung, feri, jajaran kelapa) diutamakan daripada ciri kota generik.
- Uji: bila ambigu, pilih detail yang membuat satu rumah bisa dikenali sebagai "rumahku" daripada detail yang hanya menambah keramaian.
- Melayani: "bangga punya rumah" dan "kota yang tumbuh bersama komunitasnya".

**Prinsip 3 · Sederhana sampai jalan di HP 2 GB, terbaca dalam sekali lirik**
- Poligon isometrik datar, 2–3 nada per bidang (terang, sisi, bayangan), ubin 64×32. Tanpa tekstur, gradien berat, atau blur.
- Siluet tetap terbaca sebagai ikon kecil saat kartu dibagikan ke IG.
- Uji: bila ambigu, pilih bentuk dengan poligon lebih sedikit dan siluet lebih jelas, walau kurang detail.
- Melayani: HP murah dengan input sentuh, dan "ingin pamer ke teman" (kartu harus terbaca sebagai screenshot di feed IG).

**Ditolak:** "Pulau sebagai diorama mainan hangat yang dirawat bersama" — suasananya kuat, tapi kurang menjaga pencarian nama; kehangatannya dibawa lewat Prinsip 2.

## 2. Mood & Atmosphere

**(a) Peta kota, siang**
- Emosi: "kotaku hidup dan aku punya tempat di sini". Tenang, ingin menjelajah, nama mudah ketemu.
- Cahaya: pagi–siang, netral agak hangat, kontras sedang. Bayangan ke kanan bawah (`rgba(25,45,70,.2)`). Tanpa sorot atau glow.
- Sifat: cerah, lapang, rapi, sibuk-pelan. Energi sedang-rendah; gerak dari mobil, pejalan, ombak, bukan efek.
- Pembawa suasana: busa ombak di pantai, feri di laut, jemuran/pot beda tiap rumah.
- Saturasi lingkungan paling dibatasi di state ini (lihat Bagian 4).

**(b) Peta kota, senja/malam**
- Emosi: "ada orang di rumah". Hangat, akrab, sedikit sentimental.
- Cahaya: latar dingin (overlay `#101838`, alpha ≤ 0,6), titik hangat (jendela `#ffd57e`, lampu jalan). Kontras tinggi hanya di titik cahaya. Senja (`nightFactor` 0,15–0,5): lampu menyala sebelum langit gelap penuh.
- Sifat: teduh, berpenghuni, berkilau, sunyi. Energi rendah; gerak terkuat = sorot mercusuar.
- Penanda nama dan rumah sendiri digambar setelah overlay dengan warna penuh: malam membuat nama paling menonjol.

**(c) Kedatangan kapal di dermaga**
- Emosi: "aku tiba". Haru kecil, disambut; momen paling sinematik.
- Cahaya: grade jam emas **selalu**, apa pun jam aslinya ("lampu dermaga dinyalakan untukmu"). Dermaga & feri diberi key hangat, sisa peta diredupkan ±25% (vignette datar, tanpa blur).
- Sifat: hangat, megah-kecil, perayaan, menyambut. Energi naik lalu turun: feri merapat, nama muncul, tenang.
- Pembawa suasana: buih di haluan feri, pita/nama mengembang di atas dermaga.
- Satu-satunya state yang boleh memakai kuning brand dalam jumlah besar (konfeti, bendera).

**(d) Kartu warga & pencarian nama**
- Emosi: bangga, ingin pamer. Fokus penuh pada "ini aku".
- Cahaya: peta turun ±40% luminansi dan dipucatkan; kartu krem paling terang. Kontras maksimum.
- Sifat: bersih, resmi-ramah, rapi, layak difoto. Energi statis (kartu diam supaya bisa di-screenshot); satu-satunya gerak = kamera terbang ke rumah (0,9 dtk).
- Pembawa suasana: kamera menukik, rumah sendiri diberi outline koral + pin, kartu naik dari bawah.
- Uji: screenshot kartu di 375 px terbaca tanpa melihat peta.

**(e) Taman Warga**
- Emosi: nongkrong, kebersamaan. Ringan, sosial, sedikit jenaka.
- Cahaya: siang teduh hijau-hangat, kontras rendah-sedang; malam lampu taman/lampion.
- Sifat: santai, rindang, riuh-ramah, intim. Energi sedang; gerak dari chat bubble, emote, avatar.
- Rumput taman (`#7fb86a`) lebih gelap dari peta supaya bubble krem menonjol. Kamera dekat, avatar besar, nyaris tanpa bangunan.

**(f) Koran / kabar kota**
- Emosi: penasaran, "ada yang berubah sejak kemarin".
- Cahaya: tanpa cahaya dunia; kertas krem, tinta navy, kontras tinggi, datar.
- Sifat: hangat-cetak, informatif, rapi, kampung-modern. Energi rendah.
- Pembawa suasana: masthead bergaris tebal navy, nama warga dicetak tebal dalam berita. Satu-satunya state tanpa peta.

**(g) Layar daftar "Jadi warga"**
- Emosi: diundang, berharap. "Aku mau ikut naik kapal."
- Cahaya: pulau dilihat dari laut, pagi cerah sedikit lebih dingin dari peta; form krem kontras tinggi.
- Sifat: terbuka, menjanjikan, segar, jauh. Energi sedang-rendah, feri bergoyang pelan.
- Pembawa suasana: siluet pulau dan mercusuar di cakrawala. Beda dari (c): jauh dan segar vs sudah tiba dan emas.

| State | Suhu | Kontras | Energi | Peta |
|---|---|---|---|---|
| (a) Siang | netral-hangat | sedang | sedang-rendah | penuh |
| (b) Malam | dingin + titik hangat | tinggi lokal | rendah | penuh |
| (c) Kedatangan | emas | fokus | naik-turun | dermaga |
| (d) Kartu | netral | maksimum | statis | redup |
| (e) Taman | hijau-hangat | sedang | sedang | dekat |
| (f) Koran | kertas | tinggi | rendah | tidak ada |
| (g) Daftar | dingin-segar | sedang | sedang-rendah | dari jauh |

## 3. Shape Language

**Siluet avatar**
- Kepala besar, badan kecil (±1:1,3). Ciri utama di kepala: rambut, hijab, topi. Wajah tidak perlu terbaca di peta.
- Uji thumbnail: avatar 24 px dibedakan dari tetangganya lewat siluet kepala dan warna baju saja.
- Satu pembeda per tipe, selalu berupa bentuk, tidak boleh hanya warna:
  - **Warga terverifikasi:** papan nama pill krem terisi penuh + badge bulat bercentang di ujung kanan.
  - **Tamu:** papan nama pill outline saja (tanpa isi, garis navy 1 px), tanpa badge.
  - **Diri sendiri:** pin segitiga koral menunjuk ke bawah di atas papan nama + cincin elips di kaki. Hanya satu di layar.
  - **Orang lain:** tanpa pin, tanpa cincin.
- Papan nama adalah bentuk paling "UI" di dunia, jadi itu yang dilihat mata lebih dulu, bukan tubuh avatar (Prinsip 1).

**Geometri lingkungan: dominan bersudut**
- Kotak isometrik, atap pelana segitiga, rumah panggung. Alasan: grid 64×32 memaksa garis 2:1, poligon datar paling murah di HP 2 GB (Prinsip 3), atap pelana = ciri Nusantara (Prinsip 2).
- Membulat hanya untuk alam (tajuk pohon, kelapa, ombak) dan benda kecil milik orang (pot, lampion, kubah lampu mercusuar).
- Bangunan tidak boleh bersudut membulat. Lengkung milik manusia dan UI.

**Tata bentuk UI: bahasa HUD sendiri, sengaja kontras dengan dunia**
- UI membulat: pill `999px`, kartu `--r: 18px`, tombol bulat. Dunia bersudut. Kontras bentuk ini membuat nama dan kartu terbaca sebagai lapisan di atas kota (Prinsip 1).
- Pengecualian diegetik: papan penanda rumah boleh bertiang kayu bersudut, tapi plat namanya tetap pill.
- Tanpa bevel, tanpa gradien. Satu bayangan UI saja (`--shadow`).

**Bentuk utama vs pendukung**
- Penarik mata, berurutan: (1) pin "kamu", (2) papan nama pill, (3) outline rumah sendiri, (4) feri saat datang, (5) Menara AUDIRA dan mercusuar sebagai jangkar orientasi.
- Mundur: rumah lain, pohon, mobil, pejalan, detail tanah (garis sawah, papan dermaga, ombak). Tanpa outline, kontras tepi rendah, tidak lebih tinggi dari `HMAX` yang ada.
- Outline hanya untuk milik pemain (rumah sendiri, kartu). Bangunan dunia tidak pernah diberi outline.

**Ditolak:** tamu ditandai dengan transparansi 60% — terlalu lemah di layar HP yang terang.

## 4. Color System

**Palet utama**

| Warna | Hex | Peran / arti |
|---|---|---|
| Tinta Navy | `#14324a` | Nama, teks, garis kartu. "Ini tercatat resmi." |
| Krem Kertas | `#fffaf0` | Kartu, papan nama, koran, panel. "Ini milikmu dan layak disimpan." |
| Koral | `#ff7a59` | "Kamu" dan aksi utama: pin diri, rumah sendiri, tombol CTA. |
| Teal | `#177a7a` | Terverifikasi dan baik: badge warga, status disetujui. |
| Kuning Matahari | `#ffd166` | Brand AUDIRA dan "emas": naik jabatan, saldo, Menara AUDIRA, kedatangan. |
| Laut | `#5fb3c9` | Latar dan batas dunia. Selalu mundur. |
| Hijau Pulau | `#a3c78a` / `#9cc184` | Tanah dan rumput peta (menggantikan `#a6d47f` / `#9fce78`). |

**Warna semantik: dikunci, tidak dipakai di objek dunia**
- Koral murni hanya untuk "kamu" dan aksi. Di baju avatar dan lapak pasar diganti salem redup `#d9967c`.
- Teal semantik hanya untuk terverifikasi. Teal di pita puskesmas, kanopi, dan baju diturunkan ke `#5f9e98`.
- Kuning brand hanya untuk AUDIRA dan "emas".
- Merah `#c23b22` hanya untuk peringatan/penolakan di admin; tidak dipakai di UI pemain.

**Suhu warna per area**
- Pusat kota: netral-sejuk (kaca biru abu, dinding krem abu). Pengecualian: kuning AUDIRA di puncak menara.
- Permukiman: hangat lembut; dinding krem, peach, sage pucat (S ≤ 35%, L ≥ 84%). Variasi rumah dari atap, bukan dinding.
- Pantai & dermaga: sejuk-cerah. Pasir `#efdcaa`, laut dangkal `#7fcbd8`, kayu dermaga `#b48a5a`. Saat kedatangan, dermaga di-grade emas.
- Taman: hijau-hangat, rumput `#7fb86a`.
- Malam: objek dunia dicampur ke `AL.NIGHT #1a2342` (0,58). Cahaya hanya kuning hangat (`#ffd57e`, `rgba(255,214,140)`). Koral dan teal UI tidak ikut dicampur.

**Palet UI vs dunia**
- UI memakai warna jenuh penuh; dunia dibatasi S ≤ 45% untuk atap & aksen, S ≤ 35% untuk dinding & tanah. Selisih saturasi inilah yang membuat UI menonjol.
- UI tidak memakai hijau rumput atau biru laut.
- Kontras teks (WCAG AA 4,5:1):
  - Tombol koral memakai teks navy `#14324a` (±5,1:1), bukan putih.
  - Teks di atas teal memakai `#177a7a` (±5,1:1). Badge taman disamakan ke token ini.
  - Kuning tidak pernah untuk teks di atas krem (±1,3:1); hanya isian ikon atau latar dengan teks navy.

**Keamanan buta warna**

| Pasangan berisiko | Siapa | Cadangan wajib |
|---|---|---|
| Koral "kamu" di atas hijau | deutan/protan | Pin segitiga + cincin kaki, outline navy 1,5 px di pin |
| Teal badge di atas hijau taman | deutan, tritan | Centang putih di badge, bingkai krem 2 px |
| Koral vs teal | protan | Bentuk beda: pin segitiga vs badge bulat |
| Kuning emas vs krem | tritan, layar terang | Ikon (bintang jabatan, koin saldo) bergaris navy |
| Jendela menyala vs gelap | layar redup | Beda luminansi besar (`#ffd57e` vs `#27304d`), sudah aman |

**Penyesuaian palet di `js/render.js` dan `js/avatar.js`**

| Asal | Usulan | Catatan |
|---|---|---|
| ROOFS `#c4553f` | `#a9584c` | satu hue dengan koral |
| ROOFS `#d08a3a` | `#b98046` | mendekati kuning brand |
| ROOFS `#b0485e` | `#a15364` | S turun |
| WALLS `#f7e3a3` | `#e9dfc4` | bersaing dengan kuning brand |
| SHOPC `#f29e8e`, `#f7c873` | S −30% | |
| Kanopi `#e2453c`, `#f08c3a` | S −30%, L +5% | |
| Rumput `#a6d47f` / `#9fce78` | `#a3c78a` / `#9cc184` | bidang terbesar di layar |
| `SHIRT` koral `#ff7a59` | `#d9967c` | koral dikunci untuk "kamu" |
| Teal dunia `#2fa3a3` | `#5f9e98` | teal dikunci untuk terverifikasi |

- Dibiarkan: laut, pasir, merah-putih mercusuar dan bendera.

**Ditolak:** koral tetap di baju avatar (arti koral jadi kabur); tombol koral tua `#c4452a` dengan teks putih (brand jadi lebih gelap).

## 5. Character Design Direction

[To be designed] — the player character's visual archetype, how players tell
enemies, NPCs and allies apart at a glance, expression and pose style, and how
much detail survives at game camera distance (LOD philosophy).

## 6. Environment Design Language

[To be designed] — architectural style and its tie to the world's culture,
texture philosophy (painted, PBR or stylised, and why), prop density rules per
area type, and environmental storytelling guidelines.

## 7. UI/HUD Visual Direction

[To be designed] — diegetic versus screen-space HUD, typography (personality,
weight, size hierarchy, minimum readable size), iconography style, UI animation
feel, and any art-direction versus readability conflict and how it was decided.

## 8. Asset Standards

[To be designed] — file formats, naming convention, texture resolution tiers,
LOD levels, export settings, and the engine's hard limits (poly budgets per
asset category, texture memory, material slots). Where an art preference and a
technical limit disagree, record both and the trade-off chosen.

## 9. Reference Direction

[To be designed] — 3–5 references (games, films, art styles or artists). For
each: the specific element to take from it, and what to avoid so the result
does not read as a copy.
