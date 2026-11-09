/* AUDIRA LAND · kehidupan Kampung Nyiur: asap dapur, ayam berkeliaran, layangan anak-anak, pelita di pintu saat malam.
   Hanya tampilan, digambar tiap bingkai di atas peta (ayam ikut urutan kedalaman lewat AL.agents). */
(function (AL) {
  'use strict';
  let ready = false;
  const smokes = [], kites = [], lamps = [];
  const KITE = ['#d9967c', '#7d93a8', '#c9b07e', '#8fa9a2', '#c49b8f', '#a8a3c0'];

  function init() {
    ready = true;
    const gubuk = AL.lots.filter(l => l.type === 'gubuk' || l.type === 'warung');
    for (const l of gubuk) {
      const h = AL.ihash(l.x, l.y, 77);
      if (h < 0.42) smokes.push({ l, ph: h * 10 });
      lamps.push(l);
    }
    // layangan di atas sawah & kebun
    AL.lots.filter(l => l.district === 'kampung' && (l.type === 'field' || l.type === 'kebun'))
      .sort((a, b) => AL.ihash(a.x, a.y, 5) - AL.ihash(b.x, b.y, 5)).slice(0, 6)
      .forEach((l, i) => kites.push({ l, ax: l.x + 1, ay: l.y + 1, ph: i * 1.7, col: KITE[i % KITE.length], dx: 1.6 + (i % 3) * 0.7, dy: -1.2 - (i % 2) * 0.8, h: 5.5 + (i % 3) }));
    // ayam di halaman rumah bambu
    const LITE = AL.LITE;
    gubuk.filter(l => AL.ihash(l.x, l.y, 91) < (LITE ? 0.15 : 0.3)).forEach((l, i) => {
      for (let k = 0; k < 2; k++) {
        const a = { kind: 'ayam', l, ph: i * 2.3 + k * 1.1, white: (i + k) % 3 !== 0, x: l.x + 1, y: l.y + 1.7, draw: drawAyam };
        AL.agents.push(a);
      }
    });
  }

  // hiasan hidup hanya di kavling yang sudah berpenghuni/digarap (tanah kosong tetap sepi)
  const live = l => !AL.isBuilt || AL.isBuilt(l);

  function drawAyam(ctx, sx, sy, z, night, t) {
    if (z < 0.5 || !live(this.l)) return;
    const s = z * 0.8, peck = Math.sin(t * 3 + this.ph * 3) > 0.7;
    const body = this.white ? '#efe9de' : '#9a6a4a';
    const col = c => (night > 0 ? AL.mix(c, AL.NIGHT, night * 0.5) : c);
    const dir = Math.cos(t * 0.6 + this.ph) > 0 ? 1 : -1;
    ctx.fillStyle = 'rgba(20,40,60,.16)'; ctx.beginPath(); ctx.ellipse(sx + 0.3 * s, sy, 3.6 * s, 1.3 * s, 0, 0, 7); ctx.fill();
    // kaki melangkah bergantian (diam saat mematuk)
    const st = peck ? 0 : Math.sin(t * 11 + this.ph) * 0.7 * s;
    ctx.strokeStyle = col('#c9a35a'); ctx.lineWidth = Math.max(0.6, 0.5 * s);
    ctx.beginPath(); ctx.moveTo(sx - 0.8 * s + st * dir, sy - Math.max(0, st) * 0.4); ctx.lineTo(sx - 0.6 * s, sy - 1.6 * s);
    ctx.moveTo(sx + 0.8 * s - st * dir, sy - Math.max(0, -st) * 0.4); ctx.lineTo(sx + 0.6 * s, sy - 1.6 * s); ctx.stroke();
    ctx.fillStyle = col(body); ctx.beginPath(); ctx.ellipse(sx, sy - 3 * s, 3 * s, 2.1 * s, 0, 0, 7); ctx.fill();
    // sayap: bidang sedikit lebih gelap di sisi badan
    ctx.fillStyle = col(this.white ? '#d9d1c2' : '#7f5539'); ctx.beginPath(); ctx.ellipse(sx - dir * 0.4 * s, sy - 3.1 * s, 1.7 * s, 1.1 * s, -dir * 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = col(body);
    ctx.beginPath(); ctx.ellipse(sx - dir * 2.6 * s, sy - 4.2 * s, 1.1 * s, 1.6 * s, -dir * 0.6, 0, 7); ctx.fill(); // ekor
    const hx = sx + dir * 2.6 * s, hy = sy - (peck ? 2.4 : 5) * s;
    ctx.beginPath(); ctx.arc(hx, hy, 1.4 * s, 0, 7); ctx.fill();
    ctx.fillStyle = col('#c0645c'); ctx.beginPath(); ctx.arc(hx, hy - 1.3 * s, 0.7 * s, 0, 7); ctx.fill();
    ctx.fillStyle = col('#d1a85c'); ctx.beginPath(); ctx.moveTo(hx + dir * 1.2 * s, hy - 0.3 * s); ctx.lineTo(hx + dir * 2.3 * s, hy + 0.1 * s); ctx.lineTo(hx + dir * 1.2 * s, hy + 0.5 * s); ctx.fill();
  }

  AL.drawKampung = function (ctx, toScr, z, t, vw, vh, night) {
    if (!ready) init();
    const inView = (x, y, m) => x > -m && x < vw + m && y > -m && y < vh + m;
    // ayam: posisi berputar pelan di halaman depan
    for (const a of AL.agents) if (a.kind === 'ayam') {
      a.x = a.l.x + 1 + Math.sin(t * 0.35 + a.ph) * 0.75;
      a.y = a.l.y + 1.72 + Math.cos(t * 0.27 + a.ph) * 0.14;
    }
    // asap dapur
    for (const s of smokes) {
      if (!live(s.l)) continue;
      const [x0, y0] = toScr(s.l.x + 0.55, s.l.y + 0.55, (s.l.hTop || 1.4) - 0.15);
      if (!inView(x0, y0, 80)) continue;
      for (let k = 0; k < 4; k++) {
        const ph = (t * 0.22 + s.ph + k / 4) % 1;
        const r = (3 + ph * 7) * z;
        ctx.fillStyle = `rgba(236,232,224,${0.32 * (1 - ph) * (1 - night * 0.6)})`;
        ctx.beginPath(); ctx.arc(x0 + (Math.sin(ph * 3 + s.ph) * 6 + ph * 14) * z, y0 - ph * 46 * z, r, 0, 7); ctx.fill();
      }
    }
    // layangan (hanya siang sampai senja)
    if (night < 0.6) for (const k of kites) {
      if (!live(k.l)) continue;
      const sway = Math.sin(t * 0.8 + k.ph) * 0.35, bob = Math.sin(t * 1.3 + k.ph) * 0.25;
      const [gx, gy] = toScr(k.ax, k.ay, 0.4);
      const [kx, ky] = toScr(k.ax + k.dx + sway, k.ay + k.dy, k.h + bob);
      if (!inView(kx, ky, 120) && !inView(gx, gy, 120)) continue;
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.quadraticCurveTo((gx + kx) / 2 + 12 * z, (gy + ky) / 2 + 18 * z, kx, ky + 6 * z); ctx.stroke();
      const r = 7 * z, tilt = Math.sin(t * 1.1 + k.ph) * 0.25;
      ctx.save(); ctx.translate(kx, ky); ctx.rotate(tilt);
      const col = night > 0 ? AL.mix(k.col, AL.NIGHT, night * 0.55) : k.col;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(0, -r * 1.3); ctx.lineTo(r, 0); ctx.lineTo(0, r * 1.1); ctx.lineTo(-r, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(60,40,20,.5)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(0, -r * 1.3); ctx.lineTo(0, r * 1.1); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, 1.4 * z);
      ctx.beginPath(); ctx.moveTo(0, r * 1.1);
      for (let i = 1; i <= 6; i++) ctx.lineTo(Math.sin(t * 4 + i + k.ph) * 3 * z, r * 1.1 + i * 3.5 * z);
      ctx.stroke();
      ctx.restore();
    }
    // pelita di pintu saat senja-malam
    if (night > 0.15) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const R = 16 * z;
      for (const l of lamps) {
        if (!live(l)) continue;
        const [lx, ly] = toScr(l.x + 1.1, l.y + 1.35, 0.6);
        if (!inView(lx, ly, R)) continue;
        const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, R);
        g.addColorStop(0, `rgba(255,190,110,${0.5 * night})`); g.addColorStop(1, 'rgba(255,190,110,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, R, 0, 7); ctx.fill();
      }
      ctx.restore();
    }
  };
})(window.AL);
