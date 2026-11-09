/* AUDIRA LAND · flyover penyeberang sungai (menggantikan jembatan datar).
   Dek terangkat di atas sungai, tanjakan 2 petak di tiap ujung, pilar beton, pagar, tiang lampu,
   dan untaian LED yang berkelip berkejaran saat malam. Pejalan & kendaraan ikut naik (AL.groundZ). */
(function (AL) {
  'use strict';
  if (!AL.bridges || !AL.bridges.size) return;
  const DECK = 0.8, RAMP = 2, THICK = 0.16;
  AL.HMAX.fly = 2.0;

  // ---------- bentang per baris jalan ----------
  const spans = [];
  const rows = new Map();
  for (const i of AL.bridges) { const x = i % AL.W, y = (i / AL.W) | 0; (rows.get(y) || rows.set(y, []).get(y)).push(x); }
  for (const [y, xs] of rows) { xs.sort((a, b) => a - b); spans.push({ y, a: xs[0], b: xs[xs.length - 1] }); }
  AL.flyovers = spans;
  const byRow = new Map(spans.map(s => [s.y, s]));

  // tinggi dek di posisi x (koordinat petak, kontinu) untuk bentang s
  function zAt(s, u) {
    if (u < s.a) return DECK * AL.clamp((u - (s.a - RAMP)) / RAMP, 0, 1);
    if (u > s.b + 1) return DECK * AL.clamp((s.b + 1 + RAMP - u) / RAMP, 0, 1);
    return DECK;
  }
  // dipakai main.js: agen di atas flyover digambar setinggi dek
  AL.groundZ = function (fx, fy) {
    const s = byRow.get(Math.floor(fy));
    if (!s || fx < s.a - RAMP || fx > s.b + 1 + RAMP) return 0;
    return zAt(s, fx);
  };

  // ---------- objek per petak (y digeser −0,7 supaya dek tergambar sebelum kendaraan di atasnya) ----------
  const SH = 0.7;
  for (const s of spans) {
    for (let x = s.a - RAMP; x <= s.b + RAMP; x++) {
      AL.statics.push({ id: `fly:${s.y}:${x}`, kind: 'fly', x, y: s.y - SH, tx: x, s, water: x >= s.a && x <= s.b, first: x === s.a - RAMP, last: x === s.b + RAMP });
    }
  }

  function drawFly(p, o) {
    const y0 = SH + 0.02, y1 = SH + 0.98, z0 = zAt(o.s, o.tx), z1 = zAt(o.s, o.tx + 1);
    const concrete = '#c9c1b2', side = '#b3ab9c', asphalt = '#7d848d';
    // pilar beton di atas air
    if (o.water) {
      p.box(0.38, SH + 0.36, 0.24, 0.28, 0, DECK - THICK, '#bfb6a4');
      p.box(0.2, SH + 0.3, 0.6, 0.4, DECK - THICK - 0.1, 0.1, side);
    }
    // sisi dek (menghadap kiri-bawah) + pita warna
    if (z0 > 0.01 || z1 > 0.01) {
      const b0 = Math.max(0, z0 - THICK), b1 = Math.max(0, z1 - THICK);
      p.poly([[0, y1, b0], [1, y1, b1], [1, y1, z1], [0, y1, z0]], concrete);
      p.poly([[0, y1, z0 - 0.05], [1, y1, z1 - 0.05], [1, y1, z1 - 0.02], [0, y1, z0 - 0.02]], '#5f9e98');
      if (o.last) p.poly([[1, y0, 0], [1, y1, 0], [1, y1, z1], [1, y0, z1]], side);
    }
    // permukaan aspal + marka tengah putus-putus
    p.poly([[0, y0, z0], [1, y0, z1], [1, y1, z1], [0, y1, z0]], asphalt);
    const ym = (y0 + y1) / 2;
    p.poly([[0.2, ym - 0.015, z0 + (z1 - z0) * 0.2 + 0.003], [0.6, ym - 0.015, z0 + (z1 - z0) * 0.6 + 0.003], [0.6, ym + 0.015, z0 + (z1 - z0) * 0.6 + 0.003], [0.2, ym + 0.015, z0 + (z1 - z0) * 0.2 + 0.003]], '#e9e4da');
    // pagar dua sisi
    for (const yy of [y0 + 0.02, y1 - 0.02]) {
      const a = p.P(0, yy, z0 + 0.16), b = p.P(1, yy, z1 + 0.16);
      p.c.strokeStyle = p.col('#9aa3ad'); p.c.lineWidth = Math.max(1, 1.3 * p.s);
      p.c.beginPath(); p.c.moveTo(a[0], a[1]); p.c.lineTo(b[0], b[1]); p.c.stroke();
      for (const t of [0.25, 0.75]) p.box(t - 0.02, yy - 0.02, 0.04, 0.04, z0 + (z1 - z0) * t, 0.16, '#9aa3ad');
    }
    // tiang lampu (di petak air, sisi selatan)
    if (o.water) {
      const zt = DECK, a = p.P(0.5, y1 - 0.02, zt), b = p.P(0.5, y1 - 0.02, zt + 0.75);
      p.c.strokeStyle = p.col('#5d6670'); p.c.lineWidth = Math.max(1, 1.6 * p.s);
      p.c.beginPath(); p.c.moveTo(a[0], a[1]); p.c.lineTo(b[0], b[1]); p.c.stroke();
      p.box(0.44, y1 - 0.08, 0.12, 0.08, zt + 0.72, 0.05, p.n ? '#ffe9b0' : '#d8dde2');
    }
    return DECK + 0.8;
  }
  const baseDraw = AL.drawObject;
  AL.drawObject = function (p, o) { return o.kind === 'fly' ? drawFly(p, o) : baseDraw(p, o); };

  // ---------- malam: LED berkejaran di pagar + cahaya tiang lampu + pantulan di air ----------
  const LED = ['255,214,120', '120,210,230', '255,150,170', '170,240,170'];
  AL.drawFlyovers = function (ctx, toScr, z, t, vw, vh, night) {
    if (night < 0.1) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const s of spans) {
      const x0 = s.a - RAMP, x1 = s.b + 1 + RAMP;
      const [cx, cy] = toScr((x0 + x1) / 2, s.y + 0.5, DECK);
      if (cx < -400 || cx > vw + 400 || cy < -300 || cy > vh + 300) continue;
      // pantulan cahaya di air
      for (let x = s.a; x <= s.b; x++) {
        const [rx, ry] = toScr(x + 0.5, s.y + 1.6, 0);
        const g = ctx.createRadialGradient(rx, ry, 0, rx, ry, 26 * z);
        g.addColorStop(0, `rgba(255,214,140,${0.22 * night})`); g.addColorStop(1, 'rgba(255,214,140,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(rx, ry, 26 * z, 10 * z, 0, 0, 7); ctx.fill();
      }
      // LED di dua pagar, berkejaran warna-warni
      let i = 0;
      for (const yy of [s.y + 0.04, s.y + 0.96]) {
        for (let u = x0 + 0.1; u < x1; u += 0.2, i++) {
          const [lx, ly] = toScr(u, yy, zAt(s, u) + 0.17);
          const on = 0.5 + 0.5 * Math.sin(t * 5 - i * 0.55);
          const col = LED[Math.floor((i + t * 2) / 3) % LED.length];
          ctx.fillStyle = `rgba(${col},${(0.25 + 0.75 * on) * night})`;
          ctx.beginPath(); ctx.arc(lx, ly, Math.max(1, 1.6 * z), 0, 7); ctx.fill();
        }
      }
      // tiang lampu: kepala menyala & berdenyut pelan
      for (let x = s.a; x <= s.b; x++) {
        const [lx, ly] = toScr(x + 0.5, s.y + 0.96, DECK + 0.74);
        const R = 30 * z * (0.9 + 0.1 * Math.sin(t * 2 + x));
        const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, R);
        g.addColorStop(0, `rgba(255,230,170,${0.55 * night})`); g.addColorStop(1, 'rgba(255,230,170,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, R, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
  };
})(window.AL);
