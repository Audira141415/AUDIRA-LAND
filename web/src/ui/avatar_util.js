/**
 * AUDIRA-LAND: Pemroses foto profil warga (chunk lazy).
 * Dimuat lewat import() dinamis hanya saat warga memilih file, jadi kode kanvas berat
 * tidak membebani muatan JS awal (anggaran 160 KB gzip).
 *
 * Foto milik warga sendiri yang mereka unggah (bukan tarikan Instagram): di-crop kotak,
 * diperkecil ke 256×256, lalu dikompres ke data URL WebP/JPEG ≤ ~30 KB untuk localStorage.
 */

export const AVATAR_SIZE = 256;
export const AVATAR_MAX_BYTES = 30 * 1024; // ~30 KB agar aman di localStorage
const MAX_FILE_BYTES = 12 * 1024 * 1024;   // tolak file mentah > 12 MB sebelum diproses

/** Perkiraan jumlah byte dari panjang data URL base64 (tanpa decode). */
function dataUrlBytes(url) {
    const i = url.indexOf(',');
    const b64 = i >= 0 ? url.slice(i + 1) : url;
    const pad = b64.endsWith('==') ? 2 : (b64.endsWith('=') ? 1 : 0);
    return Math.floor(b64.length * 3 / 4) - pad;
}

/**
 * Validasi + proses satu File gambar menjadi data URL avatar kecil.
 * @param {File} file
 * @returns {Promise<string>} data URL (WebP bila didukung, selain itu JPEG)
 * @throws {Error} pesan ramah pengguna bila tipe/ukuran salah atau gambar gagal dimuat
 */
export async function fileToAvatarDataUrl(file) {
    if (!file) throw new Error('Tidak ada file dipilih.');
    if (!/^image\//.test(file.type)) throw new Error('File harus berupa gambar (JPG, PNG, atau WebP).');
    if (file.size > MAX_FILE_BYTES) throw new Error('Ukuran foto terlalu besar (maks 12 MB). Pilih foto lain.');

    const img = await loadImage(file);
    try {
        const canvas = document.createElement('canvas');
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        const ctx = canvas.getContext('2d');
        // Crop kotak di tengah (cover), lalu perkecil ke 256×256
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - side) / 2;
        const sy = (img.naturalHeight - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

        const type = canvasSupportsWebp(canvas) ? 'image/webp' : 'image/jpeg';
        // Turunkan kualitas sampai muat anggaran byte
        let url = '';
        for (const q of [0.82, 0.7, 0.58, 0.45, 0.35]) {
            url = canvas.toDataURL(type, q);
            if (dataUrlBytes(url) <= AVATAR_MAX_BYTES) break;
        }
        if (!url) throw new Error('Gagal memproses foto. Coba foto lain.');
        return url;
    } finally {
        if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
    }
}

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gambar tidak bisa dibaca. Coba foto lain.')); };
        img.src = url;
    });
}

function canvasSupportsWebp(canvas) {
    try {
        return canvas.toDataURL('image/webp').startsWith('data:image/webp');
    } catch (e) {
        return false;
    }
}
