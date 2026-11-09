/* AUDIRA LAND · musim: suasana kota menurut tanggal WIB (semua perangkat sama).
   - Musim hujan (Nov–Mar): hujan ringan sesekali, jamnya ditentukan dari nomor jam WIB (deterministik).
   - Agustus: bendera merah putih kecil di atap rumah yang berdiri + umbul-umbul di jalan utama.
   - Akhir tahun (24 Des–1 Jan): kembang api malam di atas pusat Kota Cakrawala.
   - Ramadan: lampion di rumah saat malam. Lebaran: ketupat bergantung di rumah (+ lampion saat malam).
   Uji tampilan: tambahkan ?musim=hujan|agustus|tahunbaru|ramadan|lebaran ke alamat. */
(function (AL) {
  'use strict';
  const WIB = 7 * 3600e3;
  const RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const now = () => (AL.now ? AL.now() : Date.now());
  const ymd = t => new Date(t + WIB).toISOString().slice(0, 10);

  // Ramadan & Lebaran 2026–2028 (WIB). Rentang dibuat sedikit lebar supaya mencakup perbedaan awal bulan
  // pemerintah (isbat/MABIMS) dan Muhammadiyah (KHGT): dimulai malam tarawih pertama, ketupat ±5 hari.
  // Perkiraan dari ijtimak: 1 Ramadan 1447 ≈ 18/19 Feb 2026, 1 Syawal ≈ 20/21 Mar 2026;
  // 1 Ramadan 1448 ≈ 8 Feb 2027, 1 Syawal ≈ 9/10 Mar 2027; 1 Ramadan 1449 ≈ 27/28 Jan 2028, 1 Syawal ≈ 26/27 Feb 2028.
  const RAMADAN = [
    { r0: '2026-02-17', r1: '2026-03-19', l0: '2026-03-20', l1: '2026-03-24' },
    { r0: '2027-02-07', r1: '2027-03-09', l0: '2027-03-09', l1: '2027-03-13' },
    { r0: '2028-01-26', r1: '2028-02-26', l0: '2028-02-26', l1: '2028-03-01' },
  ];

  function aktif(t) {
    const force = new URLSearchParams(location.search).get('musim');
    const d = ymd(t), m = +d.slice(5, 7), day = +d.slice(8, 10);
    const s = {
      hujan: m >= 11 || m <= 3,
      agustus: m === 8,
      tahunbaru: (m === 12 && day >= 24) || (m === 1 && day === 1),
      ramadan: RAMADAN.some(r => d >= r.r0 && d <= r.r1),
      lebaran: RAMADAN.some(r => d >= r.l0 && d <= r.l1),
    };
    if (force && force in s) { for (const k in s) s[k] = false; s[force] = true; }
    s.paksa = !!force;
    return s;
  }
  const LABEL = { lebaran: 'Selamat Lebaran', ramadan: 'Bulan Ramadan', tahunbaru: 'Menyambut tahun baru', agustus: 'Bulan Kemerdekaan', hujan: 'Musim hujan' };

  let S = aktif(now());
  AL.musim = { get: () => S, label: () => { for (const k in LABEL) if (S[k]) return LABEL[k]; return ''; }, RAMADAN };
  setInterval(() => { S = aktif(now()); }, 60e3);

  // ---------- hujan: tiap jam WIB diundi sekali (sama di semua perangkat) ----------
  const HUJAN_P = 0.3;
  const jamHujan = h => AL.ihash(h, 3, 4471) < HUJAN_P;
  function hujanKuat(t) {
    if (!S.hujan) return 0;
    const h = Math.floor((t + WIB) / 3600e3), m = ((t + WIB) % 3600e3) / 60e3;
    if (!S.paksa && !jamHujan(h)) return 0;
    const k = 0.45 + AL.ihash(h, 9, 4471) * 0.55; // ringan .. sedang
    if (S.paksa) return k;
    // naik/turun perlahan 6 menit di tepi jam, kecuali jam tetangga juga hujan
    let f = 1;
    if (m < 6 && !jamHujan(h - 1)) f = m / 6;
    if (m > 54 && !jamHujan(h + 1)) f = Math.min(f, (60 - m) / 6);
    return k * f;
  }

  const N_HUJAN = AL.LITE ? 45 : 130;
  AL.screenFx.push((ctx, vw, vh, t) => {
    const k = hujanKuat(now());
    if (k <= 0.01) return;
    ctx.fillStyle = 'rgba(52,72,98,' + (0.13 * k).toFixed(3) + ')';
    ctx.fillRect(0, 0, vw, vh);
    if (RM) return; // gerak dikurangi: cukup langit mendung
    const n = Math.round(N_HUJAN * k), sp = 620, wind = 90, len = 13;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const r1 = AL.ihash(i, 1, 77), r2 = AL.ihash(i, 2, 77), v = 0.75 + r2 * 0.5;
      const H = vh + 40, W = vw + 60;
      const y = ((r2 * H + t * sp * v) % H) - 20;
      const x = ((r1 * W + t * wind * v) % W) - 30;
      ctx.moveTo(x, y); ctx.lineTo(x - len * 0.15 * v, y - len * v);
    }
    ctx.strokeStyle = 'rgba(214,232,245,' + (0.35 + 0.2 * k).toFixed(2) + ')';
    ctx.lineWidth = 1.1;
    ctx.stroke();
  });

  // ---------- bantu ----------
  const RUMAH = new Set(['house', 'villa', 'gubuk', 'rusun']);
  const built = l => (AL.isBuilt ? AL.isBuilt(l) : l.built);
  const inView = (x, y, vw, vh, m) => x > -m && y > -m && x < vw + m && y < vh + m;

  // ---------- Agustus: bendera & umbul-umbul ----------
  let poles = null; // titik umbul-umbul di jalan utama (baris y=32, kolom x=27 & x=82)
  function getPoles() {
    if (poles) return poles;
    poles = [];
    const ROAD = AL.T.ROAD;
    for (let x = 0; x < AL.W; x += 3) if (AL.tileAt(x, 32) === ROAD && !(AL.bridges && AL.bridges.has(AL.idx(x, 32)))) { poles.push([x + 0.5, 32.05]); poles.push([x + 0.5, 32.95]); }
    for (const cx of [27, 82]) for (let y = 0; y < AL.H; y += 3) if (AL.tileAt(cx, y) === ROAD && Math.abs(y - 32) > 1) { poles.push([cx + 0.05, y + 0.5]); poles.push([cx + 0.95, y + 0.5]); }
    return poles;
  }
  function flag(ctx, x, y, s, t, seed) {
    const ph = RM ? 0 : t * 5 + seed;
    ctx.strokeStyle = '#4a4036'; ctx.lineWidth = Math.max(1, 1.2 * s);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 16 * s); ctx.stroke();
    const w = 10 * s, h = 3.4 * s, top = y - 16 * s;
    const wv = k => Math.sin(ph + k * 2.4) * 1.3 * s * k;
    ctx.fillStyle = '#e0242c';
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + w, top + wv(1)); ctx.lineTo(x + w, top + h + wv(1)); ctx.lineTo(x, top + h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fbfbf6';
    ctx.beginPath(); ctx.moveTo(x, top + h); ctx.lineTo(x + w, top + h + wv(1)); ctx.lineTo(x + w, top + 2 * h + wv(1)); ctx.lineTo(x, top + 2 * h); ctx.closePath(); ctx.fill();
  }
  function umbul(ctx, x, y, s, t, seed) {
    const sway = RM ? 0 : Math.sin(t * 1.6 + seed) * 2.2 * s;
    const top = y - 34 * s;
    ctx.strokeStyle = '#8a6a3c'; ctx.lineWidth = Math.max(1, 1.4 * s);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 1 * s, y - 20 * s, x + 4 * s + sway, top); ctx.stroke();
    // kain panjang menjuntai: merah di atas, putih di bawah, ujung lancip
    const bx = x + 4 * s + sway, len = 22 * s, w = 4.2 * s;
    ctx.fillStyle = '#e0242c';
    ctx.beginPath(); ctx.moveTo(bx, top); ctx.lineTo(bx + w, top + 1 * s); ctx.lineTo(bx + w - sway * 0.2, top + len * 0.5); ctx.lineTo(bx - sway * 0.2, top + len * 0.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fbfbf6';
    ctx.beginPath(); ctx.moveTo(bx - sway * 0.2, top + len * 0.5); ctx.lineTo(bx + w - sway * 0.2, top + len * 0.5); ctx.lineTo(bx + w * 0.5 - sway * 0.5, top + len); ctx.closePath(); ctx.fill();
  }

  // ---------- Ramadan & Lebaran ----------
  function lampion(ctx, x, y, s, t, seed, glow) {
    const sw = RM ? 0 : Math.sin(t * 1.3 + seed) * 1.2 * s;
    const cx = x + sw, cy = y + 7 * s;
    ctx.strokeStyle = 'rgba(60,40,30,.8)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cx, cy - 3.6 * s); ctx.stroke();
    if (glow > 0) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 13 * s);
      g.addColorStop(0, 'rgba(255,190,90,' + (0.55 * glow).toFixed(2) + ')'); g.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 13 * s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = seed % 2 ? '#e8503a' : '#f29a2e';
    ctx.beginPath(); ctx.ellipse(cx, cy, 3.2 * s, 3.8 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5b2a1a';
    ctx.fillRect(cx - 1.8 * s, cy - 4.4 * s, 3.6 * s, 1.1 * s);
    ctx.fillRect(cx - 1.8 * s, cy + 3.4 * s, 3.6 * s, 1.1 * s);
  }
  function ketupat(ctx, x, y, s, t, seed) {
    const sw = RM ? 0 : Math.sin(t * 1.1 + seed) * 1 * s;
    const cx = x + sw, cy = y + 8 * s, r = 4 * s;
    ctx.strokeStyle = 'rgba(80,70,40,.8)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cx, cy - r); ctx.stroke();
    ctx.fillStyle = '#7fb24a';
    ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#4f7d2a'; ctx.lineWidth = Math.max(0.8, 0.8 * s);
    ctx.beginPath();
    ctx.moveTo(cx - r / 2, cy - r / 2); ctx.lineTo(cx + r / 2, cy + r / 2);
    ctx.moveTo(cx + r / 2, cy - r / 2); ctx.lineTo(cx - r / 2, cy + r / 2);
    ctx.stroke();
    // pita daun di bawah
    ctx.beginPath(); ctx.moveTo(cx, cy + r); ctx.lineTo(cx - 1.5 * s, cy + r + 4 * s); ctx.moveTo(cx, cy + r); ctx.lineTo(cx + 1.8 * s, cy + r + 3.5 * s); ctx.stroke();
  }

  // ---------- kembang api ----------
  const FW_COL = ['#ffd166', '#ff7a59', '#7fe3f0', '#c99bff', '#9cf28a', '#ffffff'];
  const FW_N = AL.LITE ? 14 : 26, FW_P = 2.6;
  function fireworks(ctx, toScr, z, t, vw, vh, night) {
    if (RM || night < 0.35) return;
    const c = AL.CENTER.kota;
    const [bx, by] = toScr(c.x, c.y, 9);
    const span = 260 * z;
    if (!inView(bx, by, vw, vh, span + 80 * z)) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let lane = 0; lane < 3; lane++) {
      const tt = t / FW_P + lane / 3, b = Math.floor(tt), age = tt - b;
      const r = AL.rng(AL.hash32('fw' + lane + ':' + b));
      const x = bx + (r() - 0.5) * span, y = by - r() * 90 * z, col = FW_COL[Math.floor(r() * FW_COL.length)];
      const R = (55 + r() * 45) * z;
      if (age < 0.28) { // roket naik
        const k = age / 0.28, ry = by + 170 * z - (by + 170 * z - y) * k;
        ctx.strokeStyle = 'rgba(255,230,180,.85)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x, ry); ctx.lineTo(x, ry + 14 * z); ctx.stroke();
        continue;
      }
      const k = (age - 0.28) / 0.72, e = 1 - Math.pow(1 - k, 3), a = (1 - k) * night;
      ctx.fillStyle = col; ctx.globalAlpha = a;
      for (let i = 0; i < FW_N; i++) {
        const ang = (i / FW_N) * Math.PI * 2 + r() * 0.2;
        const px = x + Math.cos(ang) * R * e, py = y + Math.sin(ang) * R * e * 0.85 + k * k * 30 * z;
        ctx.beginPath(); ctx.arc(px, py, Math.max(1, 2 * z) * (1.2 - k * 0.6), 0, Math.PI * 2); ctx.fill();
      }
      if (k < 0.25) { // kilat pusat
        ctx.globalAlpha = (0.25 - k) * 2 * night;
        const g = ctx.createRadialGradient(x, y, 0, x, y, R * 0.8);
        g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * 0.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ---------- overlay utama (hanya kavling/titik yang terlihat di layar) ----------
  AL.overlays.push((ctx, toScr, z, t, vw, vh, night) => {
    if (S.tahunbaru) fireworks(ctx, toScr, z, t, vw, vh, night);
    const deco = S.agustus || S.lebaran || (S.ramadan && night > 0.25);
    if (!deco || z < 0.32) return; // terlalu jauh: hiasan tidak terbaca
    const s = AL.clamp(z, 0.45, 1.8);
    const m = 40 * s;
    if (S.agustus) {
      for (const [px, py] of getPoles()) {
        const [x, y] = toScr(px, py, 0);
        if (inView(x, y, vw, vh, m)) umbul(ctx, x, y, s, t, px * 7 + py);
      }
    }
    for (const l of AL.lots) {
      if (!RUMAH.has(l.type) || !built(l)) continue;
      const hTop = l.hTop || 1.2;
      const [x, y] = toScr(l.x + 1, l.y + 1, hTop);
      if (!inView(x, y, vw, vh, m)) continue;
      if (S.agustus) flag(ctx, x + 2 * s, y + 2 * s, s, t, l.i);
      if (S.lebaran || S.ramadan) {
        // gantungan di serambi depan (sudut bawah kavling, setengah tinggi atap)
        const [hx, hy] = toScr(l.x + 1.9, l.y + 1.35, Math.min(hTop, 1.4) * 0.7);
        if (S.lebaran) ketupat(ctx, hx, hy, s, t, l.i);
        if (night > 0.25) lampion(ctx, S.lebaran ? hx - 9 * s : hx, hy, s, t, l.i, night);
      }
    }
  });
})(window.AL);
