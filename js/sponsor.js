/* AUDIRA LAND · Sponsor di dalam kota: papan reklame, hologram di atas gedung, toko bermerek.
   Dipakai peta (index.html) dan admin (pratinjau). Slot dihitung dari peta deterministik. */
(function (AL) {
  'use strict';
  const COLOR_RE = /^#[0-9a-f]{6}$/i;

  // ---------- 1. SLOT KANDIDAT ----------
  AL.sponsorSlots = function () {
    if (AL._slots) return AL._slots;
    const { lots, T, W, H, tiles, idx } = AL;
    const out = [];
    lots.forEach(l => {
      if (l.type === 'menara' || (l.type === 'office' && l.zone === 0)) out.push({ id: 'holo:' + l.i, kind: 'holo', lot: l.i, x: l.x, y: l.y, label: `Hologram · ${l.name}, ${l.street}` });
    });
    lots.forEach(l => {
      if (l.type === 'shop') out.push({ id: 'toko:' + l.i, kind: 'toko', lot: l.i, x: l.x, y: l.y, label: `Toko · ${l.name}, ${l.street} No. ${l.num}` });
    });
    // papan: petak rumput tanpa pohon di tepi jalan, saling berjauhan, dekat pusat dulu
    const busy = new Set(AL.statics.map(o => o.x + ',' + o.y));
    const isRoad = (x, y) => AL.tileAt(x, y) === T.ROAD;
    const cand = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (tiles[idx(x, y)] !== T.GRASS || busy.has(x + ',' + y)) continue;
      let face = null, street = '';
      if (isRoad(x, y + 1)) { face = 'y'; street = (y + 1) % 5 === 2 ? AL.streetRow(y + 1) : AL.streetCol(x); }
      else if (isRoad(x + 1, y)) { face = 'x'; street = (x + 1) % 5 === 2 ? AL.streetCol(x + 1) : AL.streetRow(y); }
      if (!face) continue;
      cand.push({ x, y, face, street, r: Math.hypot(x - W / 2, y - H / 2) });
    }
    cand.sort((a, b) => a.r - b.r);
    const picked = [];
    for (const c of cand) {
      if (picked.every(p => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) >= 7)) picked.push(c);
      if (picked.length >= 14) break;
    }
    picked.forEach(c => out.unshift({ id: `papan:${c.x},${c.y}`, kind: 'papan', x: c.x, y: c.y, face: c.face, label: `Papan reklame · ${c.street}` }));
    AL._slots = out;
    AL._slotById = new Map(out.map(s => [s.id, s]));
    return out;
  };
  AL.slotById = id => { AL.sponsorSlots(); return AL._slotById.get(id); };

  // ---------- 2. GAMBAR ----------
  const fitSize = (txt, width, max) => Math.min(max, width / Math.max(1, txt.length * 0.62));
  // papan reklame di petak (0..1); face 'y' = menghadap jalan di selatan, 'x' = jalan di timur
  AL.drawBillboard = function (p, sp, face) {
    const c1 = sp.c1, c2 = sp.c2, post = '#5b6370';
    p.shadow(0.4, 0.4, 0.2, 0.2, 1.2);
    if (face === 'y') {
      p.box(0.05, 0.5, 0.07, 0.07, 0, 0.62, post); p.box(0.88, 0.5, 0.07, 0.07, 0, 0.62, post);
      p.box(-0.3, 0.45, 1.6, 0.1, 0.6, 0.78, AL.shade(c1, 1.1));
      p.poly([[-0.26, 0.55, 0.64], [1.26, 0.55, 0.64], [1.26, 0.55, 1.34], [-0.26, 0.55, 1.34]], c1);
      const ns = fitSize(sp.name, 1.4, 0.3);
      p.textY(sp.name, -0.2, 0.55, 1.28, ns, c2);
      if (sp.tagline) p.textY(sp.tagline, -0.2, 0.55, 1.28 - ns - 0.06, fitSize(sp.tagline, 1.4, 0.13), c2);
    } else {
      p.box(0.5, 0.05, 0.07, 0.07, 0, 0.62, post); p.box(0.5, 0.88, 0.07, 0.07, 0, 0.62, post);
      p.box(0.45, -0.3, 0.1, 1.6, 0.6, 0.78, AL.shade(c1, 1.1));
      p.poly([[0.55, -0.26, 0.64], [0.55, 1.26, 0.64], [0.55, 1.26, 1.34], [0.55, -0.26, 1.34]], c1);
      const ns = fitSize(sp.name, 1.4, 0.3);
      p.textX(sp.name, 0.55, 1.2, 1.28, ns, c2);
      if (sp.tagline) p.textX(sp.tagline, 0.55, 1.2, 1.28 - ns - 0.06, fitSize(sp.tagline, 1.4, 0.13), c2);
    }
    // lampu sorot kecil di atas
    p.box(0.42, 0.42, 0.16, 0.16, 1.38, 0.05, '#2b2f3a');
    return 1.45;
  };
  // toko yang diambil alih merek: warna & papan nama merek
  AL.drawBrandShop = function (p, sp) {
    const x = 0.25, y = 0.35, w = 1.5, d = 1.2, h = 0.78;
    p.shadow(x, y, w, d, h);
    p.box(x, y, w, d, 0, h, AL.mix(sp.c1, '#ffffff', 0.55));
    const rng = AL.rng(7);
    p.winQuad([[x + 0.12, y + d, 0.08], [x + 0.85, y + d, 0.08], [x + 0.85, y + d, 0.48], [x + 0.12, y + d, 0.48]], 0.95, '#bfe0ee', rng);
    p.poly([[x + 1.0, y + d, 0], [x + 1.3, y + d, 0], [x + 1.3, y + d, 0.48], [x + 1.0, y + d, 0.48]], AL.shade(sp.c1, 0.7));
    const n = 8, sw = w / n;
    for (let i = 0; i < n; i++) p.poly([[x + i * sw, y + d, 0.62], [x + (i + 1) * sw, y + d, 0.62], [x + (i + 1) * sw, y + d + 0.28, 0.48], [x + i * sw, y + d + 0.28, 0.48]], i % 2 ? sp.c2 : sp.c1);
    p.box(x + 0.1, y + d - 0.06, w - 0.2, 0.06, h, 0.38, sp.c1);
    p.textY(sp.name, x + 0.16, y + d, h + 0.34, fitSize(sp.name, w - 0.3, 0.26), sp.c2);
    return h + 0.4;
  };
  // panel hologram melayang (ruang layar), sx,sy = titik pemancar di atap
  AL.drawHoloPanel = function (ctx, sp, sx, sy, z, t) {
    const bob = Math.sin(t * 1.6) * 4 * z, turn = 0.82 + 0.18 * Math.cos(t * 0.7);
    const w = 150 * z * turn, h = 52 * z, cx = sx, cy = sy - 70 * z + bob;
    ctx.save();
    // berkas cahaya
    const g = ctx.createLinearGradient(0, sy, 0, cy);
    g.addColorStop(0, sp.c1 + 'cc'); g.addColorStop(1, sp.c1 + '00');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(sx - 3 * z, sy); ctx.lineTo(sx + 3 * z, sy); ctx.lineTo(cx + w * 0.35, cy + h / 2); ctx.lineTo(cx - w * 0.35, cy + h / 2); ctx.closePath(); ctx.fill();
    // panel
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = sp.c1;
    ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 8 * z); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = sp.c2; ctx.lineWidth = Math.max(1, 1.5 * z);
    ctx.stroke();
    // garis pindai
    ctx.save(); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    const scan = ((t * 40 * z) % (h + 10 * z)) - 5 * z;
    ctx.fillRect(cx - w / 2, cy - h / 2 + scan, w, 3 * z);
    ctx.restore();
    ctx.fillStyle = sp.c2; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const ns = Math.min(20 * z, (w - 16 * z) / Math.max(1, sp.name.length * 0.62));
    ctx.font = `800 ${ns}px "Plus Jakarta Sans", system-ui, sans-serif`;
    ctx.fillText(sp.name, cx, cy - (sp.tagline ? 7 * z : 0));
    if (sp.tagline) {
      ctx.font = `600 ${Math.min(10 * z, (w - 16 * z) / Math.max(1, sp.tagline.length * 0.55))}px "Plus Jakarta Sans", system-ui, sans-serif`;
      ctx.fillText(sp.tagline, cx, cy + 12 * z);
    }
    ctx.restore();
  };

  // ---------- 3. DI PETA ----------
  const holos = []; // {sp, lot}
  let current = [], preview = null;
  const hash = sp => AL.hash32([sp.name, sp.tagline, sp.c1, sp.c2].join('|')).toString(36);

  // gambar objek sponsor lewat jalur sprite biasa
  const baseDraw = AL.drawObject;
  if (baseDraw) {
    AL.drawObject = function (p, o) {
      if (o.kind === 'papan') return AL.drawBillboard(p, o.sp, o.face);
      if (o.type === 'shop' && o.sponsor) return AL.drawBrandShop(p, o.sponsor);
      return baseDraw(p, o);
    };
  }

  function sanitize(s) {
    if (!s || typeof s !== 'object') return null;
    const name = String(s.name || '').slice(0, 24).trim();
    if (!name || !COLOR_RE.test(s.c1) || !COLOR_RE.test(s.c2) || !AL.slotById(String(s.slot))) return null;
    return { id: s.id, slot: String(s.slot), name, tagline: String(s.tagline || '').slice(0, 40), c1: s.c1, c2: s.c2, hasLink: !!s.hasLink };
  }

  AL.applySponsors = function (list) {
    // bersihkan pemasangan lama
    AL.removeObjs(o => o.kind === 'papan');
    AL.lots.forEach(l => { if (l.sponsor || l.holo) { l.sponsor = null; l.holo = null; l.id = 'lot' + l.i; } });
    holos.length = 0;
    current = list.map(sanitize).filter(Boolean);
    for (const sp of current) {
      const slot = AL.slotById(sp.slot);
      if (slot.kind === 'papan') AL.insertObj({ id: 'sp' + sp.id + '~' + hash(sp), kind: 'papan', x: slot.x, y: slot.y, face: slot.face, sp, hmax: 1.6 });
      else if (slot.kind === 'toko') { const l = AL.lots[slot.lot]; l.sponsor = sp; l.id = 'lot' + l.i + '~' + hash(sp); }
      else if (slot.kind === 'holo') { const l = AL.lots[slot.lot]; l.holo = sp; holos.push({ sp, lot: l }); }
    }
  };
  AL.drawHolos = function (ctx, toScreen, z, t, vw, vh) {
    for (const h of holos) {
      const [sx, sy] = toScreen(h.lot.x + 1, h.lot.y + 1, (h.lot.hTop || 3) + 0.1);
      if (sx < -200 || sx > vw + 200 || sy < -200 || sy > vh + 300) continue;
      AL.drawHoloPanel(ctx, h.sp, sx, sy, z, t);
    }
  };

  // kartu mitra (dipakai kartu kavling & tap papan)
  AL.sponsorBox = function (sp) {
    if (!sp) return '';
    const esc = AL.esc;
    return `<div class="sponsor-box" data-sp="${esc(sp.id)}">
      <p class="kicker">Mitra AUDIRA${sp.id === 'pv' ? ' · pratinjau' : ''}</p>
      <p class="brand">${esc(sp.name)}</p>
      ${sp.tagline ? `<p class="tag-line">${esc(sp.tagline)}</p>` : ''}
      ${sp.hasLink && sp.id !== 'pv' ? `<a class="btn" href="/api/sponsor/klik?id=${encodeURIComponent(sp.id)}" target="_blank" rel="noopener sponsored">Kunjungi</a>` : ''}
    </div>`;
  };
  // warna merek diset lewat CSSOM (CSP melarang atribut style)
  AL.bindSponsorBox = function (root) {
    root.querySelectorAll('.sponsor-box').forEach(el => {
      const sp = current.concat(preview ? [preview] : []).find(s => String(s.id) === el.dataset.sp);
      if (!sp) return;
      el.style.setProperty('--sp1', sp.c1);
      el.style.setProperty('--sp2', sp.c2);
      if (sp.id !== 'pv' && !AL.net.demo) {
        fetch('/api/sponsor/lihat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sp.id }) }).catch(() => {});
      }
    });
  };

  // ---------- 4. MUAT & MODE PRATINJAU ----------
  function readPreview() {
    const raw = new URLSearchParams(location.search).get('pratinjau');
    if (!raw) return null;
    try {
      const json = decodeURIComponent(escape(atob(raw.replace(/-/g, '+').replace(/_/g, '/'))));
      const sp = sanitize({ ...JSON.parse(json), id: 'pv' });
      return sp;
    } catch (e) { return null; }
  }
  AL.encodePreview = sp => btoa(unescape(encodeURIComponent(JSON.stringify({ slot: sp.slot, name: sp.name, tagline: sp.tagline, c1: sp.c1, c2: sp.c2 })))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  async function load() {
    let list = [];
    if (!AL.net.demo) {
      try {
        // ember 30 detik: perubahan dari admin muncul paling lambat ±1 menit
        const r = await fetch('/api/sponsor?b=' + Math.floor(Date.now() / 30000), { signal: AbortSignal.timeout(6000) });
        if (r.ok) list = (await r.json()).sponsors;
      } catch (e) { /* tanpa sponsor */ }
    }
    if (preview) list = list.filter(s => s.slot !== preview.slot).concat([preview]);
    AL.applySponsors(list);
  }
  AL.sponsorInit = function () {
    if (!document.getElementById('map')) return;
    preview = readPreview();
    load();
    setInterval(load, 5 * 60000);
    if (preview) {
      const slot = AL.slotById(preview.slot);
      const bar = document.getElementById('previewBar');
      if (bar) { bar.hidden = false; bar.querySelector('b').textContent = preview.name; }
      setTimeout(() => AL.flyTo(slot.x + (slot.kind === 'papan' ? 0.5 : 1), slot.y + (slot.kind === 'papan' ? 0.5 : 1), slot.kind === 'holo' ? 4 : 0, 1.8), 600);
    }
  };
  AL.sponsorAt = o => (o && o.kind === 'papan' ? o.sp : o && (o.sponsor || o.holo)) || null;
})(window.AL);
