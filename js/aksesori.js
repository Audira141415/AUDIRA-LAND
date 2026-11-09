/* AUDIRA LAND · aksesori avatar dari Butik (kupluk, topi, kacamata, syal, aura).
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

  const baseWalker = AL.drawWalker;
  AL.drawWalker = function (c, x, y, k, L, t, night) {
    const items = L && L.items && L.items.length;
    if (items && k >= 0.45) aura(c, x, y, k * 0.9, L, t || performance.now() / 1000);
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
