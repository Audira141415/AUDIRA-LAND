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
  AL.spawnCars = function (n) {
    for (let k = 0; k < n; k++) {
      const a = { kind: 'car', speed: 1.8 + Math.random() * 1.2, lane: 0.2, color: CARS[k % CARS.length], dx: 1, dy: 0, path: null, seg: 0, t: 0, x: 0, y: 0 };
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
    const a = { kind: 'walker', res, look: res.look, speed: 0.9 + Math.random() * 0.3, lane: (res.seed & 1 ? 0.38 : -0.38), path: p, seg: 0, t: 0, dx: 0, dy: 1, x: fromX + 0.5, y: fromY + 0.5, lot: toLot, born: performance.now(), arrive: opts && opts.arrive };
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
      else if (a.kind === 'walker') { if (advance(a, dt)) agents.splice(i, 1); }
    }
  };
  AL.countWalkers = () => agents.reduce((n, a) => n + (a.kind === 'walker' ? 1 : 0), 0);

  // ---------- GAMBAR AGEN (dalam ruang layar css) ----------
  AL.drawCar = function (ctx, a, sx, sy, z, night) {
    const p = new AL.Painter(ctx, z, sx, sy, false);
    const along = a.dx !== 0;
    const L = 0.46, Wd = 0.26, w = along ? L : Wd, d = along ? Wd : L;
    const nt = night * 0.5;
    const col = c => (nt > 0 ? AL.mix(c, AL.NIGHT, nt) : c);
    p.poly([[-w / 2 + 0.06, -d / 2 + 0.06, 0], [w / 2 + 0.1, -d / 2 + 0.06, 0], [w / 2 + 0.1, d / 2 + 0.08, 0], [-w / 2 + 0.06, d / 2 + 0.08, 0]], 'rgba(20,30,50,.25)', true);
    p.box(-w / 2, -d / 2, w, d, 0.03, 0.13, col(a.color));
    const cw = along ? 0.24 : 0.2, cd = along ? 0.2 : 0.24;
    p.box(-cw / 2, -cd / 2, cw, cd, 0.16, 0.1, col(AL.shade(a.color, 0.9)), { top: col(AL.shade(a.color, 1.05)) });
    if (night > 0.2) {
      const fx = a.dx * 0.26, fy = a.dy * 0.26;
      const q = p.P(fx, fy, 0.1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], 14 * z);
      g.addColorStop(0, 'rgba(255,230,160,' + (0.55 * night) + ')'); g.addColorStop(1, 'rgba(255,230,160,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], 14 * z, 0, Math.PI * 2); ctx.fill();
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
    p.box(-0.45, -1.3, 0.9, 2.6, bob, 0.14, '#14324a');
    p.box(-0.45, -1.3, 0.9, 2.6, bob + 0.14, 0.2, '#f7f4ee');
    p.poly([[-0.45, -1.3, bob], [0.45, -1.3, bob], [0, -1.8, bob + 0.34], [0, -1.8, bob]], AL.shade('#f7f4ee', 0.8));
    p.poly([[-0.45, -1.3, bob + 0.34], [0.45, -1.3, bob + 0.34], [0, -1.8, bob + 0.34]], '#ffffff');
    p.textX('AUDIRA', 0.45, 1.15, bob + 0.31, 0.15, night > 0.5 ? '#9fb3cc' : '#14324a');
    p.box(-0.32, -0.6, 0.64, 1.15, bob + 0.34, 0.32, '#eef2f5', { win: true, seed: 42, fh: 0.3, gap: 0.22, ww: 0.14, glass: '#7fb2d4' });
    p.cyl(0, 0.35, 0.1, bob + 0.66, 0.24, '#ffd166');
  };
})(window.AL);
