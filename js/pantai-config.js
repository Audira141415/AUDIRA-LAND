/* AUDIRA LAND · Pantai Nyiur: room realtime di mesin Taman (js/taman.js).
   Mengisi window.ROOM sebelum taman.js jalan, dan AL.pantai = penggambar petak & benda pantai.
   Muat setelah js/render.js dan sebelum js/taman.js. */
(function (AL) {
  'use strict';
  window.ROOM = { room: 'pantai', map: 'js/pantai-map.json', kind: 'pantai' };

  const SAND = ['#f0dcae', '#ebd5a4'];
  const COL = {
    W: ['#4fa3c0', '#4b9eba'],   // laut dalam
    a: ['#7fcbd8', '#79c4d2'],   // air dangkal
    d: ['#d8bf8e', '#d2b886'],   // pasir basah
    '=': ['#b88a5a', '#ab7f51'], // jalan papan
    b: ['#9cc27a', '#94ba72'],   // tanah berumput di bawah semak
  };
  const UMB = [['#ff7a59', '#fffaf0'], ['#2f9e9a', '#ffd166'], ['#6c7bd9', '#fffaf0']];
  let shore = [];   // per kolom x: y petak pertama yang bukan air (untuk buih ombak)
  let sparks = [];  // kilau air

  function flame(ctx, x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.quadraticCurveTo(x + w, y - h * 0.35, x, y);
    ctx.quadraticCurveTo(x - w, y - h * 0.35, x, y - h);
    ctx.fill();
  }

  AL.pantai = {
    outdoor: true,
    bgAt(night) { return AL.mix('#4fa3c0', '#16243d', night * 0.75); },
    ground(add, x, y, ch, ripples) {
      const pal = COL[ch] || SAND;
      add(pal[(x + y) % 2], x, y);
      // riak pasir tipis
      if (ripples && (ch === '.' || ch === 'c') && AL.ihash(x, y, 5) < 0.45) {
        const a = AL.toWorld(x + 0.2, y + 0.55), b = AL.toWorld(x + 0.7, y + 0.35);
        ripples.moveTo(a.x, a.y); ripples.quadraticCurveTo((a.x + b.x) / 2, a.y - 3, b.x, b.y);
      }
    },
    objects(MAP) {
      const out = [];
      shore = [];
      for (let x = 0; x < MAP.w; x++) {
        let sy = -1;
        for (let y = 1; y < MAP.h; y++) { const ch = MAP.rows[y][x]; if (ch !== 'W' && ch !== 'a') { sy = y; break; } }
        shore.push(MAP.rows[sy - 1] && 'Wa'.includes(MAP.rows[sy - 1][x]) ? sy : -1);
      }
      sparks = [];
      for (let k = 0; k < 26; k++) sparks.push([AL.ihash(k, 3, 7) * MAP.w, AL.ihash(k, 9, 7) * 3.6, AL.ihash(k, 1, 8) * 6.28]);
      for (let y = 0; y < MAP.h; y++) for (let x = 0; x < MAP.w; x++) {
        const ch = MAP.rows[y][x];
        const v = Math.floor(AL.ihash(x, y, 4) * 3);
        if (ch === 'J') { if (MAP.rows[y][x - 1] !== 'J') out.push({ ch, x, y, key: x + y + 2.5 }); continue; }
        if (ch === 'L') {
          const along = MAP.rows[y][x - 1] === 'F' || MAP.rows[y][x + 1] === 'F' ? 'y' : 'x';
          out.push({ ch, x, y, key: x + y + 1, along });
          continue;
        }
        if ('PUFSbrc'.includes(ch)) out.push({ ch, x, y, key: x + y + 1, v });
      }
      out.push({ ch: 'boat', x: 4, y: 1, key: 0.5 }); // jukung terapung di laut
      return out;
    },
    drawObj(o, p, ctx, t, z, night) {
      night = night || 0;
      const ch = o.ch;
      if (ch === 'P') { p.palm(0.5, 0.5, 1.35, o.v % 2); return; }
      if (ch === 'b') {
        const b = p.P(0.5, 0.5, 0);
        ctx.strokeStyle = p.col(o.v === 1 ? '#4f8f45' : '#5d9e4c'); ctx.lineWidth = Math.max(1, 2.2 * z); ctx.lineCap = 'round';
        for (let k = 0; k < 7; k++) {
          const a = -Math.PI / 2 + (k - 3) * 0.33 + Math.sin(t * 1.2 + o.x + k) * 0.03;
          const L = (14 + (k % 3) * 4) * z;
          ctx.beginPath(); ctx.moveTo(b[0], b[1]);
          ctx.quadraticCurveTo(b[0] + Math.cos(a) * L * 0.5, b[1] + Math.sin(a) * L * 0.9, b[0] + Math.cos(a) * L, b[1] + Math.sin(a) * L * 0.75);
          ctx.stroke();
        }
        return;
      }
      if (ch === 'r') {
        const r = AL.rng(o.x * 17 + o.y * 3);
        for (let k = 0; k < 2; k++) {
          const q = p.P(0.3 + r() * 0.4, 0.3 + r() * 0.4, 0), rr = (7 + r() * 6) * z;
          ctx.fillStyle = p.col('#8d949a'); ctx.beginPath(); ctx.ellipse(q[0], q[1] - rr * 0.4, rr, rr * 0.7, 0, 0, 7); ctx.fill();
          ctx.fillStyle = p.col('#a9b0b5'); ctx.beginPath(); ctx.ellipse(q[0] - rr * 0.25, q[1] - rr * 0.65, rr * 0.55, rr * 0.35, 0, 0, 7); ctx.fill();
        }
        return;
      }
      if (ch === 'c') {
        const cols = ['#f3ece2', '#e9b8a8', '#f2d49b'];
        for (let k = 0; k < 3; k++) {
          const q = p.P(0.2 + AL.ihash(o.x + k, o.y, 2) * 0.6, 0.2 + AL.ihash(o.x, o.y + k, 3) * 0.6, 0);
          ctx.fillStyle = p.col(cols[k]);
          ctx.beginPath(); ctx.arc(q[0], q[1], 2.6 * z, Math.PI, 0); ctx.lineTo(q[0], q[1] + 1.2 * z); ctx.closePath(); ctx.fill();
        }
        return;
      }
      if (ch === 'U') {
        const [c1, c2] = UMB[o.v % 3];
        // tikar bergaris
        for (let k = 0; k < 4; k++) p.poly([[0.12 + k * 0.19, 0.18, 0], [0.31 + k * 0.19, 0.18, 0], [0.31 + k * 0.19, 0.88, 0], [0.12 + k * 0.19, 0.88, 0]], k % 2 ? '#fffaf0' : c1);
        // bayangan payung
        const sh = p.P(0.62, 0.62, 0);
        ctx.fillStyle = 'rgba(25,45,70,.16)'; ctx.beginPath(); ctx.ellipse(sh[0], sh[1], 26 * z, 12 * z, 0, 0, 7); ctx.fill();
        const a = p.P(0.3, 0.3, 0), top = p.P(0.3, 0.3, 1.55);
        ctx.strokeStyle = p.col('#e9e2d0'); ctx.lineWidth = Math.max(1.2, 1.8 * z);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(top[0], top[1]); ctx.stroke();
        const N = 8, rim = [];
        for (let k = 0; k < N; k++) {
          const an = k / N * Math.PI * 2 + 0.2;
          rim.push(p.P(0.3 + Math.cos(an) * 0.62, 0.3 + Math.sin(an) * 0.62, 1.2));
        }
        const segs = [];
        for (let k = 0; k < N; k++) segs.push({ k, y: (rim[k][1] + rim[(k + 1) % N][1]) / 2 });
        segs.sort((u, w) => u.y - w.y);
        for (const s of segs) {
          const r0 = rim[s.k], r1 = rim[(s.k + 1) % N];
          ctx.fillStyle = p.col(s.k % 2 ? c2 : c1);
          ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(r0[0], r0[1]); ctx.lineTo(r1[0], r1[1]); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = p.col('#fffaf0'); ctx.beginPath(); ctx.arc(top[0], top[1], 1.8 * z, 0, 7); ctx.fill();
        return;
      }
      if (ch === 'J' || ch === 'boat') return this.jukung(p, ctx, z, ch === 'boat' ? Math.sin(t * 1.4) * 0.06 : 0, ch === 'boat');
      if (ch === 'L') {
        if (o.along === 'x') p.box(0.08, 0.36, 0.84, 0.28, 0, 0.24, '#8a5a3a', { top: '#a8744c' });
        else p.box(0.36, 0.08, 0.28, 0.84, 0, 0.24, '#8a5a3a', { top: '#a8744c' });
        return;
      }
      if (ch === 'F') {
        // batu melingkar
        for (let k = 0; k < 9; k++) {
          const an = k / 9 * Math.PI * 2, q = p.P(0.5 + Math.cos(an) * 0.36, 0.5 + Math.sin(an) * 0.36, 0);
          ctx.fillStyle = p.col(k % 2 ? '#8d949a' : '#9fa6ab'); ctx.beginPath(); ctx.ellipse(q[0], q[1] - 1.5 * z, 4.2 * z, 3 * z, 0, 0, 7); ctx.fill();
        }
        // kayu bakar bersilang
        const c = p.P(0.5, 0.5, 0.05);
        ctx.strokeStyle = p.col('#6b4a2a'); ctx.lineWidth = 3.4 * z; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(c[0] - 11 * z, c[1] + 2 * z); ctx.lineTo(c[0] + 11 * z, c[1] - 3 * z); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(c[0] - 10 * z, c[1] - 3 * z); ctx.lineTo(c[0] + 10 * z, c[1] + 3 * z); ctx.stroke();
        const fire = AL.clamp((night - 0.08) / 0.35, 0, 1); // menyala mulai senja
        if (fire > 0) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          const fl = 1 + Math.sin(t * 11) * 0.06 + Math.sin(t * 17.3) * 0.04;
          const R = 120 * z * fire * fl;
          const g = ctx.createRadialGradient(c[0], c[1] - 8 * z, 0, c[0], c[1] - 8 * z, R);
          g.addColorStop(0, `rgba(255,170,80,${0.55 * fire})`); g.addColorStop(1, 'rgba(255,140,60,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(c[0], c[1] - 8 * z, R, R * 0.7, 0, 0, 7); ctx.fill();
          ctx.restore();
          ctx.globalAlpha = fire;
          const h = 22 * z * fl;
          flame(ctx, c[0], c[1], 9 * z, h, '#ff7a2e');
          flame(ctx, c[0] - 3 * z + Math.sin(t * 9) * z, c[1], 6 * z, h * 0.8, '#ffb23e');
          flame(ctx, c[0] + 2 * z, c[1], 4 * z, h * 0.55 + Math.sin(t * 13) * 2 * z, '#ffe27a');
          // percikan bara
          ctx.fillStyle = '#ffd27a';
          for (let k = 0; k < 5; k++) {
            const ph = (t * 0.7 + k / 5) % 1;
            ctx.globalAlpha = fire * (1 - ph);
            ctx.fillRect(c[0] + Math.sin(k * 2.3 + t * 2) * 6 * z * ph, c[1] - h - ph * 30 * z, 1.6 * z, 1.6 * z);
          }
          ctx.globalAlpha = 1;
        } else {
          // siang: asap tipis dari bara
          for (let k = 0; k < 3; k++) {
            const ph = (t * 0.25 + k / 3) % 1;
            ctx.fillStyle = `rgba(230,230,230,${0.35 * (1 - ph)})`;
            ctx.beginPath(); ctx.arc(c[0] + Math.sin(ph * 5 + k) * 4 * z, c[1] - 6 * z - ph * 34 * z, (2 + ph * 5) * z, 0, 7); ctx.fill();
          }
        }
        return;
      }
      if (ch === 'S') {
        p.box(0.12, 0.45, 0.07, 0.07, 0, 0.45, '#6b4a33'); p.box(0.82, 0.45, 0.07, 0.07, 0, 0.45, '#6b4a33');
        p.box(0.02, 0.42, 0.96, 0.08, 0.42, 0.44, '#14324a');
        p.textY('PANTAI NYIUR', 0.1, 0.5, 0.79, 0.11, '#fffaf0');
        p.textY('AUDIRA', 0.14, 0.5, 0.6, 0.17, '#ffd166');
      }
    },
    // perahu jukung bercadik, membujur 3 petak di sumbu x
    jukung(p, ctx, z, bob, floating) {
      const zz = (v) => v + bob;
      // cadik (pelampung bambu) kiri & kanan
      ctx.strokeStyle = p.col('#c9a46a'); ctx.lineWidth = Math.max(1.2, 2.4 * z); ctx.lineCap = 'round';
      for (const yy of [-0.35, 1.35]) {
        const a = p.P(0.35, yy, zz(0.06)), b = p.P(2.65, yy, zz(0.06));
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      ctx.lineWidth = Math.max(1, 1.6 * z);
      for (const xx of [0.9, 2.1]) for (const yy of [-0.35, 1.35]) {
        const a = p.P(xx, 0.5, zz(0.42)), m = p.P(xx, (0.5 + yy) / 2, zz(0.75)), b = p.P(xx, yy, zz(0.08));
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(m[0], m[1], b[0], b[1]); ctx.stroke();
      }
      // lambung
      p.poly([[0.4, 0.25, zz(0.05)], [2.6, 0.25, zz(0.05)], [3.05, 0.5, zz(0.55)], [2.6, 0.25, zz(0.4)], [0.4, 0.25, zz(0.4)], [-0.05, 0.5, zz(0.55)]], '#e9e2d0');
      p.poly([[-0.05, 0.5, zz(0.55)], [0.4, 0.25, zz(0.4)], [2.6, 0.25, zz(0.4)], [3.05, 0.5, zz(0.55)], [2.6, 0.75, zz(0.4)], [0.4, 0.75, zz(0.4)]], '#7a5534');
      p.poly([[0.4, 0.75, zz(0.05)], [2.6, 0.75, zz(0.05)], [3.05, 0.5, zz(0.55)], [2.6, 0.75, zz(0.4)], [0.4, 0.75, zz(0.4)], [-0.05, 0.5, zz(0.55)]], '#fffaf0');
      // garis warna & mata di haluan
      const s0 = p.P(0.35, 0.75, zz(0.3)), s1 = p.P(2.65, 0.75, zz(0.3));
      ctx.strokeStyle = p.col(floating ? '#2f9e9a' : '#ff7a59'); ctx.lineWidth = Math.max(1, 2 * z);
      ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]); ctx.stroke();
      const e = p.P(2.72, 0.68, zz(0.4));
      ctx.fillStyle = p.col('#fffaf0'); ctx.beginPath(); ctx.arc(e[0], e[1], 2.4 * z, 0, 7); ctx.fill();
      ctx.fillStyle = '#14324a'; ctx.beginPath(); ctx.arc(e[0] + 0.5 * z, e[1], 1.2 * z, 0, 7); ctx.fill();
      if (floating) {
        // riak di sekeliling perahu
        const c = p.P(1.5, 0.5, 0);
        ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1.2 * z;
        ctx.beginPath(); ctx.ellipse(c[0], c[1], 70 * z, 18 * z, 0, 0, 7); ctx.stroke();
      }
    },
    // ombak: buih bergerak di garis pantai, gelombang datang, kilau air, pantulan bulan malam hari
    floorFx(ctx, toScreen, z, t, night) {
      night = night || 0;
      const dim = 1 - night * 0.55;
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // gelombang datang dari laut menuju pantai
      for (let w = 0; w < 3; w++) {
        const ph = (t * 0.16 + w / 3) % 1;
        ctx.strokeStyle = `rgba(255,255,255,${(0.5 * Math.sin(ph * Math.PI) * dim).toFixed(3)})`;
        ctx.lineWidth = Math.max(1, 2 * z);
        ctx.beginPath();
        let started = false;
        for (let x = 0; x < shore.length; x++) {
          if (shore[x] < 0) { started = false; continue; }
          const yy = shore[x] - 3.4 + ph * 3.2 + Math.sin(x * 0.9 + t) * 0.08;
          const [sx, sy] = toScreen(x + 0.5, yy);
          if (started) ctx.lineTo(sx, sy); else { ctx.moveTo(sx, sy); started = true; }
        }
        ctx.stroke();
      }
      // buih yang naik-turun di pasir basah
      const wash = Math.max(0, Math.sin(t * 0.9)) * 0.45;
      ctx.strokeStyle = `rgba(255,255,255,${(0.85 * dim).toFixed(3)})`; ctx.lineWidth = Math.max(1.5, 3 * z);
      ctx.beginPath();
      let started = false;
      for (let x = 0; x < shore.length; x++) {
        if (shore[x] < 0) { started = false; continue; }
        for (const fx of [0.1, 0.5, 0.9]) {
          const yy = shore[x] - 0.05 + wash + Math.sin((x + fx) * 1.7 + t * 1.3) * 0.07;
          const [sx, sy] = toScreen(x + fx, yy);
          if (started) ctx.lineTo(sx, sy); else { ctx.moveTo(sx, sy); started = true; }
        }
      }
      ctx.stroke();
      // kilau di laut
      ctx.fillStyle = `rgba(255,255,255,${(0.8 * dim).toFixed(3)})`;
      for (const [x, y, ph] of sparks) {
        const a = Math.sin(t * 2.2 + ph);
        if (a < 0.6) continue;
        const [sx, sy] = toScreen(x, y);
        const r = (a - 0.6) * 6 * z;
        ctx.fillRect(sx - r, sy - 0.6 * z, r * 2, 1.2 * z);
      }
      // pantulan bulan
      if (night > 0.3) {
        ctx.globalAlpha = (night - 0.3) / 0.7;
        ctx.fillStyle = 'rgba(255,240,200,.55)';
        for (let k = 0; k < 7; k++) {
          const [sx, sy] = toScreen(1.2 + k * 0.32, 0.2 + k * 0.45);
          const wv = (10 - k) * z * (0.8 + 0.2 * Math.sin(t * 2 + k));
          ctx.fillRect(sx - wv, sy, wv * 2, 1.6 * z);
        }
      }
      ctx.restore();
    },
    overlay() {},
  };
})(window.AL);
