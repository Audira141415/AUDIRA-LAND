/* AUDIRA LAND · admin: pratinjau canvas + contoh siap tempel untuk panel Cetak Biru (#pnCetak di admin.html).
   Butuh js/render.js, js/cetak.js, js/cetak-gambar.js. Tidak mengubah form; hanya membaca #ctG dan menulis ke sana saat contoh dipilih. */
(function (AL) {
  'use strict';
  const CONTOH = {
    'Masjid kecil': [
      ['bidang', 0.05, 0.05, 1.9, 1.9, '#e6dccb'],
      ['kotak', 0.35, 0.35, 1.3, 1.2, 0.9, '#f4efe4'],
      ['jendela', 0.35, 0.35, 1.3, 1.2, 0.9, '#7fa8c9'],
      ['kotak', 0.3, 0.3, 1.4, 1.3, 0.08, '#c9b98f', 0.9],
      ['kubah', 1.0, 0.95, 0.5, 0.98, '#3f8f7a'],
      ['tiang', 1.0, 0.95, 0.03, 1.53, 0.25, '#d9b44a'],
      ['tiang', 1.75, 0.25, 0.1, 0, 2.2, '#f4efe4'],
      ['kotak', 1.65, 0.15, 0.2, 0.2, 0.06, '#c9b98f', 1.6],
      ['limas', 1.65, 0.15, 0.2, 0.2, 2.2, 0.45, '#3f8f7a'],
      ['teks', 0.45, 1.55, 0.32, 0.12, 'AL-BAHRI', '#3f6f5a'],
      ['pohon', 0.2, 1.8, 0.45],
    ],
    'Menara jam': [
      ['bidang', 0.2, 0.2, 1.6, 1.6, '#d5d0c6'],
      ['kotak', 0.45, 0.45, 1.1, 1.1, 0.5, '#b9a68a'],
      ['kotak', 0.6, 0.6, 0.8, 0.8, 3.0, '#e9dfc4', 0.5],
      ['jendela', 0.6, 0.6, 0.8, 0.8, 2.2, '#8fb9b5', 0.6],
      ['kotak', 0.55, 0.55, 0.9, 0.9, 0.7, '#a15364', 3.5],
      ['tiang', 0.98, 1.45, 0.22, 3.62, 0.02, '#fffaf0'],
      ['tiang', 1.45, 0.98, 0.22, 3.62, 0.02, '#fffaf0'],
      ['limas', 0.5, 0.5, 1.0, 1.0, 4.2, 1.1, '#3f6f8f'],
      ['tiang', 1.0, 1.0, 0.02, 5.3, 0.35, '#d9b44a'],
      ['teks', 0.62, 1.45, 0.85, 0.11, 'PUKUL 12', '#14324a'],
    ],
  };
  const json = g => '[\n' + g.map(p => '  ' + JSON.stringify(p)).join(',\n') + '\n]';

  function mount(A) {
    const panel = document.getElementById('pnCetak'), ta = document.getElementById('ctG');
    if (!panel || !ta || !AL || !AL.cetakValidasi || !AL.Painter) return;
    const box = document.createElement('div');
    box.className = 'acts';
    const cv = document.createElement('canvas');
    cv.width = 320; cv.height = 300;
    cv.style.width = '100%'; cv.style.maxWidth = '320px';
    cv.style.background = '#e9f2f3'; cv.style.borderRadius = '14px';
    cv.setAttribute('aria-label', 'Pratinjau cetak biru');
    const side = document.createElement('div');
    const cap = document.createElement('p');
    cap.className = 'hint';
    cap.textContent = 'Pratinjau muncul saat JSON valid.';
    const night = document.createElement('label');
    night.className = 'check';
    night.innerHTML = '<input type="checkbox"> Malam';
    side.appendChild(cap); side.appendChild(night);
    for (const name of Object.keys(CONTOH)) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn ghost sm';
      b.textContent = 'Contoh: ' + name;
      b.addEventListener('click', () => {
        if (ta.value.trim() && !confirm('Ganti isi primitif dengan contoh ' + name + '?')) return;
        ta.value = json(CONTOH[name]);
        const nama = document.getElementById('ctNama'), jenis = document.getElementById('ctJenis');
        if (nama && !nama.value) nama.value = name === 'Masjid kecil' ? 'Masjid Al-Bahri' : 'Menara Jam Pulau';
        if (jenis && !jenis.value) jenis.value = name === 'Masjid kecil' ? 'Masjid' : 'Menara Jam';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        draw();
      });
      side.appendChild(b);
    }
    box.appendChild(cv); box.appendChild(side);
    const form = document.getElementById('ctForm');
    if (form && form.nextSibling) panel.insertBefore(box, form.nextSibling); else panel.appendChild(box);

    let lastKey = null;
    function draw() {
      const isNight = night.querySelector('input').checked;
      const key = ta.value + '|' + isNight;
      if (key === lastKey) return;
      lastKey = key;
      const c = cv.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, cv.width, cv.height);
      const t = ta.value.trim();
      const v = t ? AL.cetakValidasi(t) : null;
      if (!v || !v.ok) { cap.textContent = t ? 'JSON belum valid, pratinjau ditahan.' : 'Pratinjau muncul saat JSON valid.'; return; }
      // skala menyesuaikan tinggi bangunan supaya muat di kanvas
      const s = Math.min(1.5, 230 / (2 * AL.TH + v.top * AL.TH + 10));
      const ox = cv.width / 2, oy = cv.height - 2 * AL.TH * s - 20;
      const p = new AL.Painter(c, s, ox, oy, isNight);
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) p.poly([[a, b, 0], [a + 1, b, 0], [a + 1, b + 1, 0], [a, b + 1, 0]], '#b7dd90');
      for (let a = 0; a < 2; a++) p.poly([[a, 2, 0], [a + 1, 2, 0], [a + 1, 2.6, 0], [a, 2.6, 0]], '#8e959f');
      const lot = { id: 'pratinjau', i: 0, type: 'house', x: 0, y: 0, seed: 7, district: 'kota', cetak: { g: v.g, top: v.top, v: 'p' } };
      try { AL.drawObject(p, lot); } catch (e) { cap.textContent = 'Gagal menggambar: ' + e.message; return; }
      if (isNight) { c.fillStyle = 'rgba(16,24,56,.25)'; c.fillRect(0, 0, cv.width, cv.height); }
      cap.textContent = v.g.length + ' primitif · puncak ' + v.top + ' petak';
    }
    ta.addEventListener('input', draw);
    night.querySelector('input').addEventListener('change', draw);
    // form juga diisi lewat kode (Edit / Isi contoh) tanpa event: cek ringan tiap 0,6 dtk
    setInterval(() => { if (!document.hidden && !panel.hidden) draw(); }, 600);
    draw();
  }
  (window.ADMIN_MODS = window.ADMIN_MODS || []).push(mount);
})(window.AL);
