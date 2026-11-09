// AUDIRA LAND · Taman Warga realtime. Server cukup tahu posisi tujuan tiap orang;
// jalur dihitung sama di semua klien (BFS di peta yang sama).
const EMOTES = ['wave', 'heart', 'laugh', 'dance'];
const CAP = 60;
const BAD = ['anjing', 'bangsat', 'kontol', 'memek', 'ngentot', 'jancok', 'goblok', 'tolol', 'bajingan', 'keparat', 'asu', 'babi'];
const BAD_RE = new RegExp('\\b(' + BAD.join('|') + ')\\b', 'gi');

export function cleanText(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .replace(/(https?:\/\/|www\.)\S+/gi, '[tautan]')
    .replace(BAD_RE, m => m[0] + '*'.repeat(m.length - 1));
}

// satu room realtime (Taman, atau satu pesta rumah). cap = maks orang, label = nama tempat di pesan
export function createTaman({ store, map, cap = CAP, label = 'Taman', itemsOf = () => '', badgeOf = () => '' }) {
  let closed = false;
  const users = new Map();   // id -> orang di taman
  const conns = new Set();
  const chat = [];           // 30 pesan terakhir
  let nextId = 1;
  const walk = (x, y) => y >= 0 && y < map.h && x >= 0 && x < map.w && map.walk.includes(map.rows[y][x]);
  const pub = u => ({ id: u.id, name: u.name, v: u.v, seed: u.seed, x: u.x, y: u.y, items: u.items || '', b: u.b || '' });
  const send = (conn, obj) => conn.open && conn.send(JSON.stringify(obj));
  function broadcast(obj, except) {
    const s = JSON.stringify(obj);
    for (const u of users.values()) if (u !== except && u.conn.open) u.conn.send(s);
  }

  // detak: putuskan koneksi yang tidak membalas ping
  const beat = setInterval(() => {
    for (const c of conns) {
      if (!c.alive) { c.close(1001); continue; }
      c.alive = false; c.ping();
    }
  }, 25000).unref();

  function handle(conn) {
    conns.add(conn);
    let me = null;
    const times = [];
    const helloTimer = setTimeout(() => { if (!me) conn.close(1008); }, 8000);

    conn.on('message', raw => {
      const now = Date.now();
      times.push(now);
      while (times.length && now - times[0] > 1000) times.shift();
      if (times.length > 20) return conn.close(1008); // banjir pesan
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m !== 'object') return;

      if (!me) {
        if (m.t !== 'hello') return conn.close(1008);
        clearTimeout(helloTimer);
        if (closed) { send(conn, { t: 'err', m: `${label} sudah selesai.`, fatal: 1 }); return conn.close(4002); }
        if (users.size >= cap) { send(conn, { t: 'err', m: `${label} penuh. Coba lagi sebentar lagi.`, fatal: 1 }); return conn.close(1000); }
        const sess = m.token ? store.session(String(m.token)) : null;
        if (sess) for (const u of users.values()) {
          if (u.v && u.name === sess.username) { send(u.conn, { t: 'err', m: 'Kamu masuk dari tab lain.', fatal: 1 }); u.conn.close(4000); }
        }
        const sp = map.spawn[Math.floor(Math.random() * map.spawn.length)];
        me = {
          conn, id: nextId++,
          name: sess ? sess.username : 'tamu' + (1000 + Math.floor(Math.random() * 9000)),
          v: sess ? 1 : 0, muted: sess ? !!sess.muted : false,
          seed: sess ? 0 : Math.floor(Math.random() * 2 ** 32),
          x: sp[0], y: sp[1], lastSay: 0, lastEmote: 0,
          items: sess ? itemsOf(sess.username) : '',
          b: sess ? badgeOf(sess.username) : '',
        };
        users.set(me.id, me);
        send(conn, { t: 'welcome', you: pub(me), users: [...users.values()].map(pub), chat, tokenOk: !!sess || !m.token });
        broadcast({ t: 'join', u: pub(me) }, me);
        return;
      }

      if (m.t === 'move') {
        const x = m.x | 0, y = m.y | 0;
        if (!walk(x, y)) return;
        let fx = Math.round(+m.fx), fy = Math.round(+m.fy);
        if (!walk(fx, fy) || Math.abs(fx - me.x) + Math.abs(fy - me.y) > 40) { fx = me.x; fy = me.y; }
        me.x = x; me.y = y;
        broadcast({ t: 'move', id: me.id, x, y, fx, fy }, me);
      } else if (m.t === 'say') {
        if (!me.v) return send(conn, { t: 'err', m: 'Masuk sebagai warga untuk ikut ngobrol.' });
        if (me.muted) return send(conn, { t: 'err', m: 'Kamu sedang dibisukan admin.' });
        if (now - me.lastSay < 1500) return send(conn, { t: 'err', m: 'Pelan-pelan, tunggu sebentar.' });
        const text = cleanText(m.m);
        if (!text) return;
        me.lastSay = now;
        const msg = { t: 'say', id: me.id, name: me.name, m: text, ts: now };
        chat.push(msg); if (chat.length > 30) chat.shift();
        broadcast(msg);
      } else if (m.t === 'emote') {
        if (!EMOTES.includes(m.e) || now - me.lastEmote < 800) return;
        me.lastEmote = now;
        broadcast({ t: 'emote', id: me.id, e: m.e });
      }
    });

    conn.on('close', () => {
      clearTimeout(helloTimer);
      conns.delete(conn);
      if (me && users.get(me.id) === me) { users.delete(me.id); broadcast({ t: 'leave', id: me.id }); }
    });
  }

  return {
    handle,
    count: () => users.size,
    // dipanggil admin: keluarkan / bisukan warga yang sedang di taman
    kick(names) {
      for (const u of users.values()) if (u.v && names.includes(u.name)) { send(u.conn, { t: 'err', m: 'Kamu dikeluarkan dari taman.', fatal: 1 }); u.conn.close(4001); }
    },
    mute(names, on) {
      for (const u of users.values()) if (u.v && names.includes(u.name)) u.muted = !!on;
    },
    // tutup room: semua dipulangkan dengan pesan, room tidak menerima orang lagi
    // aksesori warga berubah (beli/pakai di dompet) → semua di room melihat tampilan baru
    setItems(name, items) {
      for (const u of users.values()) if (u.v && u.name === name) { u.items = items; broadcast({ t: 'look', id: u.id, items }); }
    },
    // lencana warga berubah → semua di room melihat ikon baru
    setBadge(name, b) {
      for (const u of users.values()) if (u.v && u.name === name) { u.b = b; broadcast({ t: 'badge', id: u.id, b }); }
    },
    close(msg) {
      closed = true;
      clearInterval(beat);
      for (const c of conns) { send(c, { t: 'err', m: msg, fatal: 1 }); c.close(4002); }
    },
  };
}
