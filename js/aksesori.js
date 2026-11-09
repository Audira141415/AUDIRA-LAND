/* AUDIRA LAND · aksesori avatar dari Butik (kupluk, topi, kacamata, syal, aura, hewan pendamping).
   Membungkus AL.drawWalker & AL.drawPortrait tanpa mengubah avatar.js. L.items = ['kupluk', ...]. */
(function (AL) {
  'use strict';
  const has = (L, id) => L && L.items && L.items.includes(id);
  const circle = (c, x, y, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
  AL.parseItems = s => (s ? String(s).split(',').filter(Boolean) : []);

  // ---- di kepala/badan pejalan kecil: (hx,hy) pusat kepala, s skala ----
  function itemsSmall(c, hx, hy, s, L, t, neckY) {
    if (has(L, 'syal-batik')) {
      c.fillStyle = '#8a6440'; c.fillRect(hx - 3.3 * s, neckY - 0.6 * s, 6.6 * s, 1.9 * s);
      c.fillStyle = '#c8ad80'; c.fillRect(hx - 3.3 * s, neckY, 6.6 * s, 0.6 * s);
      c.fillStyle = '#8a6440'; c.fillRect(hx + 1.4 * s, neckY + 1 * s, 1.5 * s, 3 * s);
    }
    if (has(L, 'kalung-kerang')) for (let k = -2; k <= 2; k++) circle(c, hx + k * 1.1 * s, neckY + 0.6 * s + Math.abs(k) * -0.3 * s, 0.55 * s, k % 2 ? '#f3ece2' : '#d9a99d');
    if (has(L, 'kacamata-hitam')) { c.fillStyle = '#16181f'; c.fillRect(hx - 2.6 * s, hy - 0.2 * s, 5.4 * s, 1.3 * s); }
    if (has(L, 'kacamata-bulat')) {
      c.strokeStyle = '#3a2b20'; c.lineWidth = Math.max(0.6, 0.45 * s);
      c.beginPath(); c.arc(hx - 1.1 * s, hy + 0.4 * s, 0.95 * s, 0, 7); c.stroke();
      c.beginPath(); c.arc(hx + 1.5 * s, hy + 0.4 * s, 0.95 * s, 0, 7); c.stroke();
    }
    if (has(L, 'kupluk')) {
      c.fillStyle = '#7b86c4'; c.beginPath(); c.arc(hx, hy - 0.6 * s, 3.2 * s, Math.PI, 0); c.fill();
      c.fillStyle = '#6a74ad'; c.fillRect(hx - 3.3 * s, hy - 1.1 * s, 6.6 * s, 1.2 * s);
      circle(c, hx, hy - 4 * s, 1.1 * s, '#ffffff');
    }
    if (has(L, 'topi-pantai')) {
      c.fillStyle = '#dccaa6'; c.beginPath(); c.ellipse(hx, hy - 1.6 * s, 5.8 * s, 1.5 * s, 0, 0, 7); c.fill();
      c.beginPath(); c.ellipse(hx, hy - 2.6 * s, 2.8 * s, 2 * s, 0, Math.PI, 0); c.fill();
      c.fillStyle = '#d9967c'; c.fillRect(hx - 2.8 * s, hy - 2.4 * s, 5.6 * s, 0.8 * s);
    }
    if (has(L, 'topi-kapten')) {
      c.fillStyle = '#14324a'; c.fillRect(hx - 3 * s, hy - 2.1 * s, 6 * s, 1.2 * s);
      c.fillStyle = '#f7f4ee'; c.beginPath(); c.ellipse(hx, hy - 2.6 * s, 3.4 * s, 1.5 * s, 0, 0, 7); c.fill();
      c.fillStyle = '#14324a'; c.beginPath(); c.ellipse(hx + 1.6 * s, hy - 0.9 * s, 2.2 * s, 0.7 * s, 0, 0, 7); c.fill();
      circle(c, hx, hy - 1.5 * s, 0.6 * s, '#c9b07e');
    }
    if (has(L, 'mahkota')) {
      c.fillStyle = '#c9b07e';
      c.beginPath(); c.moveTo(hx - 2.8 * s, hy - 1.8 * s); c.lineTo(hx - 2.8 * s, hy - 4.6 * s); c.lineTo(hx - 1.4 * s, hy - 3.2 * s);
      c.lineTo(hx, hy - 5.2 * s); c.lineTo(hx + 1.4 * s, hy - 3.2 * s); c.lineTo(hx + 2.8 * s, hy - 4.6 * s); c.lineTo(hx + 2.8 * s, hy - 1.8 * s); c.closePath(); c.fill();
      circle(c, hx, hy - 2.7 * s, 0.6 * s, '#c0645c');
    }
  }
  function aura(c, x, y, s, L, t) {
    if (has(L, 'aura-ombak')) {
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 2; k++) {
        const ph = (t * 0.8 + k * 0.5) % 1;
        c.strokeStyle = `rgba(120,190,200,${0.6 * (1 - ph)})`; c.lineWidth = Math.max(1, 0.8 * s);
        c.beginPath(); c.ellipse(x, y, (4 + ph * 6) * s, (1.6 + ph * 2.4) * s, 0, 0, 7); c.stroke();
      }
      c.restore();
    }
    if (has(L, 'aura-bintang')) {
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 5; k++) {
        const a = t * 1.6 + k * 1.26, r = 6 * s;
        const sx = x + Math.cos(a) * r, sy = y - 8 * s + Math.sin(a) * r * 0.8;
        c.fillStyle = `rgba(230,205,150,${0.55 + 0.45 * Math.sin(t * 5 + k)})`;
        c.beginPath();
        for (let i = 0; i < 8; i++) { const rr = i % 2 ? 0.45 * s : 1.3 * s, aa = i * Math.PI / 4; c[i ? 'lineTo' : 'moveTo'](sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr); }
        c.closePath(); c.fill();
      }
      c.restore();
    }
  }

  // ---- hewan pendamping (slot 'hewan'): digambar menyamping, menghadap kanan, (x,y) = titik kaki ----
  // g = fase langkah, mv = sedang berjalan, tw = waktu nyata (ekor/kepak tetap hidup saat diam), col = pewarna malam
  const ell = (c, x, y, rx, ry, col, rot) => { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); c.fill(); };
  const legs = (c, x, y, s, xs, h, w, g, mv, col) => {
    c.fillStyle = col;
    xs.forEach((lx, i) => { const sw = mv ? Math.sin(g + (i % 2) * Math.PI) * 0.45 * s : 0; c.fillRect(x + lx * s + sw - w * s / 2, y - h * s, w * s, h * s); });
  };
  const shadow = (c, x, y, rx, s) => ell(c, x, y, rx * s, rx * 0.38 * s, 'rgba(20,40,60,.2)');
  const PETS = {
    'kucing-oyen'(c, x, y, s, g, mv, tw, col) {
      const bob = mv ? Math.abs(Math.sin(g)) * 0.5 * s : Math.sin(tw * 2) * 0.12 * s;
      shadow(c, x, y, 3, s);
      legs(c, x, y, s, [-1.7, -1.1, 1.3, 1.9], 1.7, 0.6, g, mv, col('#cf7a2c'));
      const by = y - 2.6 * s - bob;
      c.strokeStyle = col('#e08a34'); c.lineWidth = 0.7 * s; c.lineCap = 'round';
      const wag = Math.sin(tw * 3) * 0.8 * s;
      c.beginPath(); c.moveTo(x - 2.3 * s, by); c.quadraticCurveTo(x - 4 * s, by - 0.6 * s, x - 3.6 * s + wag, by - 3 * s); c.stroke();
      ell(c, x, by, 2.6 * s, 1.3 * s, col('#e8913a'));
      c.fillStyle = col('#c46e22');
      for (const sx of [-1.2, 0, 1.1]) c.fillRect(x + sx * s - 0.22 * s, by - 1.25 * s, 0.44 * s, 1 * s);
      ell(c, x + 0.3 * s, by + 0.6 * s, 1.6 * s, 0.55 * s, col('#f7e2c4'));
      const hx = x + 2.6 * s, hy = by - 1.3 * s;
      c.fillStyle = col('#e8913a');
      c.beginPath(); c.moveTo(hx - 1.1 * s, hy - 0.4 * s); c.lineTo(hx - 0.8 * s, hy - 1.9 * s); c.lineTo(hx - 0.1 * s, hy - 0.9 * s); c.fill();
      c.beginPath(); c.moveTo(hx + 0.2 * s, hy - 0.9 * s); c.lineTo(hx + 0.9 * s, hy - 1.9 * s); c.lineTo(hx + 1.1 * s, hy - 0.3 * s); c.fill();
      circle(c, hx, hy, 1.25 * s, col('#e8913a'));
      ell(c, hx + 0.55 * s, hy + 0.45 * s, 0.6 * s, 0.4 * s, col('#f7e2c4'));
      const blink = Math.sin(tw * 1.3) > 0.97;
      c.fillStyle = '#2a1f1a'; c.fillRect(hx + 0.35 * s, hy - 0.35 * s, 0.35 * s, blink ? 0.08 * s : 0.42 * s);
    },
    'ayam-kampung'(c, x, y, s, g, mv, tw, col) {
      const bob = mv ? Math.abs(Math.sin(g * 1.3)) * 0.5 * s : 0;
      const peck = mv ? 0 : Math.max(0, Math.sin(tw * 1.8)) ** 6 * 1.6 * s; // mematuk saat diam
      shadow(c, x, y, 2.4, s);
      c.strokeStyle = col('#e2b13c'); c.lineWidth = 0.4 * s;
      for (const [lx, i] of [[-0.4, 0], [0.5, 1]]) {
        const sw = mv ? Math.sin(g * 1.3 + i * Math.PI) * 0.5 * s : 0;
        c.beginPath(); c.moveTo(x + lx * s, y - 1.8 * s); c.lineTo(x + lx * s + sw, y); c.stroke();
      }
      const by = y - 3 * s - bob;
      // ekor hijau gelap mengkilap
      c.fillStyle = col('#24493a');
      c.beginPath(); c.moveTo(x - 1.2 * s, by - 0.3 * s); c.quadraticCurveTo(x - 3.4 * s, by - 3.6 * s, x - 2.2 * s, by - 4 * s); c.quadraticCurveTo(x - 2.6 * s, by - 1.6 * s, x - 0.6 * s, by + 0.4 * s); c.fill();
      ell(c, x, by, 1.9 * s, 1.4 * s, col('#b5653a'));
      ell(c, x - 0.4 * s, by + 0.1 * s, 1.1 * s, 0.75 * s, col('#8a4526'), -0.3);
      const hx = x + 1.5 * s + peck * 0.4, hy = by - 1.7 * s + peck;
      c.fillStyle = col('#d8433a');
      c.beginPath(); c.arc(hx - 0.2 * s, hy - 0.8 * s, 0.45 * s, 0, 7); c.arc(hx + 0.35 * s, hy - 0.85 * s, 0.4 * s, 0, 7); c.fill();
      circle(c, hx, hy, 0.85 * s, col('#c9733f'));
      c.fillStyle = col('#f2c14e');
      c.beginPath(); c.moveTo(hx + 0.7 * s, hy - 0.2 * s); c.lineTo(hx + 1.6 * s, hy + 0.1 * s); c.lineTo(hx + 0.7 * s, hy + 0.35 * s); c.fill();
      circle(c, hx + 0.6 * s, hy + 0.7 * s, 0.3 * s, col('#d8433a'));
      circle(c, hx + 0.25 * s, hy - 0.15 * s, 0.2 * s, '#1a1410');
    },
    'anjing-kampung'(c, x, y, s, g, mv, tw, col) {
      const bob = mv ? Math.abs(Math.sin(g)) * 0.6 * s : Math.sin(tw * 2.4) * 0.12 * s;
      shadow(c, x, y, 3.4, s);
      legs(c, x, y, s, [-2, -1.3, 1.5, 2.2], 2.2, 0.7, g, mv, col('#b98a52'));
      const by = y - 3.2 * s - bob;
      c.strokeStyle = col('#c99a5e'); c.lineWidth = 0.8 * s; c.lineCap = 'round';
      const wag = Math.sin(tw * 9) * 0.7 * s;
      c.beginPath(); c.moveTo(x - 2.6 * s, by - 0.3 * s); c.quadraticCurveTo(x - 3.5 * s, by - 1.4 * s, x - 3 * s + wag, by - 2.8 * s); c.stroke();
      ell(c, x, by, 3 * s, 1.5 * s, col('#d2a26a'));
      ell(c, x + 0.4 * s, by + 0.7 * s, 2 * s, 0.6 * s, col('#ecd2a8'));
      const hx = x + 3 * s, hy = by - 1.7 * s;
      circle(c, hx, hy, 1.4 * s, col('#d2a26a'));
      ell(c, hx + 1.2 * s, hy + 0.45 * s, 0.9 * s, 0.6 * s, col('#ecd2a8'));
      circle(c, hx + 1.95 * s, hy + 0.25 * s, 0.3 * s, '#2a1f1a');
      ell(c, hx - 0.6 * s, hy + 0.2 * s, 0.55 * s, 1.1 * s, col('#9a6a3a'), 0.35); // telinga jatuh
      circle(c, hx + 0.5 * s, hy - 0.35 * s, 0.22 * s, '#2a1f1a');
    },
    'burung-beo'(c, x, y, s, g, mv, tw, col, portrait) {
      // terbang mengiringi di samping kepala pemilik; di potret hinggap lebih rendah
      const fy = portrait ? y - 3 * s : y - 12.5 * s + Math.sin(tw * 2.2) * 0.8 * s;
      if (!portrait) shadow(c, x, y, 1.6, s);
      const flap = Math.sin(tw * 16);
      c.fillStyle = col('#2a2d36');
      c.beginPath(); c.moveTo(x - 1 * s, fy + 0.2 * s); c.lineTo(x - 2.8 * s, fy + 1.2 * s); c.lineTo(x - 0.6 * s, fy + 0.9 * s); c.fill(); // ekor
      ell(c, x, fy, 1.6 * s, 1.05 * s, col('#1d1f24'), -0.2);
      ell(c, x - 0.2 * s, fy - 0.6 * s * flap, 1.4 * s, Math.max(0.15, Math.abs(flap)) * 0.9 * s, col('#30343f'), -0.3); // sayap
      c.fillStyle = col('#f3ece2'); c.fillRect(x - 0.9 * s, fy - 0.6 * s * flap - 0.1 * s, 0.7 * s, 0.25 * s);
      const hx = x + 1.3 * s, hy = fy - 0.8 * s;
      circle(c, hx, hy, 0.8 * s, col('#1d1f24'));
      ell(c, hx - 0.15 * s, hy + 0.45 * s, 0.5 * s, 0.3 * s, col('#ffd23a')); // gelambir kuning
      c.fillStyle = col('#ff9a2e');
      c.beginPath(); c.moveTo(hx + 0.6 * s, hy - 0.3 * s); c.lineTo(hx + 1.6 * s, hy + 0.15 * s); c.lineTo(hx + 0.6 * s, hy + 0.35 * s); c.fill();
      circle(c, hx + 0.2 * s, hy - 0.15 * s, 0.18 * s, '#fffaf0');
    },
    'kura-kura'(c, x, y, s, g, mv, tw, col) {
      const g2 = g * 0.45, bob = mv ? Math.abs(Math.sin(g2)) * 0.2 * s : 0;
      shadow(c, x, y, 2.8, s);
      c.fillStyle = col('#8fb36a');
      for (const [lx, i] of [[-1.5, 0], [1.4, 1]]) {
        const sw = mv ? Math.sin(g2 + i * Math.PI) * 0.4 * s : 0;
        ell(c, x + lx * s + sw, y - 0.4 * s, 0.6 * s, 0.45 * s, col('#8fb36a'));
      }
      const peek = mv ? 1 : 0.75 + 0.25 * Math.sin(tw * 0.8);
      const hx = x + (2 + peek * 0.6) * s, hy = y - 1.1 * s - bob;
      circle(c, hx, hy, 0.7 * s, col('#9bbf7a'));
      circle(c, hx + 0.3 * s, hy - 0.15 * s, 0.14 * s, '#1a1410');
      const by = y - 1 * s - bob;
      c.fillStyle = col('#5f8f4a');
      c.beginPath(); c.ellipse(x, by, 2.4 * s, 1.9 * s, 0, Math.PI, 0); c.fill();
      c.fillStyle = col('#4a7339'); c.fillRect(x - 2.5 * s, by - 0.15 * s, 5 * s, 0.4 * s);
      c.fillStyle = col('#7fae5f');
      for (const [px, py] of [[-1.1, -0.7], [0, -1.3], [1.1, -0.7]]) ell(c, x + px * s, by + py * s, 0.55 * s, 0.38 * s, col('#7fae5f'));
    },
  };
  AL.HEWAN = Object.keys(PETS); // katalog klien slot 'hewan' (harga & nama dari /api/butik)
  const petOf = L => { const it = L.items; for (let i = 0; i < it.length; i++) if (PETS[it[i]]) return it[i]; return null; };
  const PET_MIN_K = 0.9; // di peta kota: hewan hanya digambar bila zoom cukup besar (hemat untuk ratusan pejalan)

  const baseWalker = AL.drawWalker;
  AL.drawWalker = function (c, x, y, k, L, t, night) {
    const items = L && L.items && L.items.length;
    if (items && k >= 0.45) aura(c, x, y, k * 0.9, L, t || performance.now() / 1000);
    if (items && k >= PET_MIN_K) {
      const pet = petOf(L);
      if (pet) {
        const s = k * 0.9, nt = (night || 0) * 0.5;
        const col = h => (nt > 0 ? AL.mix(h, AL.NIGHT, nt) : h);
        PETS[pet](c, x - 7.5 * s, y + 0.6 * s, s, (t || 0) * 9, !!t, performance.now() / 1000, col, false);
      }
    }
    baseWalker(c, x, y, k, L, t, night);
    if (!items || k < 0.45) return;
    // posisi kepala sama dengan avatar.js (s = k*0.9, kepala di y-14.5s, leher di y-11.5s)
    const s = k * 0.9, bob = Math.abs(Math.sin(t * 9)) * 0.8 * s;
    itemsSmall(c, x, y - 14.5 * s - bob, s, L, t, y - 11.5 * s - bob);
  };

  // ---- potret kartu: kepala di (S/2, 0.42S), R = 0.2S ----
  const basePortrait = AL.drawPortrait;
  AL.drawPortrait = function (c, L, S) {
    basePortrait(c, L, S);
    if (!L || !L.items || !L.items.length) return;
    const R = S * 0.2, k = R / 2.9; // skala supaya cocok dengan bentuk pejalan
    c.save();
    c.beginPath(); c.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); c.clip();
    itemsSmall(c, S / 2, S * 0.42, k, L, 0, S * 0.42 + R * 1.25);
    // hewan pendamping duduk di pojok kanan bawah potret
    const pet = petOf(L);
    if (pet) {
      const ps = k * 0.55, px = S * 0.68, py = S * 0.86;
      c.fillStyle = 'rgba(255,250,240,.55)';
      c.beginPath(); c.ellipse(px, py - 2.2 * ps, 4.4 * ps, 3.6 * ps, 0, 0, Math.PI * 2); c.fill();
      PETS[pet](c, px - 0.6 * ps, py, ps, 0, false, 0, h => h, true);
    }
    c.restore();
  };

  // pasang aksesori dari /api/city (looks) ke warga di peta
  AL.applyLooks = function (looks) {
    if (!AL.residents) return;
    for (const r of AL.residents) if (r.look.items) r.look.items = null;
    for (const [u, s] of Object.entries(looks || {})) {
      const r = AL.byName.get(u);
      if (r) r.look.items = AL.parseItems(s);
    }
  };
  if (AL.net && AL.net.apply) {
    const baseApply = AL.net.apply;
    AL.net.apply = function (d) { baseApply(d); AL.applyLooks(d.looks); };
  }
})(window.AL);
