# Skill desain dari Claude Code Game Studios

Sumber: [donchitos/claude-code-game-studios](https://github.com/donchitos/claude-code-game-studios) commit `05ad7c8`, lisensi MIT (`.claude/vendor/claude-code-game-studios-LICENSE`).

## Yang dipasang

| Jenis | Nama | Untuk AUDIRA LAND |
|---|---|---|
| Skill | `/brainstorm` | Konsep dan arah game, pilar |
| Skill | `/art-bible` | Identitas visual: palet, bentuk, gaya bangunan & avatar |
| Skill | `/ux-design` | Spesifikasi layar, HUD, pola interaksi, aksesibilitas |
| Skill | `/ux-review` | Review spesifikasi UX |
| Skill | `/balance-check` | Cek ekonomi: gaji, saldo, level, nanti toko/saham |
| Skill | `/playtest-report` | Merapikan catatan uji main |
| Agen | `game-designer`, `economy-designer`, `ux-designer`, `art-director`, `live-ops-designer` | Dipanggil skill di atas atau langsung |

Template dokumen ada di `.claude/docs/templates/`. Hasil skill ditulis ke `design/`.

## Yang diubah dari aslinya

- Baris `` !`bash …/hooks/yaml-helper.sh resolve_config …` `` di tiap skill dihapus, beserta izin Bash-nya. Tanpa skrip itu skill gagal dimuat. Penggantinya blok konfigurasi tetap: `review_mode: solo`, `workflow: minimal`, `docs.density: terse`, engine web, dokumen berbahasa Indonesia.
- Kredit sumber ditambahkan di bawah frontmatter tiap file.
- Isi instruksi lain tidak diubah.

## Yang sengaja tidak dipasang

- Semua hook dan `settings.json` mereka (menjalankan skrip bash di setiap tool call).
- Agen engine (Godot/Unity/Unreal), agen produksi, dan skill sprint/story/rilis.
- `/design-system` (butuh `registry.sh` dan `/map-systems`) dan `/scope-check` (butuh git dan milestone).

Skill yang terpasang kadang menyarankan skill CCGS lain (mis. `/map-systems`, `/gate-check`). Itu tidak terpasang; lewati.

## Memperbarui

Unduh ulang file yang sama dari commit baru, lalu ulangi dua perubahan di atas. Baca dulu perbedaannya sebelum menimpa.

---

# Skill teknis dari awesome-gamedev-agent-skills

Sumber: [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) commit `19d93f9`, lisensi Apache-2.0 (`.claude/vendor/awesome-gamedev-agent-skills-LICENSE` + `-NOTICE`).

## Yang dipasang (skill disiplin, netral engine)

| Skill | Untuk AUDIRA LAND |
|---|---|
| `performance-optimization` | 60 fps di HP RAM 2 GB, skala 10.000+ warga |
| `game-ai` | Pejalan, mobil, kapal: FSM, steering, pathfinding (taman pakai BFS) |
| `camera-systems` | Pan/zoom peta isometrik, batas peta, smoothing |
| `game-ui-ux` | HUD, kartu warga, safe area HP |
| `game-feel` | Tween & feedback: kapal sandar, emote, naik jabatan |
| `create-game-assets` | Pendukung `/art-bible` saat poles visual; skrip Python butuh Pillow |

## Yang diubah dari aslinya

- Satu baris kredit ditambahkan di bawah frontmatter tiap `SKILL.md`, termasuk catatan bahwa proyek tanpa engine.
- Folder `create-game-assets/agents/` (konfigurasi OpenAI Codex) dihapus.
- Isi instruksi lain tidak diubah.

## Yang sengaja tidak dipasang

- Router (mendeteksi engine dari file proyek; di sini tidak ada engine).
- Semua skill engine (Godot, Unity, Unreal, Phaser, PixiJS, three.js, Bevy, Roblox, dll.), genre, dan workflow rilis (Steam/itch/game jam).
- `procedural-gen`, `audio-design`: opsional, pasang bila perlu.

Skill ini sering memberi contoh per engine. Pakai prinsipnya, terapkan ke Canvas 2D di `js/`.

## Memperbarui

Clone ulang repo ke folder sementara, salin ulang folder yang sama dari `skills/disciplines/`, lalu ulangi perubahan di atas. Baca dulu perbedaannya sebelum menimpa.
