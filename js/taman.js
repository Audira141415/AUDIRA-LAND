/* AUDIRA LAND · Taman Warga realtime: jalan bareng, ngobrol (warga KTW), emote. */
(function (AL) {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('park'), ctx = canvas.getContext('2d');
  const SPEED = 2.4;
  const EMOJI = { wave: '👋', heart: '❤️', laugh: '😂', dance: '💃' };
  const TK = 'audira-taman-token', UK = 'audira-taman-user';
  // room: Taman (bawaan) atau pesta rumah (window.ROOM diisi js/pesta-config.js)
  const ROOM = window.ROOM || { room: 'taman', map: 'js/taman-map.json', kind: 'taman' };
  const PESTA = ROOM.kind === 'pesta' ? AL.pesta : null;
  let MAP = null, vw = 0, vh = 0, dpr = 1;
  const cam = { x: 0, y: 0, zoom: 1 };
  const users = new Map();
  let meId = null, ws = null, retry = 0, fatal = false, target = null;
  let token = '';
  try { token = localStorage.getItem(TK) || ''; } catch (e) { /* penyimpanan diblokir */ }

  // ---------- peta ----------
  const walkable = (x, y) => MAP && y >= 0 && y < MAP.h && x >= 0 && x < MAP.w && MAP.walk.includes(MAP.rows[y][x]);
  function bfs(sx, sy, tx, ty) {
    if (!walkable(tx, ty)) return null;
    const W = MAP.w, prev = new Int32Array(W * MAP.h).fill(-1), s = sy * W + sx, g = ty * W + tx, q = [s];
    prev[s] = s;
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      if (c === g) break;
      const x = c % W, y = (c / W) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const n = ny * W + nx;
        if (walkable(nx, ny) && prev[n] === -1) { prev[n] = c; q.push(n); }
      }
    }
    if (prev[g] === -1) return null;
    const p = [];
    for (let c = g; c !== s; c = prev[c]) p.push([c % W, (c / W) | 0]);
    p.push([sx, sy]);
    return p.reverse();
  }

  // ---------- orang ----------
  function addUser(u) {
    const o = {
      id: u.id, name: u.name, v: u.v, b: u.b || '',
      look: Object.assign(AL.mkLook(u.v ? AL.hash32(u.name) : u.seed >>> 0), { items: AL.parseItems ? AL.parseItems(u.items) : [] }),
      x: u.x, y: u.y, path: null, seg: 0, t: 0, pending: null, bubble: null, emote: null, dx: 0, dy: 1,
    };
    users.set(u.id, o);
    return o;
  }
  function startPath(u, tx, ty) {
    const p = bfs(Math.round(u.x), Math.round(u.y), tx, ty);
    if (!p || p.length < 2) { u.path = null; return; }
    u.path = p; u.seg = 0; u.t = 0;
  }
  // kalau sedang jalan, tujuan baru dipakai setelah sampai petak berikutnya (gerak tetap mulus)
  function setTarget(u, tx, ty) { if (u.path) u.pending = [tx, ty]; else startPath(u, tx, ty); }
  function nextTile(u) { return u.path ? u.path[Math.min(u.seg + 1, u.path.length - 1)] : [Math.round(u.x), Math.round(u.y)]; }
  function step(u, dt) {
    if (!u.path) return;
    u.t += SPEED * dt;
    while (u.t >= 1 && u.path) {
      u.t -= 1; u.seg++;
      const [cx, cy] = u.path[u.seg];
      u.x = cx; u.y = cy;
      if (u.pending) { const [tx, ty] = u.pending; u.pending = null; startPath(u, tx, ty); u.t = 0; return; }
      if (u.seg >= u.path.length - 1) { u.path = null; u.t = 0; return; }
    }
    const [x0, y0] = u.path[u.seg], [x1, y1] = u.path[u.seg + 1];
    u.dx = x1 - x0; u.dy = y1 - y0;
    u.x = x0 + (x1 - x0) * u.t; u.y = y0 + (y1 - y0) * u.t;
  }

  // ---------- jaringan ----------
  function sendMsg(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
  function connect() {
    setConn('Menyambung…');
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/taman' + (ROOM.room !== 'taman' ? '?room=' + encodeURIComponent(ROOM.room) : ''));
    ws.onopen = () => { retry = 0; sendMsg({ t: 'hello', token: token || undefined }); };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (er) { return; } onMsg(m); };
    ws.onclose = () => {
      ws = null;
      if (fatal) return;
      const wait = Math.min(10000, 1000 * Math.pow(2, retry++));
      setConn('Terputus. Menyambung lagi…');
      setTimeout(connect, wait);
    };
  }
  function onMsg(m) {
    if (m.t === 'welcome') {
      users.clear();
      m.users.forEach(addUser);
      meId = m.you.id;
      if (token && !m.tokenOk) { clearLogin(); toast('Sesi berakhir. Masuk lagi dengan kode KTW.'); }
      $('log').innerHTML = '';
      m.chat.forEach(logLine);
      setConn('');
      renderWho();
    } else if (m.t === 'join') { addUser(m.u); }
    else if (m.t === 'leave') { users.delete(m.id); }
    else if (m.t === 'badge') { const u = users.get(m.id); if (u) u.b = m.b || ''; }
    else if (m.t === 'look') { const u = users.get(m.id); if (u && AL.parseItems) u.look.items = AL.parseItems(m.items); }
    else if (m.t === 'move') {
      const u = users.get(m.id);
      if (!u) return;
      if (!u.path && Math.abs(u.x - m.fx) + Math.abs(u.y - m.fy) > 1.5) { u.x = m.fx; u.y = m.fy; }
      setTarget(u, m.x, m.y);
    } else if (m.t === 'say') {
      const u = users.get(m.id);
      if (u) u.bubble = { m: m.m, until: performance.now() + 6000 };
      logLine(m);
    } else if (m.t === 'emote') {
      const u = users.get(m.id);
      if (u) u.emote = { e: m.e, at: performance.now() };
    } else if (m.t === 'err') {
      toast(m.m);
      if (m.fatal) { fatal = true; setConn('Terputus. Muat ulang halaman untuk masuk lagi.'); }
    }
    $('online').textContent = users.size;
  }

  // ---------- UI ----------
  const esc = AL.esc;
  function setConn(t) { $('conn').textContent = t; $('conn').hidden = !t; }
  function logLine(m) {
    const li = document.createElement('li');
    li.innerHTML = `<b>@${esc(m.name)}</b> ${esc(m.m)}`;
    $('log').appendChild(li);
    while ($('log').children.length > 30) $('log').firstChild.remove();
    $('log').scrollTop = $('log').scrollHeight;
  }
  let toastT = 0;
  function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 3500); }
  function me() { return users.get(meId); }
  function renderWho() {
    const m = me(), verified = m && m.v;
    $('who').innerHTML = verified
      ? `<span class="badge" aria-hidden="true">✓</span> @${esc(m.name)} <button type="button" id="logout" class="link">Keluar</button>`
      : `${m ? esc(m.name) : 'Tamu'} <button type="button" id="loginBtn" class="link">Masuk warga</button>`;
    $('sayForm').hidden = !verified;
    $('loginCta').hidden = !!verified;
    $('logout')?.addEventListener('click', logout);
    $('loginBtn')?.addEventListener('click', openLogin);
  }
  function clearLogin() { token = ''; try { localStorage.removeItem(TK); localStorage.removeItem(UK); } catch (e) { /* abaikan */ } }
  function reconnect() { fatal = false; if (ws) { ws.onclose = null; ws.close(); } connect(); }
  async function logout() {
    const t = token;
    clearLogin();
    fetch('/api/sesi/hapus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t }) }).catch(() => {});
    reconnect();
  }
  function openLogin() { $('loginMsg').hidden = true; $('loginSheet').showModal(); $('lu').focus(); }
  $('loginCta').addEventListener('click', openLogin);
  $('loginClose').addEventListener('click', () => $('loginSheet').close());
  $('lu').addEventListener('input', () => { $('lu').value = $('lu').value.replace(/^@+/, ''); });
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('loginMsg');
    msg.hidden = false; msg.className = 'msg'; msg.textContent = 'Memeriksa…';
    try {
      const r = await fetch('/api/masuk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: $('lu').value, kode: $('lk').value }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Gagal masuk');
      token = j.token;
      try { localStorage.setItem(TK, token); localStorage.setItem(UK, j.username); } catch (er) { /* sesi hanya untuk tab ini */ }
      $('loginSheet').close(); $('lk').value = '';
      toast('Selamat datang, @' + j.username);
      reconnect();
    } catch (err) { msg.textContent = err.message; msg.classList.add('err'); }
  });
  $('sayForm').addEventListener('submit', e => {
    e.preventDefault();
    const t = $('say').value.trim();
    if (!t) return;
    sendMsg({ t: 'say', m: t });
    $('say').value = '';
  });
  document.querySelectorAll('[data-e]').forEach(b => b.addEventListener('click', () => sendMsg({ t: 'emote', e: b.dataset.e })));
  $('logToggle').addEventListener('click', () => {
    const open = $('chatlog').classList.toggle('open');
    $('logToggle').setAttribute('aria-expanded', open);
  });

  // ---------- kamera & input ----------
  function resize() {
    vw = innerWidth; vh = innerHeight; dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px'; canvas.style.height = vh + 'px';
  }
  function fit() {
    const c = AL.toWorld(MAP.w / 2, MAP.h / 2);
    cam.x = c.x; cam.y = c.y - 20;
    // HP: perbesar, tepi taman boleh terpotong (bisa digeser)
    cam.zoom = AL.clamp(Math.min(vw / (MAP.w * AL.TW), (vh - 160) / (MAP.h * AL.TH + 120)) * (vw < 640 ? 1.6 : 1.05), 0.4, 2);
  }
  addEventListener('resize', () => { resize(); if (MAP) fit(); });
  const toScreen = (tx, ty, z) => { const w = AL.toWorld(tx, ty, z || 0); return [(w.x - cam.x) * cam.zoom + vw / 2, (w.y - cam.y) * cam.zoom + vh / 2]; };
  const ptrs = new Map();
  let drag = null, moved = 0, pinch = 0;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 1) { drag = [e.clientX, e.clientY]; moved = 0; }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); drag = null; moved = 99; }
  });
  canvas.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      cam.zoom = AL.clamp(cam.zoom * d / pinch, 0.4, 3); pinch = d;
    } else if (drag) {
      const dx = e.clientX - drag[0], dy = e.clientY - drag[1];
      cam.x -= dx / cam.zoom; cam.y -= dy / cam.zoom; drag = [e.clientX, e.clientY];
      moved += Math.abs(dx) + Math.abs(dy);
    }
  });
  const up = e => {
    ptrs.delete(e.pointerId);
    if (e.type === 'pointerup' && drag && moved < 6) tap(e.clientX, e.clientY);
    if (!ptrs.size) drag = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); cam.zoom = AL.clamp(cam.zoom * Math.exp(-e.deltaY * 0.0015), 0.4, 3); }, { passive: false });
  function tap(sx, sy) {
    const m = me();
    if (!m) return;
    const wx = (sx - vw / 2) / cam.zoom + cam.x, wy = (sy - vh / 2) / cam.zoom + cam.y;
    const t = AL.toTile(wx, wy), tx = Math.floor(t.tx), ty = Math.floor(t.ty);
    if (!walkable(tx, ty)) return;
    const [fx, fy] = nextTile(m);
    setTarget(m, tx, ty);
    target = { x: tx, y: ty, at: performance.now() };
    sendMsg({ t: 'move', x: tx, y: ty, fx, fy });
  }

  // ---------- gambar ----------
  let ground = null, objs = [];
  function build() {
    const paths = new Map(), stones = new Path2D();
    const add = (col, x, y) => {
      let p = paths.get(col); if (!p) { p = new Path2D(); paths.set(col, p); }
      const a = AL.toWorld(x, y), b = AL.toWorld(x + 1, y), c = AL.toWorld(x + 1, y + 1), d = AL.toWorld(x, y + 1);
      p.moveTo(a.x, a.y); p.lineTo(b.x, b.y); p.lineTo(c.x, c.y); p.lineTo(d.x, d.y); p.closePath();
    };
    if (PESTA) {
      for (let y = 0; y < MAP.h; y++) for (let x = 0; x < MAP.w; x++) PESTA.ground(add, x, y, MAP.rows[y][x]);
      ground = { paths, stones };
      objs = PESTA.objects(MAP).sort((a, b) => a.key - b.key);
      return;
    }
    for (let y = 0; y < MAP.h; y++) for (let x = 0; x < MAP.w; x++) {
      const ch = MAP.rows[y][x];
      if (ch === '=' || ch === 'F') {
        add((x + y) % 2 ? '#e8dcc4' : '#e2d4b8', x, y);
        if (AL.ihash(x, y, 3) < 0.5) { const a = AL.toWorld(x + 0.25, y + 0.3), b = AL.toWorld(x + 0.6, y + 0.3); stones.moveTo(a.x, a.y); stones.lineTo(b.x, b.y); }
      } else if (ch === 'W') add('#7fcbd8', x, y);
      else add((x + y) % 2 ? '#93c27a' : '#8cbc73', x, y);
    }
    ground = { paths, stones };
    objs = [];
    for (let y = 0; y < MAP.h; y++) for (let x = 0; x < MAP.w; x++) {
      const ch = MAP.rows[y][x];
      if ('TBLSf'.includes(ch)) objs.push({ ch, x, y, key: x + y + 1, v: Math.floor(AL.ihash(x, y, 9) * 3) });
    }
    objs.push({ ch: 'F', x: 7, y: 7, key: 18 });
    objs.push({ ch: 'lily', x: 2, y: 2, key: 0 }); // daun teratai di kolam
    objs.sort((a, b) => a.key - b.key);
  }
  function nightFactor() {
    const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
    if (h >= 6.5 && h < 17.5) return 0;
    if (h >= 17.5 && h < 19) return (h - 17.5) / 1.5;
    if (h >= 19 || h < 4.5) return 1;
    return 1 - (h - 4.5) / 2;
  }
  function drawObj(o, t, night) {
    const [sx, sy] = toScreen(o.x, o.y);
    const p = new AL.Painter(ctx, cam.zoom, sx, sy, night > 0.5);
    if (PESTA) return PESTA.drawObj(o, p, ctx, t, cam.zoom);
    if (o.ch === 'T') p.tree(0.5, 0.5, 1.15, o.v);
    else if (o.ch === 'B') {
      p.box(0.18, 0.4, 0.06, 0.06, 0, 0.18, '#6b4a33'); p.box(0.76, 0.4, 0.06, 0.06, 0, 0.18, '#6b4a33');
      p.box(0.15, 0.32, 0.7, 0.3, 0.18, 0.05, '#b07a4a');
      p.box(0.15, 0.3, 0.7, 0.05, 0.23, 0.22, '#a06c40');
    } else if (o.ch === 'L') {
      const a = p.P(0.5, 0.5, 0), b = p.P(0.5, 0.5, 1.7);
      ctx.strokeStyle = p.col('#3d4655'); ctx.lineWidth = Math.max(1.5, 2.4 * cam.zoom);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      p.cyl(0.5, 0.5, 0.12, 1.7, 0.18, night > 0.2 ? '#fff2b0' : '#e9eef2');
      if (night > 0.15) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(b[0], b[1], 0, b[0], b[1], 90 * cam.zoom);
        g.addColorStop(0, `rgba(255,220,150,${0.45 * night})`); g.addColorStop(1, 'rgba(255,220,150,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b[0], b[1], 90 * cam.zoom, 0, 7); ctx.fill(); ctx.restore();
      }
    } else if (o.ch === 'S') {
      p.box(0.1, 0.45, 0.06, 0.06, 0, 0.4, '#6b4a33'); p.box(0.84, 0.45, 0.06, 0.06, 0, 0.4, '#6b4a33');
      p.box(0.04, 0.42, 0.92, 0.08, 0.36, 0.42, '#14324a');
      p.textY('TAMAN', 0.14, 0.5, 0.74, 0.15, '#fffaf0');
      p.textY('AUDIRA', 0.14, 0.5, 0.56, 0.17, '#ffd166');
    } else if (o.ch === 'f') {
      const cols = ['#d9967c', '#ffd166', '#cf7f9b', '#ffffff', '#9b84c4'];
      for (let k = 0; k < 7; k++) {
        const q = p.P(0.15 + AL.ihash(o.x * 7 + k, o.y, 1) * 0.7, 0.15 + AL.ihash(o.x, o.y * 7 + k, 2) * 0.7, 0.12);
        ctx.fillStyle = p.col('#4f9a48'); ctx.beginPath(); ctx.arc(q[0], q[1] + 4 * cam.zoom, 4 * cam.zoom, 0, 7); ctx.fill();
        ctx.fillStyle = p.col(cols[k % cols.length]); ctx.beginPath(); ctx.arc(q[0], q[1], 3 * cam.zoom, 0, 7); ctx.fill();
      }
    } else if (o.ch === 'lily') {
      for (const [lx, ly] of [[0.6, 0.5], [1.7, 0.9], [2.3, 1.4], [1.1, 1.5]]) {
        const q = p.P(lx, ly, 0.01);
        ctx.fillStyle = p.col('#5aa34c'); ctx.beginPath(); ctx.ellipse(q[0], q[1], 9 * cam.zoom, 4.5 * cam.zoom, 0, 0.3, Math.PI * 2); ctx.fill();
      }
    } else if (o.ch === 'F') {
      p.cyl(2, 2, 1.65, 0, 0.28, '#cfc6b4');
      p.cyl(2, 2, 1.45, 0.2, 0.09, '#7fcbd8');
      p.cyl(2, 2, 0.22, 0.25, 0.95, '#ddd5c6');
      p.cyl(2, 2, 0.6, 1.08, 0.12, '#cfc6b4');
      p.cyl(2, 2, 0.5, 1.16, 0.05, '#8fd3e0');
      // semburan air
      const top = p.P(2, 2, 1.5), z = cam.zoom;
      ctx.strokeStyle = p.n ? 'rgba(200,230,255,.55)' : 'rgba(255,255,255,.8)'; ctx.lineWidth = 2 * z; ctx.lineCap = 'round';
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2 + t * 0.4, ex = Math.cos(a) * 34 * z, ey = Math.sin(a) * 17 * z;
        ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.quadraticCurveTo(top[0] + ex * 0.5, top[1] - 18 * z, top[0] + ex, top[1] + ey + 22 * z); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      for (let k = 0; k < 10; k++) {
        const ph = (t * 1.3 + k / 10) % 1, a = k * 2.4;
        ctx.beginPath(); ctx.arc(top[0] + Math.cos(a) * 30 * z * ph, top[1] - 26 * z * Math.sin(ph * Math.PI) + Math.sin(a) * 14 * z * ph, 1.6 * z, 0, 7); ctx.fill();
      }
    }
  }
  function wrap(text, maxW) {
    const words = text.split(' '), lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines.slice(0, 3);
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function drawUser(u, t, now, night) {
    const [sx, sy0] = toScreen(u.x + 0.5, u.y + 0.5);
    const k = cam.zoom * 2.1;
    let sy = sy0;
    const em = u.emote && now - u.emote.at < 2200 ? u.emote : null;
    if (em && (em.e === 'dance' || em.e === 'wave')) sy -= Math.abs(Math.sin((now - em.at) / 120)) * 6 * cam.zoom;
    if (u.id === meId) {
      ctx.strokeStyle = '#ff7a59'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(sx, sy0, 9 * k, 4 * k, 0, 0, 7); ctx.stroke();
    }
    AL.drawWalker(ctx, sx, sy, k, u.look, u.path ? t * 1.3 + u.id : 0, night);
    // papan nama
    const head = sy - 18 * k;
    ctx.font = '700 12px "Plus Jakarta Sans", system-ui, sans-serif';
    // art bible §3: warga = pill krem penuh + badge teal bercentang; tamu = pill garis tepi saja
    const label = (u.b ? u.b + ' ' : '') + u.name, w = ctx.measureText(label).width + (u.v ? 30 : 16);
    const x0 = sx - w / 2;
    roundRect(x0, head - 22, w, 19, 10);
    if (u.v) {
      ctx.fillStyle = '#fffaf0'; ctx.fill();
      ctx.strokeStyle = 'rgba(20,50,74,.18)'; ctx.lineWidth = 1; ctx.stroke();
      const bx = x0 + w - 11, by = head - 12.5;
      ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(bx, by, 7.5, 0, 7); ctx.fill();   // bingkai krem 2 px
      ctx.fillStyle = '#177a7a'; ctx.beginPath(); ctx.arc(bx, by, 5.5, 0, 7); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(bx - 2.5, by); ctx.lineTo(bx - 0.5, by + 2); ctx.lineTo(bx + 2.8, by - 2.1); ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(255,250,240,.35)'; ctx.fill();
      ctx.strokeStyle = '#14324a'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.fillStyle = '#14324a';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x0 + 8, head - 12);
    let top = head - 26;
    // diri sendiri: pin segitiga koral di atas papan nama (bergaris navy untuk buta warna)
    if (u.id === meId) {
      const py = top - 2;
      ctx.beginPath(); ctx.moveTo(sx - 7, py - 11); ctx.lineTo(sx + 7, py - 11); ctx.lineTo(sx, py); ctx.closePath();
      ctx.fillStyle = '#ff7a59'; ctx.fill();
      ctx.strokeStyle = '#14324a'; ctx.lineWidth = 1.5; ctx.stroke();
      top -= 14;
    }
    // gelembung obrolan
    if (u.bubble && now < u.bubble.until) {
      ctx.font = '600 13px "Plus Jakarta Sans", system-ui, sans-serif';
      const lines = wrap(u.bubble.m, 170), lh = 17;
      const bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + 20, bh = lines.length * lh + 12;
      const fade = Math.min(1, (u.bubble.until - now) / 400);
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(20,50,74,.15)'; ctx.lineWidth = 1;
      roundRect(sx - bw / 2, top - bh - 8, bw, bh, 12); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx - 6, top - 8.5); ctx.lineTo(sx + 6, top - 8.5); ctx.lineTo(sx, top - 1); ctx.fill();
      ctx.fillStyle = '#14324a';
      lines.forEach((l, i) => ctx.fillText(l, sx - bw / 2 + 10, top - bh - 8 + 6 + lh / 2 + i * lh + 0.5));
      ctx.globalAlpha = 1;
      top -= bh + 10;
    }
    if (em) {
      const age = (now - em.at) / 2200;
      ctx.globalAlpha = 1 - age; ctx.font = '26px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(EMOJI[em.e], sx + 18, top - 10 - age * 30);
      ctx.globalAlpha = 1; ctx.textAlign = 'left';
    }
  }

  let last = performance.now();
  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    for (const u of users.values()) step(u, dt);
    draw(ts / 1000, ts);
    requestAnimationFrame(frame);
  }
  function draw(t, now) {
    const night = PESTA ? 0 : nightFactor(), z = cam.zoom; // pesta di dalam rumah: lampu ruangan
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PESTA ? PESTA.bg : AL.mix('#7fb86a', '#1f2c3a', night * 0.7); ctx.fillRect(0, 0, vw, vh);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (vw / 2 - cam.x * z), dpr * (vh / 2 - cam.y * z));
    for (const [col, p] of ground.paths) { ctx.fillStyle = col; ctx.fill(p); }
    ctx.strokeStyle = 'rgba(120,100,70,.25)'; ctx.lineWidth = 1; ctx.stroke(ground.stones);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (night > 0) { ctx.fillStyle = `rgba(16,24,56,${night * 0.5})`; ctx.fillRect(0, 0, vw, vh); }
    if (PESTA) PESTA.floorFx(ctx, toScreen, z, t);
    if (target && me() && me().path) {
      const pts = [[target.x, target.y], [target.x + 1, target.y], [target.x + 1, target.y + 1], [target.x, target.y + 1]].map(([x, y]) => toScreen(x, y));
      ctx.strokeStyle = '#ff7a59'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    }
    const people = [...users.values()].map(u => ({ u, key: u.x + u.y + 1 })).sort((a, b) => a.key - b.key);
    let pi = 0;
    for (const o of objs) {
      while (pi < people.length && people[pi].key < o.key) drawUser(people[pi++].u, t, now, night);
      drawObj(o, t, night);
    }
    while (pi < people.length) drawUser(people[pi++].u, t, now, night);
    if (PESTA) PESTA.overlay(ctx, toScreen, z, t);
  }

  // ---------- mulai ----------
  resize();
  Promise.all([fetch(ROOM.map).then(r => r.json()), ROOM.ready]).then(([m]) => {
    MAP = m; fit(); build();
    requestAnimationFrame(t => { last = t; frame(t); });
    connect();
  }).catch(() => setConn('Gagal memuat taman.'));
  AL.taman = { users, cam, send: sendMsg, get meId() { return meId; } };
})(window.AL);
