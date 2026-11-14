# 🧠 AUDIRA-LAND (`AGENTS.md`)

> **Workspace Hub**: Game Kota Gotong Royong Digital 3D (Web + Mobile First).  
> **Arsitektur Referensi**: *Republik Netizenia v2* (@Ssfgf)  
> **Terhubung ke Master Orchestrator**: [`F:\AGENTS.md`](file:///f:/AGENTS.md) dan Master Skill Hub: [`F:\AUDIRA-ALL-SKILL`](file:///f:/AUDIRA-ALL-SKILL).

---

## 1. Peran Tim

| Peran | Entitas | Tanggung Jawab |
| :--- | :--- | :--- |
| **Pemilik Proyek (Producer)** | **User** | Mengambil 15 keputusan kunci (tema, gaya, ekonomi, voting), memberi arahan, tes di HP, menyetujui rilis. |
| **AI Utama (Lead Developer & Orchestrator)** | **Antigravity** | Menulis spek teknis, memecah tugas ke sub-agen, memverifikasi hasil, menjaga anggaran performa HP. |
| **Sub-Agen Spesialis** | **Subagents** | Bekerja dengan ruang lingkup sempit (3D modeling, SQL RPC, mobile perf, independent verification). |

---

## 2. Struktur Proyek `AUDIRA-LAND`

```
AUDIRA-LAND/
├── .agents/
│   ├── brain/                 # GDD, Data Model, Visual Standards, Mobile Perf
│   ├── rules/                 # Zero-submerging, RLS-first, Subagent rules
│   ├── skills/                # Director, 3D Modeler, Supabase Architect, Mobile Perf
│   └── MEMORY.md              # Project learning & state
├── web/                       # Three.js r128 Web Application
│   ├── index.html             # Shell utama
│   ├── src/
│   │   ├── core/              # Engine, grid deterministik, kamera isometrik & tokoh
│   │   ├── models/            # Prosedural 3D model fasad bangunan
│   │   ├── ui/                # HUD, joystick, sheet, modal, photo mode
│   │   └── api/               # Supabase RPC connectors & state
│   └── public/                # Static assets, fonts, icons
├── supabase/                  # SQL Idempotent Schema & Migrations
│   ├── schema.sql             # Tabel, RLS, functions, triggers
│   └── seed.sql               # Pengaturan awal & 25 distrik
├── blender/                   # Pipeline aset 3D offline (Blender 5.2.2)
│   ├── scripts/               # Script builder props/bangunan
│   └── exports/               # FBX / glTF / mesh.json
├── docs/                      # Dokumentasi & log rilis
├── README.md
└── AGENTS.md
```

---

## 3. Protokol Sub-Agen & Verifikasi

1. **Spek Terlebih Dahulu**: Setiap kelompok fitur wajib memiliki dokumen spesifikasi tertulis sebelum baris kode pertama ditulis.
2. **Isolasi Verifikator**: Pekerjaan agen implementer selalu diverifikasi oleh agen verifikator independen yang mencari kegagalan tanpa membaca kesimpulan pembuat.
3. **Pengujian Nyata di Layar HP (390px)**: Setiap rilis harus diuji di layar 390px dengan 4× CPU throttle. Draw calls tidak boleh melebihi 100, dan ukuran JS gzip tidak boleh melebihi 160 KB.

