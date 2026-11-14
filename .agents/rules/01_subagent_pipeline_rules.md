# AUDIRA-LAND — Aturan Kerja Sub-Agen & Orkestrasi Tim

Sesuai arsitektur blueprint **Republik Netizenia v2**, pengembangan AUDIRA-LAND digerakkan oleh **AI Utama (Lead Developer & Orchestrator)** bersama tim sub-agen spesialis terisolasi:

---

## 1. Prinsip Utama: Spek Dulu, Kode Kemudian
- Dilarang langsung memodifikasi kode tanpa dokumen spesifikasi yang mencantumkan batasan kuantitatif (draw call, triangle budget, ukuran file, waktu eksekusi).
- Setiap fitur baru harus memiliki kriteria selesai (*definition of done*) yang dapat diuji secara objektif.

---

## 2. Isolasi Verifikator Independen
- Hasil pekerjaan agen pembuat (*implementer*) selalu diuji ulang oleh agen verifikator independen.
- Verifikator **tidak boleh** membaca kesimpulan pembuat; verifikator hanya menerima kode dan spek, lalu mencari celah kegagalan (*assume buggy until proven otherwise*).

---

## 3. Laporan Jujur & Berbasis Bukti Nyata
- Dilarang memberikan laporan "berhasil/lulus" jika hasil pengujian masih tertutup derau pengukuran (*measurement noise*) atau belum diverifikasi di layar 390px.
- Setiap laporan wajib menyertakan perbandingan angka sebelum vs sesudah dan tangkapan layar bukti.

---

## 4. Idempotensi Database
- Seluruh kode SQL harus ditulis dalam satu file migration yang bersifat idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`).
- Wajib diuji pada instalasi database bersih dan skenario upgrade versi lama sebelum diaplikasikan ke Supabase produksi.

