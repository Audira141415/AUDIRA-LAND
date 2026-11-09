/* AUDIRA LAND · agen bergerak: kapal feri (warga baru), pejalan kaki, mobil. */
(function (AL) {
  'use strict';
  const { W, H, T, tiles, idx } = AL;

  // ---------- BFS di jaringan jalan (+ dermaga untuk pejalan) ----------
  const prev = new Int32Array(W * H), queue = new Int32Array(W * H);
  AL.findPath = function (sx, sy, tx, ty, allowDock) {
    prev.fill(-1);
    const s = idx(sx, sy), g = idx(tx, ty);
    let h = 0, t = 0;
    prev[s] = s; queue[t++] = s;
    while (h < t) {
      const c = queue[h++];
      if (c === g) break;
      const x = c % W, y = (c / W) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (prev[n] !== -1) continue;
        const tt = tiles[n];
        if (tt === T.ROAD || (allowDock && tt === T.DOCK)) { prev[n] = c; queue[t++] = n; }
      }
    }
    if (prev[g] === -1) return null;
    const path = [];
    for (let c = g; c !== s; c = prev[c]) path.push([c % W, (c / W) | 0]);
    path.push([sx, sy]);
    return path.reverse();
  };

  const roads = [];
  // mobil hanya berkeliling Kota Cakrawala; di Kampung Nyiur orang berjalan kaki
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = (i / W) | 0;
    if (tiles[i] === T.ROAD && (!AL.district || AL.district(x, y) === 'kota') && !(AL.bridges && AL.bridges.has(i))) roads.push([x, y]);
  }
  AL.roads = roads;
  const rndRoad = () => roads[Math.floor(Math.random() * roads.length)];

  const agents = [];
  AL.agents = agents;

  function advance(a, dt) {
    let dist = a.speed * dt;
    while (dist > 0 && a.seg < a.path.length - 1) {
      const rem = 1 - a.t;
      if (dist >= rem) { dist -= rem; a.seg++; a.t = 0; } else { a.t += dist; dist = 0; }
    }
    const last = a.seg >= a.path.length - 1;
    const [x0, y0] = a.path[Math.min(a.seg, a.path.length - 1)];
    const [x1, y1] = last ? [x0, y0] : a.path[a.seg + 1];
    if (!last) { a.dx = x1 - x0; a.dy = y1 - y0; }
    const off = a.lane;
    a.x = x0 + (x1 - x0) * a.t + 0.5 + a.dy * off;
    a.y = y0 + (y1 - y0) * a.t + 0.5 - a.dx * off;
    return last;
  }

  // ---------- MOBIL ----------
  const CARS = ['#c9675e', '#d8b56a', '#5f9e98', '#f7f4ee', '#3d6e9e', '#6fae86', '#2b2f3a', '#d9967c'];
  function carRoute(a) {
    for (let k = 0; k < 6; k++) {
      const to = rndRoad(), from = a.path ? a.path[a.path.length - 1] : rndRoad();
      const p = AL.findPath(from[0], from[1], to[0], to[1], false);
      if (p && p.length > 3) { a.path = p; a.seg = 0; a.t = 0; return; }
    }
  }
  // ragam kendaraan: sedan, angkot, pikap bak, motor/ojek (warna dunia, saturasi rendah)
  const ANGKOT = ['#7fa6b8', '#8fb08a', '#c9b07e', '#b98a7a'];
  const OJEK = ['#6f9e78', '#5f9e98', '#c9a36a', '#7d86c4'];
  const VTYPE = ['sedan', 'motor', 'sedan', 'angkot', 'sedan', 'motor', 'pikap', 'sedan', 'angkot', 'sedan'];
  AL.spawnCars = function (n) {
    for (let k = 0; k < n; k++) {
      const type = VTYPE[k % VTYPE.length];
      const color = type === 'angkot' ? ANGKOT[k % ANGKOT.length] : type === 'motor' ? OJEK[k % OJEK.length] : CARS[k % CARS.length];
      const speed = type === 'motor' ? 2.2 + Math.random() * 1.2 : type === 'angkot' ? 1.5 + Math.random() * 0.8 : 1.8 + Math.random() * 1.2;
      const a = { kind: 'car', type, speed, lane: type === 'motor' ? 0.26 : 0.2, color, dx: 1, dy: 0, path: null, seg: 0, t: 0, x: 0, y: 0 };
      carRoute(a);
      if (!a.path) continue;
      a.seg = Math.floor(Math.random() * (a.path.length - 1));
      agents.push(a);
    }
  };

  // ---------- PEJALAN ----------
  AL.spawnWalker = function (res, fromX, fromY, toLot, opts) {
    const lot = AL.lots[toLot];
    if (!lot) return null;
    const p = AL.findPath(fromX, fromY, lot.door[0], lot.door[1], true);
    if (!p) return null;
    // look turunan (prototype = res.look): identitas & aksesori tetap dibaca dari res.look,
    // tapi arah hadap (_hx/_bk) milik agen ini saja.
    const look = Object.create(res.look);
    const a = { kind: 'walker', res, look, speed: 0.9 + Math.random() * 0.3, lane: (res.seed & 1 ? 0.38 : -0.38), path: p, seg: 0, t: 0, dx: 0, dy: 1, x: fromX + 0.5, y: fromY + 0.5, lot: toLot, born: performance.now(), arrive: opts && opts.arrive };
    agents.push(a);
    return a;
  };
  // warga lalu-lalang: rumah ↔ tempat kerja
  AL.spawnCommuter = function () {
    const R = AL.residents;
    if (!R.length) return;
    const res = R[Math.floor(Math.random() * R.length)];
    const pl = AL.places[res.job];
    if (res.home < 0 || !pl || pl.lot < 0) return;
    const home = AL.lots[res.home], work = AL.lots[pl.lot];
    const goWork = Math.random() < 0.5;
    const from = goWork ? home.door : work.door;
    AL.spawnWalker(res, from[0], from[1], goWork ? work.i : home.i);
  };

  // ---------- KAPAL FERI: mengikuti jadwal dari server (AL.slots: waktu sandar -> penumpang) ----------
  const TRAVEL = 9, DOCKED = 7;
  AL.FERRY_TRAVEL = TRAVEL; AL.FERRY_DOCKED = DOCKED;
  AL.slots = new Map();
  const ferry = { kind: 'ferry', state: 'away', x: 0, y: 0, load: [], next: null, moving: false };
  AL.ferry = ferry;
  function berth() { const d = AL.dock; return { x: d.x + 1.6, y: d.yEnd - 0.3 }; }
  AL.updateFerry = function () {
    if (!AL.dock) return;
    const now = AL.now(), b = berth(), far = b.y + 18;
    let active = null, next = null;
    for (const [S, list] of AL.slots) {
      if (now >= S + (DOCKED + TRAVEL) * 1000 + 2000) { AL.slots.delete(S); continue; }
      if (now >= S - TRAVEL * 1000) { if (!active || S < active.S) active = { S, list }; }
      else if (!next || S < next) next = S;
    }
    ferry.next = next;
    ferry.nextCount = next ? AL.slots.get(next).length : 0;
    const inList = agents.indexOf(ferry);
    if (!active) { ferry.state = 'away'; if (inList >= 0) agents.splice(inList, 1); return; }
    if (inList < 0) agents.push(ferry);
    ferry.x = b.x;
    ferry.load = active.list;
    const t = (now - active.S) / 1000;
    if (t < 0) {
      ferry.state = 'arriving'; ferry.moving = true;
      ferry.y = far + (b.y - far) * AL.ease(AL.clamp(1 + t / TRAVEL, 0, 1));
    } else if (t < DOCKED) {
      ferry.state = 'docked'; ferry.moving = false; ferry.y = b.y;
      const due = Math.min(active.list.length, Math.floor(t / 0.8) + 1);
      for (let k = 0; k < due; k++) {
        const p = active.list[k];
        if (p.done) continue;
        p.done = true;
        const known = AL.bySeq.has(p.seq);
        const res = AL.addResident(p.u, p.at, p.seq);
        if (known) continue;
        if (res.home >= 0) AL.spawnWalker(res, AL.dock.x, AL.dock.yEnd, res.home, { arrive: true });
        AL.onArrive && AL.onArrive(res);
      }
    } else {
      ferry.state = 'leaving'; ferry.moving = true;
      ferry.y = b.y + (far - b.y) * AL.ease(AL.clamp((t - DOCKED) / TRAVEL, 0, 1));
    }
  };
  AL.ferryCountdown = () => (ferry.next ? Math.max(0, (ferry.next - AL.now()) / 1000) : null);

  AL.updateAgents = function (dt) {
    for (let i = agents.length - 1; i >= 0; i--) {
      const a = agents[i];
      if (a.kind === 'car') { if (advance(a, dt)) carRoute(a); }
      else if (a.kind === 'walker') {
        if (advance(a, dt)) { agents.splice(i, 1); continue; }
        // arah hadap di layar: x layar ~ (dx - dy), turun layar ~ (dx + dy)
        const sxd = a.dx - a.dy;
        a.look._hx = sxd > 0 ? 1 : sxd < 0 ? -1 : 0;
        a.look._bk = a.dx + a.dy < 0;
      }
    }
  };
  AL.countWalkers = () => agents.reduce((n, a) => n + (a.kind === 'walker' ? 1 : 0), 0);

  // ---------- GAMBAR AGEN (dalam ruang layar css) ----------
  // Kendaraan digambar sebagai beberapa prisma (alas & atap boleh beda ukuran: kaca depan miring).
  // Koordinat lokal: a = sepanjang badan (+ = depan), b = melintang (+b selalu sisi yang tampak), z = tinggi (satuan petak).
  const GLASS = '#8fa8b8', GLASS_D = '#5d7384', TIRE = '#25272d';
  // [a0,a1,b0,b1, ta0,ta1,tb0,tb1, z0,z1, peran]  peran: body | cab | stripe | bed | load | seat
  const SHAPES = {
    sedan: [
      [-0.25, 0.25, -0.13, 0.13, -0.24, 0.24, -0.125, 0.125, 0.05, 0.15, 'body'],
      [-0.15, 0.1, -0.115, 0.115, -0.11, 0.035, -0.095, 0.095, 0.15, 0.25, 'cab'],
    ],
    angkot: [
      [-0.28, 0.28, -0.135, 0.135, -0.28, 0.28, -0.135, 0.135, 0.05, 0.12, 'body'],
      [-0.28, 0.28, -0.135, 0.135, -0.28, 0.28, -0.135, 0.135, 0.12, 0.145, 'stripe'],
      [-0.28, 0.2, -0.135, 0.135, -0.28, 0.185, -0.133, 0.133, 0.145, 0.19, 'body'],
      [-0.28, 0.185, -0.133, 0.133, -0.28, 0.14, -0.125, 0.125, 0.19, 0.31, 'cab'],
    ],
    pikap: [
      [-0.27, 0.27, -0.13, 0.13, -0.27, 0.27, -0.13, 0.13, 0.05, 0.15, 'body'],
      [0.05, 0.27, -0.125, 0.125, 0.07, 0.2, -0.11, 0.11, 0.15, 0.29, 'cab'],
      [-0.27, 0.03, -0.13, 0.13, -0.27, 0.03, -0.13, 0.13, 0.15, 0.2, 'bed'],
      [-0.22, -0.04, -0.09, 0.07, -0.22, -0.04, -0.09, 0.07, 0.2, 0.27, 'load'],
    ],
    motor: [
      [-0.12, 0.12, -0.03, 0.03, -0.1, 0.1, -0.03, 0.03, 0.05, 0.1, 'seat'],
      [0.06, 0.13, -0.035, 0.035, 0.07, 0.11, -0.03, 0.03, 0.05, 0.16, 'body'],
    ],
  };
  const DIMS = { sedan: [0.25, 0.13], angkot: [0.28, 0.135], pikap: [0.27, 0.13], motor: [0.13, 0.04] };
  // palet kendaraan disimpan di agen; dihitung ulang hanya bila tingkat malam (1/32) atau sumbu jalan berubah
  const tone = (h, f, q) => { const v = f === 1 ? h : AL.shade(h, f); return q > 0 ? AL.mix(v, AL.NIGHT, q / 32) : v; };
  function carPalette(a, type, shapes, q, along) {
    const P = a._pal;
    if (P && P.q === q && P.along === along && P.type === type && P.color === a.color) return P;
    const fSide = along ? 0.9 : 0.74, fEnd = along ? 0.74 : 0.9;
    const faces = shapes.map(S => {
      const role = S[10];
      const base = role === 'cab' ? AL.shade(a.color, 1.04) : role === 'stripe' ? '#efe9de' : role === 'bed' ? AL.shade(a.color, 0.92)
        : role === 'load' ? '#b48a5a' : role === 'seat' ? '#3b3f48' : a.color;
      return [
        tone(role === 'cab' ? GLASS : base, fSide, q),
        tone(role === 'cab' ? GLASS_D : base, fEnd, q),
        tone(role === 'bed' ? AL.shade(a.color, 0.7) : base, 1.07, q),
      ];
    });
    return (a._pal = {
      q, along, type, color: a.color, faces,
      tire: tone(TIRE, 1, q * 0.6 | 0), pants: tone('#2d3a55', 1, q), jacket: tone(a.color, 1, q), arm: tone(a.color, 0.84, q),
      helm: tone(a.color, 0.92, q), visor: tone('#f2efe8', 1, q), tail: tone('#a9584c', 1, q),
    });
  }
  // sprite cahaya radial, dibuat sekali (lebih murah daripada gradien baru per mobil per bingkai)
  let glowW = null, glowR = null;
  function glowSprite(rgb) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(' + rgb + ',1)'); gr.addColorStop(0.35, 'rgba(' + rgb + ',.45)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return cv;
  }
  // urutan gambar prisma: yang lebih rendah dulu, lalu yang lebih jauh dari kamera dulu
  const orders = {};
  function shapeOrder(type, shapes, dir) {
    const key = type + (dir > 0 ? '+' : '-');
    if (!orders[key]) orders[key] = shapes.map((S, i) => [i, S[8] * 10 + (S[0] + S[1]) / 2 * dir]).sort((p, q) => p[1] - q[1]).map(p => p[0]);
    return orders[key];
  }
  const corner = new Float64Array(24), scr = new Float64Array(16);
  AL.drawCar = function (ctx, a, sx, sy, z, night) {
    night = night || 0;
    const type = a.type || 'sedan', shapes = SHAPES[type] || SHAPES.sedan;
    const along = a.dx !== 0, dir = along ? a.dx : a.dy;
    const C = carPalette(a, type, shapes, Math.round(night * 16), along);
    const HW = 32 * z, HH = 16 * z, ZH = 32 * z;
    // lokal (a,b,z) -> layar
    const toS = (la, lb, lz, out, o) => {
      const wx = along ? la * dir : lb, wy = along ? lb : la * dir;
      out[o] = sx + (wx - wy) * HW; out[o + 1] = sy + (wx + wy) * HH - lz * ZH;
    };
    const [hl, hb] = DIMS[type] || DIMS.sedan;

    // bayangan kontak: dua lapis, condong ke kanan bawah seperti bayangan bangunan
    const sh = (e, alpha) => {
      ctx.beginPath();
      toS(-hl - e, -hb - e + 0.03, 0, scr, 0); ctx.moveTo(scr[0] + 2 * z, scr[1] + 1 * z);
      toS(hl + e, -hb - e + 0.03, 0, scr, 0); ctx.lineTo(scr[0] + 2 * z, scr[1] + 1 * z);
      toS(hl + e, hb + e + 0.03, 0, scr, 0); ctx.lineTo(scr[0] + 2 * z, scr[1] + 1 * z);
      toS(-hl - e, hb + e + 0.03, 0, scr, 0); ctx.lineTo(scr[0] + 2 * z, scr[1] + 1 * z);
      ctx.closePath(); ctx.fillStyle = 'rgba(20,30,50,' + alpha + ')'; ctx.fill();
    };
    sh(0.045, 0.1); sh(0, 0.18);

    // roda di sisi yang tampak (motor: dua roda di garis tengah)
    const wr = (type === 'motor' ? 0.05 : 0.052) * 32 * z * 1.15;
    const wb = type === 'motor' ? 0 : hb - 0.005, wa = type === 'motor' ? 0.1 : hl - 0.1;
    ctx.fillStyle = C.tire; ctx.beginPath();
    toS(-wa, wb, 0.055, scr, 0); ctx.moveTo(scr[0] + wr, scr[1]); ctx.arc(scr[0], scr[1], wr, 0, Math.PI * 2);
    toS(wa, wb, 0.055, scr, 0); ctx.moveTo(scr[0] + wr, scr[1]); ctx.arc(scr[0], scr[1], wr, 0, Math.PI * 2);
    ctx.fill();

    // prisma: hanya sisi yang menghadap kamera (normal · (1,1,1) > 0), diarsir menurut arah normal
    const frontVis = dir > 0, backVis = dir < 0;
    const order = shapeOrder(type, shapes, dir);
    for (let s = 0; s < order.length; s++) {
      const S = shapes[order[s]], F = C.faces[order[s]];
      // sudut alas (0..3) dan atap (4..7): (a0,b0) (a1,b0) (a1,b1) (a0,b1)
      toS(S[0], S[2], S[8], corner, 0); toS(S[1], S[2], S[8], corner, 2); toS(S[1], S[3], S[8], corner, 4); toS(S[0], S[3], S[8], corner, 6);
      toS(S[4], S[6], S[9], corner, 8); toS(S[5], S[6], S[9], corner, 10); toS(S[5], S[7], S[9], corner, 12); toS(S[4], S[7], S[9], corner, 14);
      // sisi j: 0 = -b (tersembunyi), 1 = depan (+a), 2 = +b (tampak), 3 = belakang (-a)
      // muka +x diarsir 0.74, muka +y 0.9 (sama seperti Painter.box bangunan)
      for (let j = 1; j < 4; j++) {
        if (j === 1 && !frontVis) continue;
        if (j === 3 && !backVis) continue;
        const k0 = j * 2, k1 = ((j + 1) % 4) * 2;
        ctx.beginPath();
        ctx.moveTo(corner[k0], corner[k0 + 1]); ctx.lineTo(corner[k1], corner[k1 + 1]);
        ctx.lineTo(corner[8 + k1], corner[9 + k1]); ctx.lineTo(corner[8 + k0], corner[9 + k0]);
        ctx.closePath(); ctx.fillStyle = j === 2 ? F[0] : F[1]; ctx.fill();
      }
      // atap
      ctx.beginPath();
      ctx.moveTo(corner[8], corner[9]); ctx.lineTo(corner[10], corner[11]); ctx.lineTo(corner[12], corner[13]); ctx.lineTo(corner[14], corner[15]);
      ctx.closePath(); ctx.fillStyle = F[2]; ctx.fill();
    }

    // pengendara motor (ojek): badan jaket + helm
    if (type === 'motor') {
      const s = z * 0.75;
      toS(-0.03, 0, 0.1, scr, 0);
      const rx = scr[0], ry = scr[1];
      ctx.fillStyle = C.pants;
      ctx.fillRect(rx - 1.6 * s, ry - 2.2 * s, 3.2 * s, 2.6 * s);
      ctx.fillStyle = C.jacket;
      ctx.beginPath(); ctx.roundRect(rx - 2.3 * s, ry - 7.6 * s, 4.6 * s, 5.8 * s, 1.6 * s); ctx.fill();
      toS(0.1, 0, 0.17, scr, 2);
      ctx.strokeStyle = C.arm; ctx.lineWidth = 1.2 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(rx, ry - 6.4 * s); ctx.lineTo(scr[2], scr[3]); ctx.stroke(); ctx.lineCap = 'butt';
      ctx.fillStyle = C.helm;
      ctx.beginPath(); ctx.arc(rx, ry - 9.6 * s, 2.5 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.visor;
      ctx.fillRect(rx - 2.5 * s, ry - 9.9 * s, 5 * s, 0.7 * s);
    }

    // lampu depan & belakang (siang: titik kecil, malam: menyala + sorot di aspal)
    const lb = type === 'motor' ? [0] : [-hb + 0.04, hb - 0.04];
    const lz = type === 'motor' ? 0.13 : 0.11;
    const fa = type === 'motor' ? 0.13 : hl, ra = type === 'motor' ? -0.12 : -hl;
    const dot = Math.max(1, 1.3 * z);
    if (frontVis) for (const b of lb) { toS(fa, b, lz, scr, 0); ctx.fillStyle = night > 0.15 ? '#fff4d6' : '#f2efe8'; ctx.fillRect(scr[0] - dot / 2, scr[1] - dot / 2, dot, dot); }
    if (backVis) for (const b of lb) { toS(ra, b, lz, scr, 0); ctx.fillStyle = night > 0.15 ? '#ff6b5a' : C.tail; ctx.fillRect(scr[0] - dot / 2, scr[1] - dot / 2, dot, dot); }
    if (night > 0.2) {
      if (!glowW) { glowW = glowSprite('255,226,160'); glowR = glowSprite('255,90,70'); }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // sorot lampu: elips memanjang di aspal ke arah jalan
      toS(fa + (type === 'motor' ? 0.22 : 0.32), 0, 0, scr, 0);
      const wx = along ? dir : 0, wy = along ? 0 : dir;
      const ang = Math.atan2((wx + wy) * HH, (wx - wy) * HW);
      const len = (type === 'motor' ? 0.32 : 0.45) * 40 * z, wid = (type === 'motor' ? 0.12 : 0.2) * 40 * z;
      ctx.translate(scr[0], scr[1]); ctx.rotate(ang);
      ctx.globalAlpha = Math.min(1, 0.55 * night);
      ctx.drawImage(glowW, -len, -wid, len * 2, wid * 2);
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, 0.5 * night);
      const rr = 5 * z;
      for (const b of lb) { toS(ra - 0.02, b, lz, scr, 0); ctx.drawImage(glowR, scr[0] - rr, scr[1] - rr, rr * 2, rr * 2); }
      ctx.restore();
    }
  };
  AL.drawFerry = function (ctx, f, sx, sy, z, night, t) {
    const p = new AL.Painter(ctx, z, sx, sy, night > 0.5);
    if (f.moving) {
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      for (let k = 0; k < 4; k++) {
        const q = p.P(0, 1.5 + k * 0.45, 0);
        ctx.beginPath(); ctx.ellipse(q[0], q[1], (10 + k * 5) * z, (4 + k * 2) * z, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    const bob = Math.sin(t * 2) * 0.02;
    // bayangan lambung di air (lebih gelap dari laut, sedikit ke kanan bawah)
    p.poly([[-0.4, -1.75, 0], [0.62, -1.25, 0], [0.62, 1.42, 0], [-0.4, 1.42, 0]], 'rgba(15,45,70,.22)', true);
    p.box(-0.45, -1.3, 0.9, 2.6, bob, 0.14, '#14324a');
    p.box(-0.45, -1.3, 0.9, 2.6, bob + 0.14, 0.2, '#f7f4ee');
    p.poly([[-0.45, -1.3, bob], [0.45, -1.3, bob], [0, -1.8, bob + 0.34], [0, -1.8, bob]], AL.shade('#f7f4ee', 0.8));
    p.poly([[-0.45, -1.3, bob + 0.34], [0.45, -1.3, bob + 0.34], [0, -1.8, bob + 0.34]], '#ffffff');
    p.textX('AUDIRA', 0.45, 1.15, bob + 0.31, 0.15, night > 0.5 ? '#9fb3cc' : '#14324a');
    p.box(-0.32, -0.6, 0.64, 1.15, bob + 0.34, 0.32, '#eef2f5', { win: true, seed: 42, fh: 0.3, gap: 0.22, ww: 0.14, glass: '#7fb2d4' });
    p.cyl(0, 0.35, 0.1, bob + 0.66, 0.24, '#ffd166');
    // malam: lampu tiang (putih hangat) + lampu sisi, supaya feri terbaca di laut gelap
    if (night > 0.2) {
      if (!glowW) { glowW = glowSprite('255,226,160'); glowR = glowSprite('255,90,70'); }
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, 0.7 * night);
      const m = p.P(0, 0.35, bob + 0.95), r = 9 * z;
      ctx.drawImage(glowW, m[0] - r, m[1] - r, r * 2, r * 2);
      const sl = p.P(0.45, -1.1, bob + 0.3), rs = 5 * z;
      ctx.drawImage(glowR, sl[0] - rs, sl[1] - rs, rs * 2, rs * 2);
      ctx.restore();
    }
  };
})(window.AL);
