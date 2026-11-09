/* AUDIRA LAND · Rumahku: ruang dalam rumah warga (canvas isometrik prosedural), perabot, ketuk pintu, stiker tamu.
   Semua gambar dibuat kode. Kampung Nyiur = bambu & anyaman, Kota Cakrawala = modern. */
(function (AL) {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = AL.esc;
  const TK = 'audira-taman-token', UK = 'audira-taman-user';
  let token = '', user = '';
  try { token = localStorage.getItem(TK) || ''; user = localStorage.getItem(UK) || ''; } catch (e) { /* abaikan */ }
  const fmt = n => Math.floor(n).toLocaleString('id-ID');
  const LITE = (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);

  const STIKER = {
    kembang: '🌺', kelapa: '🥥', ikan: '🐟', perahu: '⛵', nyiur: '🌴', bakso: '🍜',
    kopi: '☕', pesta: '🎉', hati: '💛', bulan: '🌙', bintang: '⭐', penyu: '🐢',
  };
  const ANIMATED = new Set(['kipas', 'akuarium', 'tv', 'radio-tua']);

  const host = (new URLSearchParams(location.search).get('u') || '').trim().replace(/^@+/, '').toLowerCase();
  let data = null, katalog = null, pilihStiker = '';

  async function api(path, body) {
    const r = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && token) { setLogin('', ''); render(); throw new Error(j.error || 'Sesi berakhir, masuk lagi.'); }
    if (!r.ok) throw Object.assign(new Error(j.error || 'Gagal (' + r.status + ')'), { status: r.status });
    return j;
  }
  function setLogin(t, u) {
    token = t; user = u;
    try { if (t) { localStorage.setItem(TK, t); localStorage.setItem(UK, u); } else { localStorage.removeItem(TK); localStorage.removeItem(UK); } } catch (e) { /* abaikan */ }
  }
  function say(el, text, kind) {
    el.hidden = !text; el.className = 'msg' + (kind ? ' ' + kind : ''); el.textContent = text || '';
  }

  // ================= RUANG ISOMETRIK =================
  const CW = 360, CH = 340, N = 6, WALLH = 5;
  const NIGHT = '#101838';
  let V = null;   // proyeksi aktif { ox, oy, tw, th }
  const mkView = (k, ox, oy) => ({ ox, oy, tw: 64 * k, th: 32 * k, k });
  const P = (x, y, z) => [V.ox + (x - y) * V.tw / 2, V.oy + (x + y) * V.th / 2 - (z || 0) * V.th];
  const ROOM_VIEW = () => mkView(0.82, CW / 2, 20 + WALLH * 32 * 0.82);

  function poly(c, pts, fill, stroke, lw) {
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
  }
  function line(c, a, b, col, lw) { c.strokeStyle = col; c.lineWidth = lw || 1; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
  function dot(c, p, r, col) { c.fillStyle = col; c.beginPath(); c.arc(p[0], p[1], r, 0, Math.PI * 2); c.fill(); }
  // balok: atas = warna, sisi +y (kiri bawah) lebih gelap sedikit, sisi +x (kanan bawah) paling gelap
  function box(c, x, y, z, dx, dy, dz, col, opt) {
    const o = opt || {};
    poly(c, [P(x, y + dy, z), P(x + dx, y + dy, z), P(x + dx, y + dy, z + dz), P(x, y + dy, z + dz)], o.left || AL.shade(col, 0.86));
    poly(c, [P(x + dx, y, z), P(x + dx, y + dy, z), P(x + dx, y + dy, z + dz), P(x + dx, y, z + dz)], o.right || AL.shade(col, 0.72));
    poly(c, [P(x, y, z + dz), P(x + dx, y, z + dz), P(x + dx, y + dy, z + dz), P(x, y + dy, z + dz)], o.top || col);
  }
  // titik di sisi balok: f = 'y' (sisi kiri bawah) atau 'x' (sisi kanan bawah), u,v 0..1
  const faceY = (x, y, z, dx, dy, dz) => (u, v) => P(x + u * dx, y + dy, z + v * dz);
  const faceX = (x, y, z, dx, dy, dz) => (u, v) => P(x + dx, y + u * dy, z + v * dz);
  const quad = (c, F, u0, v0, u1, v1, col) => poly(c, [F(u0, v0), F(u1, v0), F(u1, v1), F(u0, v1)], col);
  // bidang dinding: kiri = x=0 (u sepanjang y), kanan = y=0 (u sepanjang x)
  const WL = (u, v) => P(0.02, u, v), WR = (u, v) => P(u, 0.02, v);
  const wquad = (c, W, u0, v0, u1, v1, col, stroke) => poly(c, [W(u0, v0), W(u1, v0), W(u1, v1), W(u0, v1)], col, stroke);

  function nightFactor(d) {
    const h = d.getHours() + d.getMinutes() / 60;
    if (h >= 6.5 && h < 17.5) return 0;
    if (h >= 17.5 && h < 19) return (h - 17.5) / 1.5;
    if (h >= 19 || h < 4.5) return 1;
    return 1 - (h - 4.5) / 2;
  }

  // ---- gaya kawasan ----
  function themeFor(district, seed) {
    const r = AL.rng(seed);
    if (district === 'kampung') {
      return {
        kampung: true,
        floor: AL.pick(['#d9b77c', '#d4ae72', '#dcbd88'], r()), floorLine: '#b48c52',
        wallL: AL.pick(['#d8c08a', '#d2b67e', '#dcc697'], r()), wallR: null,
        pole: '#a87c40', poleDark: '#86602e', slab: '#9c7444',
      };
    }
    const paint = AL.pick(['#f1e6d6', '#e3ecea', '#efe0e3', '#e8e6f2', '#f3ead2', '#dfeadf'], r());
    return {
      kampung: false,
      floor: AL.pick(['#e3cfae', '#d9c4a2', '#e6d9c6'], r()), floorLine: '#c4ab86',
      wallL: AL.shade(paint, 0.95), wallR: paint, base: '#fbf7ef', slab: '#a99a86', accent: AL.pick(['#5f9e98', '#d9967c', '#7d86c4', '#d8b56a'], r()),
    };
  }

  function drawRoom(c, th, t, n) {
    const H = WALLH;
    // pelat lantai (sisi depan, gaya diorama)
    box(c, 0, 0, -0.4, N, N, 0.4, th.floor, { left: AL.shade(th.slab, 0.95), right: AL.shade(th.slab, 0.8) });
    poly(c, [P(0, 0), P(N, 0), P(N, N), P(0, N)], th.floor);
    if (th.kampung) {
      for (let x = 0.5; x < N; x += 0.5) line(c, P(x, 0), P(x, N), AL.mix(th.floor, th.floorLine, 0.6), 1);
    } else {
      for (let x = 1; x < N; x += 1) line(c, P(x, 0), P(x, N), th.floorLine, 1);
      for (let y = 0.5; y < N; y += 1) for (let x = 0; x < N; x += 1) line(c, P(x + ((y * 2) % 2 ? 0.5 : 0), y), P(x + ((y * 2) % 2 ? 0.5 : 0), y + 1), th.floorLine, 0.6);
      for (let y = 1; y < N; y += 1) line(c, P(0, y), P(N, y), AL.mix(th.floor, th.floorLine, 0.5), 0.6);
    }
    // dinding
    wquad(c, WL, 0, 0, N, H, th.wallL);
    wquad(c, WR, 0, 0, N, H, th.wallR || AL.shade(th.wallL, 1.06));
    if (th.kampung) {
      // anyaman bambu: kotak selang-seling
      const a = AL.shade(th.wallL, 0.9), b = AL.shade(th.wallL, 1.07);
      for (let u = 0; u < N; u += 0.5) for (let v = 0.4; v < H - 0.3; v += 0.5) {
        const odd = ((u * 2 + v * 2) | 0) % 2;
        wquad(c, WL, u + 0.04, v + 0.04, u + 0.46, v + 0.46, odd ? a : b);
        wquad(c, WR, u + 0.04, v + 0.04, u + 0.46, v + 0.46, odd ? AL.shade(b, 1.03) : AL.shade(a, 1.05));
      }
      // tiang & palang bambu
      for (const u of [0.06, 2.9, N - 0.12]) { wquad(c, WL, u, 0, u + 0.18, H, th.pole); wquad(c, WR, u, 0, u + 0.18, H, AL.shade(th.pole, 1.08)); }
      for (const v of [0.2, H - 0.2]) { wquad(c, WL, 0, v, N, v + 0.2, th.poleDark); wquad(c, WR, 0, v, N, v + 0.2, th.pole); }
    } else {
      // plint putih & garis aksen
      wquad(c, WL, 0, 0, N, 0.25, th.base); wquad(c, WR, 0, 0, N, 0.25, th.base);
      wquad(c, WL, 0, 3.9, N, 3.98, AL.mix(th.wallL, th.accent, 0.5));
      wquad(c, WR, 0, 3.9, N, 3.98, AL.mix(th.wallR, th.accent, 0.5));
      // stopkontak
      wquad(c, WR, 0.5, 0.6, 0.75, 0.9, '#ffffff', '#c9c0b2');
    }
    // sudut & tepi atas
    line(c, P(0, 0, 0), P(0, 0, H), 'rgba(40,30,20,.25)', 1.5);
    line(c, P(0, N, H), P(0, 0, H), th.kampung ? th.poleDark : '#cfc3b1', 3);
    line(c, P(0, 0, H), P(N, 0, H), th.kampung ? th.poleDark : '#cfc3b1', 3);
    drawWindow(c, th, t, n);
  }

  function drawWindow(c, th, t, n) {
    const u0 = 3.5, u1 = 5.3, v0 = 1.7, v1 = 3.5;
    const sky = n > 0.5 ? AL.mix('#e9a27a', '#1c2a4f', (n - 0.5) * 2) : AL.mix('#9fd6e6', '#e9a27a', n * 2);
    wquad(c, WR, u0, v0, u1, v1, sky);
    // pemandangan luar
    if (th.kampung) {
      const g = AL.mix('#3f7a52', '#14243a', n * 0.8);
      line(c, WR(u0 + 1.2, v0), WR(u0 + 1.15, v0 + 1.2), g, 2);
      for (const a of [-0.9, -0.3, 0.3, 0.9]) line(c, WR(u0 + 1.15, v0 + 1.2), WR(u0 + 1.15 + a * 0.45, v0 + 1.05 - Math.abs(a) * 0.15), g, 2);
      wquad(c, WR, u0, v0, u1, v0 + 0.35, AL.mix('#5fb3c9', '#16243d', n * 0.8));
    } else {
      const g = AL.mix('#7f93a8', '#1e2b45', n * 0.8);
      wquad(c, WR, u0 + 0.1, v0, u0 + 0.5, v0 + 1.1, g);
      wquad(c, WR, u0 + 0.6, v0, u0 + 0.95, v0 + 0.7, AL.shade(g, 1.1));
      wquad(c, WR, u0 + 1.1, v0, u0 + 1.6, v0 + 1.4, AL.shade(g, 0.92));
      if (n > 0.3) for (let k = 0; k < 6; k++) wquad(c, WR, u0 + 0.18 + (k % 3) * 0.5, v0 + 0.25 + Math.floor(k / 3) * 0.45, u0 + 0.28 + (k % 3) * 0.5, v0 + 0.37 + Math.floor(k / 3) * 0.45, 'rgba(255,213,126,' + (0.4 + 0.5 * n) + ')');
    }
    if (n > 0.5) {
      dot(c, WR(u1 - 0.4, v1 - 0.35), 4 * V.k, '#f4ecd0');
      dot(c, WR(u1 - 0.32, v1 - 0.3), 3.4 * V.k, sky);
      for (let k = 0; k < 4; k++) dot(c, WR(u0 + 0.2 + k * 0.33, v1 - 0.15 - (k % 2) * 0.3), 0.9, 'rgba(255,255,255,.8)');
    } else {
      const cx = u0 + ((t * 0.02) % 1.4);
      dot(c, WR(cx + 0.2, v1 - 0.4), 4 * V.k, 'rgba(255,255,255,.85)');
      dot(c, WR(cx + 0.4, v1 - 0.35), 5 * V.k, 'rgba(255,255,255,.85)');
    }
    // kusen
    const fr = th.kampung ? th.poleDark : '#fbf7ef';
    for (const [a, b] of [[[u0, v0], [u1, v0]], [[u0, v1], [u1, v1]], [[u0, v0], [u0, v1]], [[u1, v0], [u1, v1]], [[(u0 + u1) / 2, v0], [(u0 + u1) / 2, v1]]]) line(c, WR(a[0], a[1]), WR(b[0], b[1]), fr, 3);
    if (th.kampung) {
      // daun jendela kayu terbuka
      wquad(c, WR, u0 - 0.55, v0, u0 - 0.05, v1, '#9c6b3a'); wquad(c, WR, u1 + 0.05, v0, u1 + 0.55, v1, '#9c6b3a');
      for (let v = v0 + 0.2; v < v1; v += 0.3) { line(c, WR(u0 - 0.5, v), WR(u0 - 0.1, v), '#7a5028', 1); line(c, WR(u1 + 0.1, v), WR(u1 + 0.5, v), '#7a5028', 1); }
    } else {
      line(c, WR(u0 - 0.1, v1 + 0.08), WR(u1 + 0.1, v1 + 0.08), '#e9e1d2', 3);
    }
    line(c, WR(u0 - 0.15, v0 - 0.05), WR(u1 + 0.15, v0 - 0.05), th.kampung ? '#86602e' : '#efe7d8', 4);
  }

  // papan tamu di dinding kiri dekat depan, menampilkan 6 stiker terbaru
  function drawBoard(c, th, stiker) {
    const u0 = 3.9, u1 = 5.6, v0 = 1.45, v1 = 3.25;
    wquad(c, WL, u0 - 0.08, v0 - 0.1, u1 + 0.08, v1 + 0.1, th.kampung ? '#7a5028' : '#8a6440');
    wquad(c, WL, u0, v0, u1, v1, '#cfa274');
    for (let k = 0; k < 14; k++) { const r = AL.rng(k * 7 + 3); dot(c, WL(u0 + r() * (u1 - u0), v0 + r() * (v1 - v0)), 0.8, 'rgba(120,80,40,.35)'); }
    const list = (stiker || []).slice(0, 6);
    c.save();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    list.forEach((s, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const p = WL(u1 - 0.3 - col * 0.55, v1 - 0.45 - row * 0.85);
      c.setTransform(c._dpr, -0.5 * c._dpr, 0, c._dpr, p[0] * c._dpr, p[1] * c._dpr);
      c.font = Math.round(15 * V.k) + 'px sans-serif';
      c.fillText(s.e, 0, 0);
      c.fillStyle = ['#ff7a59', '#177a7a', '#ffd166'][i % 3];
      c.beginPath(); c.arc(0, -9 * V.k, 1.8, 0, Math.PI * 2); c.fill();
    });
    c.restore();
    c.setTransform(c._dpr, 0, 0, c._dpr, 0, 0);
    // papan nama kecil di atas
    const p = WL((u0 + u1) / 2, v1 + 0.35);
    c.save(); c.setTransform(c._dpr, -0.5 * c._dpr, 0, c._dpr, p[0] * c._dpr, p[1] * c._dpr);
    c.font = '800 ' + Math.round(8 * V.k) + 'px "Plus Jakarta Sans", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = th.kampung ? '#5a3a1e' : '#4a6275'; c.fillText('PAPAN TAMU', 0, 0);
    c.restore();
    c.setTransform(c._dpr, 0, 0, c._dpr, 0, 0);
  }

  // ---- perabot (posisi tetap per slot) ----
  const SLOT_AT = {
    'lantai-kiri': [0.85, 3, 0.5], 'lantai-kanan': [4.3, 0.65, 0.8], 'sudut': [0.6, 0.6, 1.6], 'tengah': [3.3, 3.3, 0],
    'dinding-kiri': [0.05, 2.6, 2.5], 'dinding-kanan': [2.2, 0.05, 2], 'langit': [2.6, 2.6, 4.2], 'depan': [5.4, 2.8, 0.8],
  };
  const DRAW = {
    kasur(c) {
      box(c, 0, 1.6, 0, 1.7, 2.8, 0.42, '#a8763f');
      box(c, 0.08, 1.68, 0.42, 1.54, 2.64, 0.3, '#f7f1e6');
      box(c, 0.18, 1.78, 0.72, 1.3, 0.55, 0.16, '#ffffff');
      box(c, 0.06, 2.6, 0.72, 1.6, 1.82, 0.06, '#d9967c');
      const F = faceY(0.06, 2.6, 0.72, 1.6, 1.82, 0.06);
      quad(c, (u, v) => P(0.06 + u * 1.6, 2.6 + v * 1.82, 0.785), 0, 0.3, 1, 0.4, '#f3d6c6');
      quad(c, (u, v) => P(0.06 + u * 1.6, 2.6 + v * 1.82, 0.785), 0, 0.6, 1, 0.7, '#f3d6c6');
      void F;
      box(c, 0, 1.45, 0, 1.7, 0.15, 1.1, '#8a5a2c');
    },
    sofa(c) {
      const col = '#5f9e98';
      box(c, 0.1, 1.8, 0, 1.3, 2.4, 0.5, col);
      box(c, 0, 1.8, 0, 0.4, 2.4, 1.25, AL.shade(col, 0.95));
      box(c, 0.1, 1.6, 0, 1.3, 0.3, 0.85, AL.shade(col, 0.92));
      box(c, 0.1, 4.2, 0, 1.3, 0.3, 0.85, AL.shade(col, 0.92));
      box(c, 0.45, 1.95, 0.5, 0.9, 1.05, 0.14, '#79b6af');
      box(c, 0.45, 3.05, 0.5, 0.9, 1.05, 0.14, '#79b6af');
      box(c, 0.42, 2.2, 0.64, 0.25, 0.5, 0.45, '#ffd166');
    },
    meja(c) {
      const w = '#a0693a';
      for (const [x, y] of [[3.5, 0.2], [5.0, 0.2], [3.5, 1.1], [5.0, 1.1]]) box(c, x, y, 0, 0.12, 0.12, 0.9, AL.shade(w, 0.85));
      box(c, 3.4, 0.1, 0.9, 1.85, 1.25, 0.14, w);
      box(c, 3.7, 0.5, 1.04, 0.22, 0.22, 0.25, '#fbf7ef');
      box(c, 4.4, 0.35, 1.04, 0.35, 0.35, 0.3, '#c46a4a');
      dot(c, P(4.57, 0.52, 1.6), 5 * V.k, '#6fae86');
    },
    akuarium(c, t) {
      box(c, 3.4, 0.1, 0, 1.9, 1.1, 0.8, '#5b4636');
      const x = 3.45, y = 0.15, z = 0.8, dx = 1.8, dy = 1.0, dz = 1.05;
      c.save(); c.globalAlpha = 0.85;
      box(c, x, y, z, dx, dy, dz, '#8fd3e0', { left: '#6cc0d2', right: '#57aec3', top: '#bfe9f0' });
      c.restore();
      box(c, x, y, z, dx, dy, 0.15, '#e8d6a8');
      const F = faceY(x, y, z, dx, dy, dz);
      for (let k = 0; k < 3; k++) {
        const u = 0.15 + 0.7 * (0.5 + 0.5 * Math.sin(t * (0.6 + k * 0.25) + k * 2)), v = 0.35 + k * 0.18;
        const p = F(u, v), dir = Math.cos(t * (0.6 + k * 0.25) + k * 2) > 0 ? 1 : -1;
        c.fillStyle = ['#ff7a59', '#ffd166', '#f2a2c0'][k];
        c.beginPath(); c.ellipse(p[0], p[1], 4 * V.k, 2.4 * V.k, 0, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.moveTo(p[0] - dir * 3.5 * V.k, p[1]); c.lineTo(p[0] - dir * 7 * V.k, p[1] - 2.5 * V.k); c.lineTo(p[0] - dir * 7 * V.k, p[1] + 2.5 * V.k); c.fill();
      }
      line(c, F(0.8, 0.15), F(0.8, 0.55), '#3f8a5a', 2); line(c, F(0.86, 0.15), F(0.9, 0.45), '#3f8a5a', 2);
      for (let k = 0; k < 3; k++) dot(c, F(0.25, ((t * 0.3 + k / 3) % 1) * 0.85 + 0.12), 1.2, 'rgba(255,255,255,.8)');
    },
    lemari(c) {
      const x = 0.05, y = 0.05, dx = 1.15, dy = 1.15, dz = 3.4, col = '#9c6b3a';
      box(c, x, y, 0, dx, dy, dz, col);
      const L = faceY(x, y, 0, dx, dy, dz), R = faceX(x, y, 0, dx, dy, dz);
      line(c, L(0.5, 0.05), L(0.5, 0.95), AL.shade(col, 0.6), 1.5);
      quad(c, L, 0.08, 0.1, 0.92, 0.9, 'rgba(255,255,255,.06)');
      dot(c, L(0.44, 0.5), 1.6, '#e8c77a'); dot(c, L(0.56, 0.5), 1.6, '#e8c77a');
      quad(c, R, 0.1, 0.05, 0.9, 0.2, AL.shade(col, 0.62));
      box(c, x + 0.1, y + 0.1, dz, 0.7, 0.6, 0.35, '#d9b56a');
    },
    'rak-buku'(c) {
      const x = 0.05, y = 0.05, dx = 0.9, dy = 1.25, dz = 3.2, col = '#8a5a2c';
      box(c, x, y, 0, dx, dy, dz, col);
      const L = faceY(x, y, 0, dx, dy, dz), R = faceX(x, y, 0, dx, dy, dz);
      quad(c, R, 0.06, 0.04, 0.94, 0.96, AL.shade(col, 0.5));
      const books = ['#d9967c', '#5f9e98', '#d8b56a', '#7d86c4', '#cf7f9b', '#6fae86', '#f3ead8'];
      for (let s = 0; s < 4; s++) {
        const v0 = 0.05 + s * 0.24;
        let u = 0.08, k = s * 3;
        while (u < 0.88) { const w = 0.07 + ((k * 37) % 5) * 0.012, h = 0.14 + ((k * 13) % 4) * 0.015; quad(c, R, u, v0, Math.min(0.92, u + w), v0 + h, books[k % books.length]); u += w + 0.01; k++; }
        quad(c, R, 0.04, v0 - 0.02, 0.96, v0, AL.shade(col, 0.85));
      }
      quad(c, L, 0, 0, 1, 1, AL.shade(col, 0.92));
    },
    karpet(c, t, th) {
      const x0 = 2, y0 = 2, s = 2.7, zz = 0.02;
      const Q = (a, b, a2, b2, col) => poly(c, [P(x0 + a, y0 + b, zz), P(x0 + a2, y0 + b, zz), P(x0 + a2, y0 + b2, zz), P(x0 + a, y0 + b2, zz)], col);
      Q(0, 0, s, s, '#a33f3a');
      Q(0.18, 0.18, s - 0.18, s - 0.18, '#f0dcb4');
      Q(0.3, 0.3, s - 0.3, s - 0.3, th && th.kampung ? '#c98b4a' : '#3d6e9e');
      const m = s / 2;
      poly(c, [P(x0 + m, y0 + 0.55, zz), P(x0 + s - 0.55, y0 + m, zz), P(x0 + m, y0 + s - 0.55, zz), P(x0 + 0.55, y0 + m, zz)], '#f0dcb4');
      poly(c, [P(x0 + m, y0 + 0.9, zz), P(x0 + s - 0.9, y0 + m, zz), P(x0 + m, y0 + s - 0.9, zz), P(x0 + 0.9, y0 + m, zz)], '#a33f3a');
      for (let k = 0.3; k < s; k += 0.3) { line(c, P(x0 + k, y0 + s, zz), P(x0 + k, y0 + s + 0.12, zz), '#e3c79a', 1); line(c, P(x0 + s, y0 + k, zz), P(x0 + s + 0.12, y0 + k, zz), '#e3c79a', 1); }
    },
    lukisan(c) {
      const u0 = 1.8, u1 = 3.4, v0 = 2.2, v1 = 3.4;
      wquad(c, WL, u0 - 0.1, v0 - 0.1, u1 + 0.1, v1 + 0.1, '#c9a24a');
      wquad(c, WL, u0, v0 + 0.6, u1, v1, '#9fd6e6');
      wquad(c, WL, u0, v0 + 0.3, u1, v0 + 0.6, '#3f8fb0');
      wquad(c, WL, u0, v0, u1, v0 + 0.3, '#ecd49b');
      dot(c, WL(u0 + 0.45, v1 - 0.3), 3.5 * V.k, '#ffb36b');
      line(c, WL(u1 - 0.45, v0 + 0.15), WL(u1 - 0.5, v0 + 0.85), '#5a3a1e', 1.5);
      for (const a of [-1, 0, 1]) line(c, WL(u1 - 0.5, v0 + 0.85), WL(u1 - 0.5 + a * 0.3, v0 + 0.7), '#3f7a52', 1.5);
    },
    'radio-tua'(c, t) {
      box(c, 0, 2.1, 1.85, 0.55, 1.1, 0.1, '#8a5a2c');
      box(c, 0, 2.2, 1.95, 0.48, 0.9, 0.62, '#b8742f');
      const R = faceX(0, 2.2, 1.95, 0.48, 0.9, 0.62);
      quad(c, R, 0.08, 0.15, 0.55, 0.85, '#e8d6a8');
      for (let k = 0; k < 4; k++) { const v = 0.25 + k * 0.17; line(c, R(0.1, v), R(0.53, v), '#a88b5a', 1); }
      dot(c, R(0.72, 0.62), 2.2 * V.k, '#5a3a1e'); dot(c, R(0.72, 0.3), 1.6 * V.k, '#5a3a1e');
      line(c, P(0.1, 2.35, 2.57), P(0.1, 2.25, 3.0), '#5a3a1e', 1.2);
      c.save(); c.font = Math.round(10 * V.k) + 'px sans-serif'; c.fillStyle = 'rgba(20,50,74,.7)';
      for (let k = 0; k < 2; k++) { const ph = (t * 0.4 + k * 0.5) % 1, p = P(0.4, 2.7 - ph * 0.5, 2.7 + ph * 1.1); c.globalAlpha = 1 - ph; c.fillText(k ? '♫' : '♪', p[0], p[1]); }
      c.restore();
    },
    tv(c, t) {
      const x = 1.2, y = 0, z = 1.6, dx = 1.9, dy = 0.12, dz = 1.15;
      box(c, x, y, z, dx, dy, dz, '#1c1f26');
      const F = faceY(x, y, z, dx, dy, dz);
      const h = (t * 0.15) % 1;
      const cols = ['#5fb3c9', '#ffd166', '#ff7a59', '#6fae86', '#7d86c4'];
      quad(c, F, 0.05, 0.08, 0.95, 0.92, cols[Math.floor(h * cols.length)]);
      quad(c, F, 0.05, 0.08, 0.95, 0.35, cols[(Math.floor(h * cols.length) + 2) % cols.length]);
      quad(c, F, 0.05 + ((t * 0.3) % 0.7), 0.35, 0.2 + ((t * 0.3) % 0.7), 0.6, 'rgba(255,255,255,.65)');
      quad(c, F, 0.05, 0.08, 0.95, 0.92, 'rgba(255,255,255,.08)');
      box(c, 1.3, 0.12, 0.2, 1.7, 0.6, 0.45, '#5b4636');
    },
    lampu(c, t, th, n) {
      const top = P(2.6, 2.6, WALLH), b = P(2.6, 2.6, 4.25);
      line(c, top, b, '#3a2b20', 1.2);
      const w = 13 * V.k, h = 9 * V.k;
      poly(c, [[b[0] - w * 0.45, b[1]], [b[0] + w * 0.45, b[1]], [b[0] + w, b[1] + h], [b[0] - w, b[1] + h]], th && th.kampung ? '#c99a5b' : '#ff7a59');
      c.fillStyle = 'rgba(0,0,0,.12)'; c.beginPath(); c.ellipse(b[0], b[1] + h, w, 2.4 * V.k, 0, 0, Math.PI * 2); c.fill();
      dot(c, [b[0], b[1] + h + 1.5 * V.k], 3 * V.k, n > 0.15 ? '#fff1bf' : '#f3ead8');
    },
    kipas(c, t) {
      const ctr = [2.6, 2.6], z = WALLH - 0.55;
      line(c, P(ctr[0], ctr[1], WALLH), P(ctr[0], ctr[1], z), '#4a4a52', 2);
      const a0 = t * 7;
      for (let k = 0; k < 3; k++) {
        const a = a0 + k * Math.PI * 2 / 3, e = 1.15, w = 0.18;
        const ca = Math.cos(a), sa = Math.sin(a), cp = Math.cos(a + w), sp = Math.sin(a + w), cm = Math.cos(a - w), sm = Math.sin(a - w);
        poly(c, [P(ctr[0], ctr[1], z), P(ctr[0] + cm * e, ctr[1] + sm * e, z), P(ctr[0] + ca * e * 1.05, ctr[1] + sa * e * 1.05, z), P(ctr[0] + cp * e, ctr[1] + sp * e, z)], '#8a6440');
      }
      dot(c, P(ctr[0], ctr[1], z), 4 * V.k, '#d8d2c4');
    },
    tanaman(c) {
      box(c, 5.05, 2.45, 0, 0.7, 0.7, 0.6, '#c46a4a');
      box(c, 5.05, 2.45, 0.6, 0.7, 0.7, 0.08, '#5b4636');
      const b = P(5.4, 2.8, 0.65), k = V.k;
      const leaves = [[-14, -26, 0.5], [12, -30, -0.4], [-4, -40, 0.1], [-20, -12, 0.9], [18, -14, -0.9], [2, -22, 0]];
      leaves.forEach(([dx, dy, rot], i) => {
        c.fillStyle = i % 2 ? '#3f7a52' : '#4f9566';
        c.beginPath(); c.ellipse(b[0] + dx * k, b[1] + dy * k, 9 * k, 5 * k, rot, 0, Math.PI * 2); c.fill();
        line(c, [b[0], b[1]], [b[0] + dx * k * 0.8, b[1] + dy * k * 0.8], '#2f5d3e', 1);
      });
    },
    'kursi-rotan'(c) {
      const col = '#c99a5b';
      for (const [x, y] of [[4.95, 2.4], [5.65, 2.4], [4.95, 3.1], [5.65, 3.1]]) box(c, x, y, 0, 0.1, 0.1, 0.7, AL.shade(col, 0.8));
      box(c, 5.6, 2.35, 0.7, 0.2, 0.9, 1.25, col);
      const R = faceY(5.6, 2.35, 0.7, 0.2, 0.9, 1.25), B = (u, v) => P(5.6, 2.35 + u * 0.9, 0.7 + v * 1.25);
      for (let k = 1; k < 6; k++) { line(c, B(k / 6, 0.05), B(k / 6, 0.95), AL.shade(col, 0.75), 1); line(c, B(0.05, k / 6), B(0.95, k / 6), AL.shade(col, 0.75), 1); }
      void R;
      box(c, 4.9, 2.35, 0.7, 0.9, 0.9, 0.14, col);
      box(c, 4.98, 2.43, 0.84, 0.7, 0.74, 0.1, '#d9967c');
    },
  };
  const ORDER = ['tengah', 'dinding-kiri', 'dinding-kanan', 'sudut', 'lantai-kanan', 'lantai-kiri', 'depan', 'langit'];

  // ---- gambar seluruh ruang ----
  const cv = $('room'), ctx = cv.getContext('2d');
  let theme = null, look = null, lastDraw = 0, raf = 0;
  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, LITE ? 1.5 : 2);
    cv.width = CW * dpr; cv.height = CH * dpr; ctx._dpr = dpr;
  }

  function drawScene(t) {
    const c = ctx, dpr = c._dpr, n = nightFactor(new Date());
    V = ROOM_VIEW();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, CW, CH);
    drawRoom(c, theme, t, n);
    drawBoard(c, theme, data.stiker);
    const pasang = data.pasang || {};
    for (const slot of ORDER) {
      if (slot === 'langit') {
        // pemilik berdiri di tengah sebelum lampu/kipas (yang tergantung di atas)
        continue;
      }
      const id = pasang[slot];
      if (id && DRAW[id]) DRAW[id](c, t, theme, n);
    }
    if (pasang.langit && DRAW[pasang.langit]) DRAW[pasang.langit](c, t, theme, n);
    // malam: ruang meredup, lampu memberi cahaya hangat
    if (n > 0) {
      const lit = pasang.langit === 'lampu' || pasang['lantai-kanan'] === 'akuarium' || pasang['dinding-kanan'] === 'tv';
      // redup hanya di atas gambar ruang (source-atop), bukan di area transparan sekeliling diorama
      c.save(); c.globalCompositeOperation = 'source-atop';
      c.fillStyle = 'rgba(16,24,56,' + (n * (lit ? 0.38 : 0.55)).toFixed(3) + ')';
      c.fillRect(0, 0, CW, CH);
      c.restore();
      c.save(); c.globalCompositeOperation = 'lighter';
      if (pasang.langit === 'lampu') {
        const b = P(2.6, 2.6, 4.25), f = P(2.9, 2.9, 0);
        c.fillStyle = 'rgba(255,200,110,' + (0.22 * n).toFixed(3) + ')';
        c.beginPath(); c.ellipse(f[0], f[1], 110 * V.k, 55 * V.k, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255,220,140,' + (0.5 * n).toFixed(3) + ')';
        c.beginPath(); c.arc(b[0], b[1] + 11 * V.k, 6 * V.k, 0, Math.PI * 2); c.fill();
      }
      if (pasang['dinding-kanan'] === 'tv') { const p = P(2.15, 0.6, 1.2); c.fillStyle = 'rgba(120,180,230,' + (0.16 * n).toFixed(3) + ')'; c.beginPath(); c.ellipse(p[0], p[1], 40 * V.k, 20 * V.k, 0, 0, Math.PI * 2); c.fill(); }
      if (pasang['lantai-kanan'] === 'akuarium') { const p = P(4.35, 0.65, 1.3); c.fillStyle = 'rgba(110,200,220,' + (0.18 * n).toFixed(3) + ')'; c.beginPath(); c.ellipse(p[0], p[1], 34 * V.k, 20 * V.k, 0, 0, Math.PI * 2); c.fill(); }
      // cahaya jendela (bulan / kota)
      c.fillStyle = 'rgba(160,180,255,' + (0.08 * n).toFixed(3) + ')';
      poly(c, [P(3.5, 0.1), P(5.3, 0.1), P(6, 1.6), P(4.2, 1.6)], c.fillStyle);
      c.restore();
    }
    // pemilik rumah (digambar setelah redup supaya tetap jelas)
    const foot = P(3.5, 4.1, 0);
    AL.drawWalker(c, foot[0], foot[1], 3.1, look, 0, n * 0.4);
    // papan nama
    const label = '@' + data.u;
    c.font = '800 12px "Plus Jakarta Sans", sans-serif';
    const w = c.measureText(label).width + 16, ty = foot[1] - 66;
    c.fillStyle = '#fffaf0'; c.beginPath(); c.roundRect(foot[0] - w / 2, ty - 11, w, 22, 11); c.fill();
    c.strokeStyle = '#ff7a59'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#14324a'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, foot[0], ty + 0.5);
    c.textAlign = 'start'; c.textBaseline = 'alphabetic';
  }

  function needsAnim() {
    const p = data && data.pasang || {};
    return Object.values(p).some(id => ANIMATED.has(id)) || (look && look.items && look.items.some(i => i.startsWith('aura')));
  }
  function loop(ts) {
    raf = 0;
    if (!data || !data.home || document.hidden) return;
    const gap = LITE ? 125 : 50;
    if (ts - lastDraw >= gap) { lastDraw = ts; drawScene(ts / 1000); }
    if (needsAnim()) raf = requestAnimationFrame(loop);
  }
  function redraw() {
    if (!data || !data.home) return;
    drawScene(performance.now() / 1000);
    if (!raf && needsAnim()) raf = requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) redraw(); });
  setInterval(() => { if (!raf) redraw(); }, 60000);   // siang/malam ikut jam

  // pratinjau perabot di katalog: sudut ruang mini
  function drawPreview(cnv, id, slot) {
    const S = 2, c = cnv.getContext('2d'), w = 120, h = 96;
    cnv.width = w * S; cnv.height = h * S; c._dpr = S;
    c.setTransform(S, 0, 0, S, 0, 0); c.clearRect(0, 0, w, h);
    const at = SLOT_AT[slot] || [3, 3, 0], k = 0.42;
    const save = V;
    V = mkView(k, 0, 0);
    const p = P(at[0], at[1], at[2]);
    V = mkView(k, w / 2 - (p[0]), h / 2 + 4 - (p[1]));
    const th = theme || themeFor('kota', 1);
    DRAW[id](c, 1.2, th, 0);
    V = save;
  }

  // ================= HALAMAN =================
  async function load() {
    if (!host) {
      if (user) { location.replace('/rumah.html?u=' + encodeURIComponent(user)); return; }
      showEmpty('Rumah siapa?', 'Buka rumah warga dari kartu warga atau kartu rumah di peta kota.');
      renderWho();
      return;
    }
    try {
      data = await api('/api/rumah?u=' + encodeURIComponent(host));
    } catch (e) {
      showEmpty(e.status === 404 ? 'Warga belum tiba' : 'Rumah tidak bisa dibuka', e.status === 404 ? `@${host} belum tiba di AUDIRA LAND. Mungkin masih di kapal!` : e.message);
      renderWho();
      return;
    }
    theme = data.home ? themeFor(data.home.district, AL.hash32(data.u)) : null;
    look = AL.mkLook(AL.hash32(data.u));
    look.items = AL.parseItems ? AL.parseItems(data.items) : [];
    katalog = null;
    if (data.aku && data.aku.pemilik && data.home) { try { katalog = await api('/api/rumah/katalog'); } catch (e) { katalog = null; } }
    render();
  }

  function showEmpty(title, text) {
    $('main').hidden = true;
    $('empty').hidden = false;
    $('emptyTitle').textContent = title;
    $('emptyText').textContent = text;
    document.title = 'Rumahku · AUDIRA LAND';
  }

  function renderWho() {
    $('who').innerHTML = token
      ? `<span>@${esc(user)}</span> <button type="button" class="link" id="out">Keluar</button>`
      : '<button type="button" class="btn sm" id="in">Masuk warga</button>';
    $('out')?.addEventListener('click', () => {
      const t = token; setLogin('', '');
      if (t) fetch('/api/sesi/hapus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t }) }).catch(() => {});
      load();
    });
    $('in')?.addEventListener('click', openLogin);
  }
  function openLogin() { $('loginMsg').hidden = true; $('loginSheet').showModal(); $('lu').focus(); }

  function render() {
    renderWho();
    if (!data) return;
    const d = data, h = d.home, aku = d.aku || null, own = !!(aku && aku.pemilik);
    $('empty').hidden = true; $('main').hidden = false;
    document.title = `Rumah @${d.u} · AUDIRA LAND`;
    $('kicker').textContent = h ? `${h.districtName} · ${h.label}` : 'Antre rusun';
    $('title').textContent = own ? 'Rumahku' : `Rumah @${d.u}`;
    $('addr').textContent = h ? `${h.name} · ${h.street} No. ${h.num}` : '';
    $('addr').hidden = !h;
    $('stats').innerHTML = h ? `<span class="pill rm-chip">🚪 Diketuk <b>${fmt(d.ketuk)}</b> kali</span><span class="pill rm-chip">🏷️ <b>${fmt(d.stiker.length)}</b> stiker</span>` : '';
    document.body.classList.toggle('rm-kampung', !!(h && h.district === 'kampung'));

    // belum punya rumah
    $('rusun').hidden = !!h;
    $('stage').hidden = !h;
    if (!h) {
      $('rusunText').textContent = own
        ? 'Semua rumah sedang penuh, jadi kamu masuk daftar antre rusun. Begitu kota membangun rumah baru, kamu dapat kunci dan bisa menata perabot di sini.'
        : `@${d.u} sudah jadi warga, tapi masih antre rusun. Mampir lagi nanti setelah @${d.u} dapat rumah, ya!`;
      $('atur').hidden = true; $('tamu').hidden = true; $('acts').innerHTML = '';
      return;
    }
    sizeCanvas();
    redraw();

    // tombol aksi
    let acts = '';
    if (!token) acts = '<button type="button" class="btn" data-act="login">Masuk warga untuk mengetuk pintu</button>';
    else if (own) acts = '<a class="btn ghost" href="#atur">Atur perabot</a><a class="btn ghost" href="#tamu">Lihat papan tamu</a>';
    else if (aku && !aku.warga) acts = '<p class="msg">Kamu belum tiba di kota, jadi belum bisa mengetuk atau menempel stiker.</p>';
    else acts = '<button type="button" class="btn" data-act="ketuk">🚪 Ketuk pintu</button><a class="btn ghost" href="#tamu">Tempel stiker</a>';
    $('acts').innerHTML = acts;
    say($('actMsg'), '');

    renderAtur(own);
    renderTamu(own, aku);
  }

  // ---- atur perabot (pemilik) ----
  function renderAtur(own) {
    $('atur').hidden = !own || !katalog;
    if (!own || !katalog) return;
    const k = katalog, punya = new Set(k.punya), pasang = data.pasang || {};
    $('saldo').innerHTML = `Saldo <b>${fmt(k.saldo)}</b> koin`;
    const bySlot = {};
    for (const [id, it] of Object.entries(k.items)) (bySlot[it.slot] ||= []).push([id, it]);
    $('katalog').innerHTML = Object.entries(k.slots).filter(([s]) => bySlot[s]).map(([slot, nama]) => `
      <section class="rm-slot">
        <h3>${esc(nama)}${pasang[slot] ? ` <button type="button" class="link" data-lepas="${esc(slot)}">Kosongkan</button>` : ''}</h3>
        <div class="rm-items">${bySlot[slot].map(([id, it]) => {
          const on = pasang[slot] === id, has = punya.has(id);
          return `<div class="rm-item${on ? ' on' : ''}">
            <canvas data-prev="${esc(id)}" data-slot="${esc(slot)}" aria-hidden="true"></canvas>
            <b>${esc(it.name)}</b>
            ${has ? '' : `<small>${fmt(it.price)} koin</small>`}
            ${on ? '<span class="rm-tag">Terpasang</span>'
              : has ? `<button type="button" class="btn sm" data-pasang="${esc(id)}" data-slot="${esc(slot)}">Pasang</button>`
              : `<button type="button" class="btn sm" data-beli="${esc(id)}"${k.saldo < it.price ? ' disabled' : ''}>Beli</button>`}
          </div>`;
        }).join('')}</div>
      </section>`).join('');
    $('katalog').querySelectorAll('canvas[data-prev]').forEach(cn => { if (DRAW[cn.dataset.prev]) drawPreview(cn, cn.dataset.prev, cn.dataset.slot); });
  }
  $('katalog').addEventListener('click', async e => {
    const bBeli = e.target.closest('[data-beli]'), bPasang = e.target.closest('[data-pasang]'), bLepas = e.target.closest('[data-lepas]');
    const msg = $('aturMsg');
    try {
      if (bBeli) {
        const it = katalog.items[bBeli.dataset.beli];
        if (!confirm(`Beli ${it.name} seharga ${fmt(it.price)} koin?`)) return;
        bBeli.disabled = true;
        const r = await api('/api/rumah/beli', { item: bBeli.dataset.beli });
        data.pasang = r.pasang; katalog.punya = r.punya; katalog.pasang = r.pasang; katalog.saldo = r.saldo;
        say(msg, `${it.name} sudah dipasang. Rumahmu makin nyaman!`, 'ok');
      } else if (bPasang) {
        const r = await api('/api/rumah/pasang', { slot: bPasang.dataset.slot, item: bPasang.dataset.pasang });
        data.pasang = r.pasang; katalog.pasang = r.pasang; say(msg, '');
      } else if (bLepas) {
        const r = await api('/api/rumah/pasang', { slot: bLepas.dataset.lepas, item: null });
        data.pasang = r.pasang; katalog.pasang = r.pasang; say(msg, '');
      } else return;
      renderAtur(true); redraw();
    } catch (er) { say(msg, er.message, 'err'); if (bBeli) bBeli.disabled = false; }
  });

  // ---- papan tamu ----
  function renderTamu(own, aku) {
    $('tamu').hidden = false;
    const bisa = token && aku && aku.warga && !own;
    $('stikerForm').hidden = !bisa;
    $('tamuLead').textContent = own
      ? 'Stiker dari tetangga yang mampir. Kamu bisa menghapus stiker di rumahmu.'
      : !token ? 'Masuk sebagai warga untuk menempel stiker. Satu stiker per hari untuk tiap rumah.'
      : bisa && aku.stikerHariIni ? 'Kamu sudah menempel stiker di sini hari ini. Datang lagi besok!'
      : 'Tempel satu stiker per hari. Pesan singkat boleh, maks 40 huruf.';
    if (bisa) {
      $('stikerPick').innerHTML = Object.entries(STIKER).map(([id, e]) => `<button type="button" role="radio" aria-checked="${id === pilihStiker}" data-s="${id}" aria-label="Stiker ${id}">${e}</button>`).join('');
      $('stikerForm').querySelectorAll('input, button').forEach(el => { el.disabled = !!aku.stikerHariIni; });
    }
    const list = data.stiker || [];
    $('stikerList').innerHTML = list.length ? list.map(s => `
      <li>
        <span class="rm-emo" aria-hidden="true">${esc(s.e)}</span>
        <div><a class="rm-guest" href="/rumah.html?u=${encodeURIComponent(s.guest)}">@${esc(s.guest)}</a>${s.msg ? `<p>${esc(s.msg)}</p>` : ''}<small>${esc(AL.fmtDur(Math.max(0, data.now - s.t)))} lalu</small></div>
        ${own ? `<button type="button" class="link" data-hapus="${s.id}">Hapus</button>` : ''}
      </li>`).join('') : '<li class="rm-none">Belum ada stiker. Jadilah tamu pertama!</li>';
  }
  $('stikerPick').addEventListener('click', e => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    pilihStiker = b.dataset.s;
    $('stikerPick').querySelectorAll('[data-s]').forEach(x => x.setAttribute('aria-checked', String(x.dataset.s === pilihStiker)));
  });
  $('stikerForm').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('stikerMsg');
    if (!pilihStiker) return say(msg, 'Pilih stikernya dulu.', 'err');
    const btn = $('stikerKirim'); btn.disabled = true;
    try {
      const r = await api('/api/rumah/stiker', { u: data.u, s: pilihStiker, msg: $('stikerPesan').value });
      data.stiker = [r.stiker, ...(data.stiker || [])].slice(0, 24);
      if (data.aku) data.aku.stikerHariIni = true;
      $('stikerPesan').value = ''; pilihStiker = '';
      render();
      say($('stikerMsg'), `Stiker ${r.stiker.e} tertempel. @${data.u} akan melihatnya di Koran.`, 'ok');
    } catch (er) { say(msg, er.message, 'err'); btn.disabled = false; }
  });
  $('stikerList').addEventListener('click', async e => {
    const b = e.target.closest('[data-hapus]'); if (!b) return;
    if (!confirm('Hapus stiker ini dari rumahmu?')) return;
    try {
      await api('/api/rumah/stiker/hapus', { id: +b.dataset.hapus });
      data.stiker = data.stiker.filter(s => s.id !== +b.dataset.hapus);
      render();
    } catch (er) { say($('stikerMsg'), er.message, 'err'); }
  });

  $('acts').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'login') return openLogin();
    if (b.dataset.act === 'ketuk') {
      b.disabled = true;
      try {
        const r = await api('/api/rumah/ketuk', { u: data.u });
        data.ketuk = r.ketuk;
        cv.classList.remove('knock'); void cv.offsetWidth; cv.classList.add('knock');
        const keep = $('actMsg');
        render();
        say(keep, r.baru ? `Tok tok! @${data.u} sudah diberi tahu lewat Koran.` : r.pesan, 'ok');
      } catch (er) { say($('actMsg'), er.message, 'err'); b.disabled = false; }
    }
  });

  // ---- masuk warga ----
  $('loginClose').addEventListener('click', () => $('loginSheet').close());
  $('lu').addEventListener('input', () => { $('lu').value = $('lu').value.replace(/^@+/, ''); });
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('loginMsg'); say(msg, 'Memeriksa…');
    try {
      const r = await fetch('/api/masuk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: $('lu').value, kode: $('lk').value }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Gagal masuk');
      setLogin(j.token, j.username); $('lk').value = '';
      $('loginSheet').close(); load();
    } catch (er) { say(msg, er.message, 'err'); }
  });

  window.addEventListener('resize', () => { if (data && data.home) { sizeCanvas(); redraw(); } });
  AL.rumah = { reload: load, get data() { return data; } };
  load();
})(window.AL);
