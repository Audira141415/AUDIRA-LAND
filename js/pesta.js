/* AUDIRA LAND · gambar ruang pesta rumah per tema. Dipakai taman.js lewat AL.pesta saat ROOM.kind === 'pesta'. */
(function (AL) {
  'use strict';
  const THEMES = {
    santai: { wall: '#e9dcc6', rug: '#c9a46a', floor: ['#d9b48a', '#cfa97e'], bg: '#2f3b2e', sofa: '#c96f4a', lights: ['#ffd27a', '#ffb35c'], sign: '' },
    pesta: { wall: '#2b2f4a', rug: '#ff7a59', floor: ['#3b3550', '#352f49'], bg: '#151726', sofa: '#6c7bd9', lights: ['#ff5aa5', '#5ad1ff', '#ffe35a', '#7dff8a'], sign: 'PESTA AUDIRA' },
    karaoke: { wall: '#3d2b55', rug: '#e65c8a', floor: ['#cfa97e', '#c49f74'], bg: '#1d1628', sofa: '#e65c8a', lights: ['#ff7ad9', '#9b7bff', '#ffd166'], sign: 'KARAOKE' },
    ultah: { wall: '#fde8c8', rug: '#6c7bd9', floor: ['#e8c9a0', '#dfbf95'], bg: '#2c3a4a', sofa: '#4caf7a', lights: ['#ff7a59', '#ffd166', '#4caf7a', '#6c7bd9'], sign: 'SELAMAT ULANG TAHUN' },
  };
  const theme = () => (window.ROOM && window.ROOM.theme) || 'santai';
  const T = () => THEMES[theme()] || THEMES.santai;

  function balloon(ctx, x, y, r, col, t, ph) {
    const bob = Math.sin(t * 1.5 + ph) * r * 0.25;
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y + bob + r); ctx.quadraticCurveTo(x + r * 0.4, y + r * 2.6, x, y + r * 3.6); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(x, y + bob, r * 0.82, r, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.beginPath(); ctx.ellipse(x - r * 0.3, y + bob - r * 0.35, r * 0.2, r * 0.3, -0.4, 0, Math.PI * 2); ctx.fill();
  }

  AL.pesta = {
    THEMES,
    get bg() { return T().bg; },
    ground(add, x, y, ch) { const th = T(); add(ch === 'r' ? th.rug : th.floor[(x + y) % 2], x, y); },
    objects(MAP) {
      const out = [];
      for (let y = 0; y < MAP.h; y++) for (let x = 0; x < MAP.w; x++) {
        const ch = MAP.rows[y][x];
        if ('HhKMPT'.includes(ch)) {
          const back = ch === 'K' ? (MAP.rows[y - 1] && MAP.rows[y - 1][x] === 'H' ? 'y' : 'x') : null;
          out.push({ ch, x, y, key: x + y + 1, back, v: Math.floor(AL.ihash(x, y, 4) * 3) });
        }
      }
      const th = theme();
      if (th === 'karaoke') out.push({ ch: 'mic', x: 8, y: 2, key: 11.2 });
      if (th === 'pesta' || th === 'ultah') {
        out.push({ ch: 'balloons', x: 2, y: 3, key: 6 });
        out.push({ ch: 'balloons', x: 9, y: 9, key: 19.5 });
      }
      return out;
    },
    drawObj(o, p, ctx, t, z) {
      const th = T();
      if (o.ch === 'H') { p.box(0, 0, 1, 1, 0, 1.6, th.wall); return; }
      if (o.ch === 'h') { p.box(0, 0, 1, 1, 0, 0.22, AL.shade(th.wall, 0.92)); return; }
      if (o.ch === 'T') {
        p.cyl(0.5, 0.5, 0.22, 0, 0.3, '#b0603a');
        p.tree(0.5, 0.5, 0.75, o.v);
        return;
      }
      if (o.ch === 'P') {
        p.box(0.2, 0.2, 0.6, 0.6, 0, 1.0, '#23252e');
        const pulse = theme() === 'pesta' || theme() === 'karaoke' ? 1 + Math.max(0, Math.sin(t * 8)) * 0.15 : 1;
        for (const [zc, r] of [[0.7, 0.13], [0.35, 0.18]]) {
          const c = p.P(0.5, 0.8, zc);
          ctx.fillStyle = '#4a4d5a'; ctx.beginPath(); ctx.ellipse(c[0], c[1], r * 34 * z * pulse, r * 30 * z * pulse, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(c[0], c[1], r * 14 * z, r * 12 * z, 0, 0, 7); ctx.fill();
        }
        return;
      }
      if (o.ch === 'K') {
        const c = th.sofa;
        if (o.back === 'y') {
          p.box(0.04, 0.05, 0.92, 0.2, 0, 0.62, AL.shade(c, 0.85));
          p.box(0.04, 0.25, 0.92, 0.65, 0, 0.3, c);
        } else {
          p.box(0.05, 0.04, 0.2, 0.92, 0, 0.62, AL.shade(c, 0.85));
          p.box(0.25, 0.04, 0.65, 0.92, 0, 0.3, c);
        }
        return;
      }
      if (o.ch === 'M') {
        p.box(0.4, 0.4, 0.2, 0.2, 0, 0.42, '#8a5a3a');
        p.box(0, 0, 1, 1, 0.42, 0.06, '#fffaf0');
        const r = AL.rng(o.x * 31 + o.y);
        if (theme() === 'ultah' && o.x === 6 && o.y === 6) {
          p.cyl(0.4, 0.4, 0.3, 0.48, 0.18, '#f7d1dc');
          p.cyl(0.4, 0.4, 0.2, 0.66, 0.14, '#fff2f6');
          for (let k = 0; k < 4; k++) {
            const a = k / 4 * Math.PI * 2, q = p.P(0.4 + Math.cos(a) * 0.1, 0.4 + Math.sin(a) * 0.1, 0.84);
            ctx.fillStyle = '#6c7bd9'; ctx.fillRect(q[0] - 1, q[1] - 6 * z, 2, 6 * z);
            ctx.fillStyle = Math.sin(t * 12 + k) > 0 ? '#ffd166' : '#ff9a3c';
            ctx.beginPath(); ctx.ellipse(q[0], q[1] - 8 * z, 1.8 * z, 3 * z, 0, 0, 7); ctx.fill();
          }
        } else {
          for (let k = 0; k < 3; k++) {
            const cx = 0.2 + r() * 0.6, cy = 0.2 + r() * 0.6;
            p.cyl(cx, cy, 0.07, 0.48, 0.12, AL.pick(['#d9967c', '#5f9e98', '#d8b56a', '#ffffff'], r()));
          }
        }
        return;
      }
      if (o.ch === 'mic') {
        const a = p.P(0.5, 0.5, 0), b = p.P(0.5, 0.5, 1.05);
        ctx.strokeStyle = '#2b2f3a'; ctx.lineWidth = Math.max(1.5, 2.2 * z);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        ctx.fillStyle = '#9aa3ad'; ctx.beginPath(); ctx.arc(b[0], b[1], 4 * z, 0, 7); ctx.fill();
        return;
      }
      if (o.ch === 'balloons') {
        const q = p.P(0.5, 0.5, 1.4), cols = th.lights;
        for (let k = 0; k < 4; k++) balloon(ctx, q[0] + (k - 1.5) * 9 * z, q[1] - (k % 2) * 10 * z, 8 * z, cols[k % cols.length], t, k + o.x);
      }
    },
    floorFx(ctx, toScreen, z, t) {
      const th = theme();
      if (th !== 'pesta' && th !== 'karaoke') return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const cols = T().lights;
      const n = th === 'pesta' ? 6 : 2;
      for (let k = 0; k < n; k++) {
        const cx = th === 'pesta' ? 6 + Math.sin(t * 0.7 + k * 1.9) * 4 : 8.5, cy = th === 'pesta' ? 6 + Math.cos(t * 0.9 + k * 1.3) * 4 : 2.5;
        const [sx, sy] = toScreen(cx, cy);
        const r = (th === 'pesta' ? 60 : 90) * z;
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        g.addColorStop(0, cols[k % cols.length] + '66'); g.addColorStop(1, cols[k % cols.length] + '00');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.5, 0, 0, 7); ctx.fill();
      }
      ctx.restore();
    },
    overlay(ctx, toScreen, z, t) {
      const th = T();
      // tulisan di dinding belakang
      if (th.sign) {
        const p = new AL.Painter(ctx, z, ...toScreen(0, 0), false);
        const size = Math.min(0.36, 8.6 / (th.sign.length * 0.62));
        p.textY(th.sign, 2.2, 1, 1.52, size, theme() === 'ultah' ? '#e2453c' : '#fff3c4');
      }
      // lampu tali di atas dinding belakang
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const dots = [];
      for (let x = 1; x <= 11; x += 0.5) dots.push([x, 1, 1.62 - Math.abs(Math.sin(x * 1.3)) * 0.08]);
      for (let y = 1.5; y <= 11; y += 0.5) dots.push([1, y, 1.62 - Math.abs(Math.sin(y * 1.3)) * 0.08]);
      dots.forEach(([x, y, zz], i) => {
        const [sx, sy] = toScreen(x, y, zz);
        const on = 0.55 + 0.45 * Math.sin(t * 3 + i * 0.9);
        const col = th.lights[i % th.lights.length];
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 9 * z);
        g.addColorStop(0, col); g.addColorStop(1, col + '00');
        ctx.globalAlpha = on; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 9 * z, 0, 7); ctx.fill();
      });
      ctx.restore();
      // bola disko
      if (theme() === 'pesta') {
        const [sx, sy] = toScreen(6, 6, 3.1);
        ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx, sy - 60 * z); ctx.lineTo(sx, sy - 14 * z); ctx.stroke();
        const g = ctx.createRadialGradient(sx - 4 * z, sy - 4 * z, 1, sx, sy, 14 * z);
        g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#8a93a8');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 14 * z, 0, 7); ctx.fill();
        for (let k = 0; k < 6; k++) {
          const a = t * 2 + k;
          ctx.fillStyle = THEMES.pesta.lights[k % 4];
          ctx.fillRect(sx + Math.cos(a) * 9 * z - 1.5, sy + Math.sin(a * 1.3) * 9 * z - 1.5, 3, 3);
        }
      }
    },
  };
})(window.AL);
