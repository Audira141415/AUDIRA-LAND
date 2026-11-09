/* AUDIRA LAND · Balai Warga: Kartu Tanda Warga (KTW) + Buku Warga.
   Rumah, kerja, jabatan, level dihitung di sini dari /api/city + js/world.js (sama dengan kartu di peta).
   Lencana, juara, rekor dari /api/balai/warga. Kartu bisa diunduh sebagai PNG untuk feed/story IG. */
(function (AL) {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = AL.esc;
  const PER_PAGE = 50;
  const FONT = '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
  const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  const GAME = {
    nelayan: { name: 'Nelayan', unit: 'ikan', icon: '🎣' },
    petani: { name: 'Petani', unit: 'ikat padi', icon: '🌾' },
    kurir: { name: 'Kurir Pasar', unit: 'paket', icon: '📦' },
  };
  const C = { ink: '#14324a', ink2: '#4a6275', paper: '#fffaf0', paper2: '#f3ead8', sun: '#ffd166', teal: '#177a7a', coral: '#ff7a59', wave: '#7fcbd8', line: 'rgba(20,50,74,.14)' };

  let skew = 0;
  let lencanaPeta = {};            // username -> [ikon, nama] lencana yang dipakai (dari /api/city)
  let me = null;
  try { me = (localStorage.getItem('audira-taman-token') && localStorage.getItem('audira-taman-user')) || null; } catch (e) { me = null; }
  const now = () => Date.now() + skew;

  // ---------- data kota ----------
  async function loadCity() {
    const b = Math.floor(Date.now() / 15000);
    const r = await fetch('/api/city?b=' + b, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    skew = d.now - Date.now();
    const rows = d.residents.slice().sort((a, b) => a[0] - b[0]);
    for (const [seq, u, at] of rows) AL.addResident(u, at, seq);
    if (AL.applyLooks) AL.applyLooks(d.looks);
    lencanaPeta = d.lencana || {};
  }

  function info(res) {
    const t = now(), c = AL.career(res, t), pl = c.place;
    const home = res.home >= 0 ? AL.lots[res.home] : null;
    const dk = home ? home.district : (pl.lot >= 0 ? AL.lots[pl.lot].district : AL.district(pl.x, pl.y));
    return {
      u: res.u, seq: res.seq, no: 'AL-' + String(res.seq).padStart(6, '0'),
      title: c.title, lvl: c.lvl,
      kawasan: AL.DISTRICT[dk] || '—',
      rumah: home ? home.name : 'Antre rusun',
      alamat: home ? home.street + ' No. ' + home.num : 'Menunggu kavling kosong',
      kerja: pl.name, kerjaJenis: AL.LABEL[pl.kind] || 'Pelabuhan',
      lama: AL.fmtDur(Math.max(0, t - res.joined)), sejak: AL.fmtDate(res.joined),
    };
  }

  const balaiCache = new Map();
  async function loadBalai(u) {
    if (balaiCache.has(u)) return balaiCache.get(u);
    const r = await fetch('/api/balai/warga?u=' + encodeURIComponent(u), { signal: AbortSignal.timeout(8000) });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    balaiCache.set(u, d);
    return d;
  }

  let juaraList = null;
  async function loadJuara() {
    if (juaraList) return juaraList;
    const r = await fetch('/api/balai/juara', { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    juaraList = (d.list || []).map(j => ({ ...j, res: AL.byName.get(String(j.u).toLowerCase()) })).filter(j => j.res);
    return juaraList;
  }

  function status(text, kind) {
    const el = $('status');
    el.hidden = !text;
    el.className = 'msg' + (kind ? ' ' + kind : '');
    el.innerHTML = text || '';
  }

  // ================= BUKU WARGA =================
  const book = { tab: 'baru', q: '', shown: 0, list: [], scroll: 0 };
  let byNew = null, byLevel = null;

  function sortedNew() {
    return byNew || (byNew = AL.residents.slice().sort((a, b) => b.joined - a.joined || b.seq - a.seq));
  }
  function sortedLevel() {
    if (byLevel) return byLevel;
    const t = now();
    const lv = new Map(AL.residents.map(r => [r, AL.career(r, t).lvl]));
    byLevel = AL.residents.slice().sort((a, b) => lv.get(b) - lv.get(a) || a.joined - b.joined);
    return byLevel;
  }

  async function bookSource() {
    if (book.tab === 'level') return sortedLevel().map(res => ({ res }));
    if (book.tab === 'juara') return (await loadJuara()).map(j => ({ res: j.res, j }));
    return sortedNew().map(res => ({ res }));
  }

  function filterQ(items, q) {
    if (!q) return items;
    const exact = [], rest = [];
    for (const it of items) {
      const u = it.res.u.toLowerCase();
      if (u === q) exact.push(it); else if (u.includes(q)) rest.push(it);
    }
    return exact.concat(rest);
  }

  function rowSide(it) {
    if (it.j) {
      const parts = [];
      if (it.j.emas) parts.push('🥇' + it.j.emas);
      if (it.j.perak) parts.push('🥈' + it.j.perak);
      if (it.j.perunggu) parts.push('🥉' + it.j.perunggu);
      return parts.join(' ');
    }
    if (book.tab === 'level') return '';
    return esc(AL.fmtDur(Math.max(0, now() - it.res.joined))) + ' lalu';
  }

  function rowHtml(it, k) {
    const r = it.res, c = AL.career(r, now()), lc = lencanaPeta[r.u];
    const rank = book.tab !== 'baru' && !book.q ? `<span class="bl-rank">${k + 1}</span>` : '';
    return `<li><a class="bl-row" href="/balai.html?u=${encodeURIComponent(r.u)}" data-u="${esc(r.u)}">
      ${rank}<canvas width="88" height="88" aria-hidden="true"></canvas>
      <span class="bl-who"><b>@${esc(r.u)}</b>${lc ? ` <span class="bl-lc" title="${esc(lc[1])}">${esc(lc[0])}</span>` : ''}
        <small>${esc(c.title)} · <span class="bl-lv">Lv ${c.lvl}</span></small></span>
      <span class="bl-side">${rowSide(it)}</span></a></li>`;
  }

  function appendRows() {
    const ol = $('list'), from = book.shown, to = Math.min(book.list.length, from + PER_PAGE);
    if (to > from) {
      const tmp = document.createElement('ol');
      tmp.innerHTML = book.list.slice(from, to).map((it, k) => rowHtml(it, from + k)).join('');
      const items = Array.from(tmp.children);
      items.forEach((li, k) => AL.drawPortrait(li.querySelector('canvas').getContext('2d'), book.list[from + k].res.look, 88));
      ol.append(...items);
    }
    book.shown = to;
    $('more').hidden = book.shown >= book.list.length;
  }

  let renderSeq = 0;
  async function renderBook() {
    const mySeq = ++renderSeq;
    const note = $('listNote');
    note.hidden = true;
    let src;
    try { src = await bookSource(); }
    catch (e) {
      if (mySeq !== renderSeq) return;
      $('list').innerHTML = ''; $('more').hidden = true;
      note.hidden = false; note.textContent = 'Daftar juara belum bisa dimuat. Coba lagi sebentar.';
      return;
    }
    if (mySeq !== renderSeq) return;
    book.list = filterQ(src, book.q);
    book.shown = 0;
    $('list').innerHTML = '';
    if (!book.list.length) {
      note.hidden = false;
      note.textContent = book.q ? `Tidak ada warga dengan nama “${book.q}”.`
        : book.tab === 'juara' ? 'Belum ada juara kerja. Juara diumumkan tiap Senin.' : 'Belum ada warga.';
    } else if (book.tab === 'juara' && !book.q) {
      note.hidden = false; note.textContent = 'Urutan menurut jumlah juara 1, lalu juara 2 dan 3 papan kerja mingguan.';
    }
    appendRows();
  }

  function setTab(tab) {
    book.tab = tab;
    document.querySelectorAll('.bl-tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    renderBook();
  }

  function showBook() {
    document.title = 'Buku Warga · AUDIRA LAND';
    $('ktw').hidden = true;
    $('book').hidden = false;
    $('bookLead').textContent = `${AL.fmtInt(AL.residents.length)} warga tinggal di AUDIRA LAND. Ketuk nama untuk melihat Kartu Tanda Warga.`;
    const mine = me && AL.byName.get(me.toLowerCase());
    $('mine').hidden = !mine;
    if (mine) $('mine').href = '/balai.html?u=' + encodeURIComponent(mine.u);
    if (!book.list.length && !$('list').children.length) renderBook();
    requestAnimationFrame(() => window.scrollTo(0, book.scroll));
  }

  // ================= KARTU TANDA WARGA =================
  let cur = null;      // { res, info, balai }
  let fmt = 'feed';

  const markSvg = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4 27 26H5Z" fill="#ffd166"/><path d="M16 12 21.5 23h-11Z" fill="#14324a"/><path d="M3 27c4-2 7-2 10 0s7 2 10 0 5-1.5 6-1" stroke="#7fcbd8" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>';

  function wornBadge(d, u) {
    if (d && d.pakai) { const b = d.lencana.find(x => x.id === d.pakai); if (b) return [b.icon, b.name]; }
    return lencanaPeta[u] || null;
  }

  function cardHtml(I, d) {
    const worn = wornBadge(d, I.u);
    const mine = me && me.toLowerCase() === I.u.toLowerCase();
    return `
      <header class="ktw-head">
        <span class="mark">${markSvg}</span>
        <span class="ktw-org"><b>AUDIRA LAND</b><small>Kartu Tanda Warga</small></span>
        <span class="ktw-no">${esc(I.no)}</span>
      </header>
      <div class="ktw-main">
        <canvas class="ktw-photo" width="240" height="240" aria-label="Potret @${esc(I.u)}" role="img"></canvas>
        <div class="ktw-id">
          ${mine ? '<p class="ktw-me">Kartumu</p>' : ''}
          <h1 class="ktw-u">@${esc(I.u)}</h1>
          <p class="ktw-title">${esc(I.title)} <span class="lv">Lv ${I.lvl}</span></p>
          ${worn ? `<p class="ktw-worn"><span aria-hidden="true">${esc(worn[0])}</span> ${esc(worn[1])}</p>` : ''}
        </div>
      </div>
      <dl class="ktw-fields">
        <div><dt>Kawasan</dt><dd>${esc(I.kawasan)}</dd></div>
        <div><dt>Warga sejak</dt><dd>${esc(I.sejak)}</dd></div>
        <div><dt>Rumah</dt><dd>${esc(I.rumah)}<small>${esc(I.alamat)}</small></dd></div>
        <div><dt>Tempat kerja</dt><dd>${esc(I.kerja)}<small>${esc(I.kerjaJenis)}</small></dd></div>
        <div><dt>Lama tinggal</dt><dd>${esc(I.lama)}</dd></div>
        <div><dt>Nomor warga</dt><dd>${AL.fmtInt(I.seq)}</dd></div>
      </dl>
      <footer class="ktw-foot">
        <canvas class="ktw-bar" width="360" height="56" aria-hidden="true"></canvas>
        <span class="ktw-stamp" aria-label="Warga tercatat">✓ Tercatat</span>
      </footer>`;
  }

  function extraHtml(d) {
    if (d === undefined) return '<p class="bl-note">Memuat lencana dan rekor…</p>';
    if (d === null) return '<p class="bl-note">Lencana dan rekor belum bisa dimuat.</p>';
    const lc = d.lencana.length
      ? `<ul class="bl-badges">${d.lencana.map(b => `<li class="${b.id === d.pakai ? 'on' : ''}"><span class="ic" aria-hidden="true">${esc(b.icon)}</span><span>${esc(b.name)}</span>${b.id === d.pakai ? '<small>dipakai</small>' : ''}</li>`).join('')}</ul>`
      : '<p class="bl-note">Belum punya lencana. Lencana didapat dari kerja, absen, dan lama tinggal.</p>';
    const j = d.juara || {};
    const juara = `<ul class="bl-medals">
      <li><span aria-hidden="true">🥇</span><b>${j.emas || 0}</b><small>Juara 1</small></li>
      <li><span aria-hidden="true">🥈</span><b>${j.perak || 0}</b><small>Juara 2</small></li>
      <li><span aria-hidden="true">🥉</span><b>${j.perunggu || 0}</b><small>Juara 3</small></li></ul>`;
    const rek = `<ul class="bl-rekor">${Object.entries(GAME).map(([k, g]) => {
      const v = d.rekor && d.rekor[k];
      return `<li><span aria-hidden="true">${g.icon}</span><span>${esc(g.name)}</span><b>${v ? AL.fmtInt(v) + ' <small>' + esc(g.unit) + '</small>' : '<small>belum ada</small>'}</b></li>`;
    }).join('')}</ul>`;
    return `
      <section class="bl-box"><h2>Lencana <small>${d.lencana.length}</small></h2>${lc}</section>
      <section class="bl-box"><h2>Juara kerja mingguan</h2>${juara}</section>
      <section class="bl-box"><h2>Rekor skor kerja</h2>${rek}<a class="link" href="/kerja.html">Kerja sekarang →</a></section>`;
  }

  function drawBarcode(c, u, w, h, col) {
    const r = AL.rng(AL.hash32('ktw:' + u));
    c.fillStyle = col;
    let x = 0;
    while (x < w) {
      const bw = 1 + Math.floor(r() * 3) * (w / 180);
      if (r() < 0.62) c.fillRect(x, 0, bw, h);
      x += bw + w / 180;
    }
  }

  async function showKtw(raw) {
    const u = String(raw).trim().replace(/^@+/, '').toLowerCase();
    if (!$('book').hidden) book.scroll = window.scrollY;
    $('book').hidden = true;
    const res = AL.byName.get(u);
    if (!res) {
      $('ktw').hidden = true;
      document.title = 'Warga tidak ditemukan · AUDIRA LAND';
      status(`Warga <b>@${esc(u)}</b> belum ada di AUDIRA LAND. <a class="link" href="/balai.html">Buka Buku Warga</a>`, 'err');
      return;
    }
    status('');
    const I = info(res);
    cur = { res, info: I, balai: undefined };
    document.title = `@${res.u} · Kartu Tanda Warga · AUDIRA LAND`;
    $('ktw').hidden = false;
    $('shareMsg').hidden = true;
    $('card').innerHTML = cardHtml(I, null);
    paintCard();
    $('extra').innerHTML = extraHtml(undefined);
    window.scrollTo(0, 0);
    let d = null;
    try { d = await loadBalai(res.u); } catch (e) { d = null; }
    if (!cur || cur.res !== res) return;
    cur.balai = d;
    $('card').innerHTML = cardHtml(I, d);
    paintCard();
    $('extra').innerHTML = extraHtml(d);
  }

  function paintCard() {
    const card = $('card');
    AL.drawPortrait(card.querySelector('.ktw-photo').getContext('2d'), cur.res.look, 240);
    const bar = card.querySelector('.ktw-bar'), bc = bar.getContext('2d');
    drawBarcode(bc, cur.res.u, bar.width, bar.height, C.ink);
  }

  // ---------- gambar untuk Instagram ----------
  function setFont(c, size, weight) { c.font = `${weight} ${size}px ${FONT}`; }
  // kecilkan huruf sampai muat; kalau sudah minimum, potong dengan …
  function fitText(c, text, maxW, size, weight, min) {
    let s = size;
    setFont(c, s, weight);
    while (s > min && c.measureText(text).width > maxW) { s -= 2; setFont(c, s, weight); }
    if (c.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && c.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }
  function drawText(c, text, x, y, maxW, size, weight, color, min, align) {
    const t = fitText(c, String(text), maxW, size, weight, min || Math.round(size * 0.6));
    c.fillStyle = color; c.textAlign = align || 'left';
    c.fillText(t, x, y);
  }
  function drawMark(c, x, y, s) {
    const k = s / 32;
    c.save(); c.translate(x, y); c.scale(k, k);
    c.fillStyle = C.sun; c.beginPath(); c.moveTo(16, 4); c.lineTo(27, 26); c.lineTo(5, 26); c.closePath(); c.fill();
    c.fillStyle = C.ink; c.beginPath(); c.moveTo(16, 12); c.lineTo(21.5, 23); c.lineTo(10.5, 23); c.closePath(); c.fill();
    c.strokeStyle = C.wave; c.lineWidth = 2.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(3, 27); c.bezierCurveTo(7, 25, 10, 25, 13, 27); c.bezierCurveTo(16, 29, 20, 29, 23, 27); c.bezierCurveTo(26, 25, 28, 25.5, 29, 26); c.stroke();
    c.restore();
  }
  function rrect(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }

  async function fontsReady() {
    try {
      await Promise.race([
        Promise.all(['800 40px "Plus Jakarta Sans"', '700 40px "Plus Jakarta Sans"', '600 40px "Plus Jakarta Sans"'].map(f => document.fonts.load(f))),
        new Promise(r => setTimeout(r, 2500)),
      ]);
    } catch (e) { /* pakai font cadangan */ }
  }

  async function drawShare(kind) {
    await fontsReady();
    const story = kind === 'story';
    const W = 1080, H = story ? 1920 : 1350;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const I = cur.info, d = cur.balai || null, u = cur.res.u;
    c.textBaseline = 'alphabetic';

    // latar: navy dengan garis ombak tipis
    c.fillStyle = C.ink; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(127,203,216,.10)'; c.lineWidth = 4; c.lineCap = 'round';
    for (let y = 40; y < H; y += 70) {
      c.beginPath();
      for (let x = -40; x <= W + 40; x += 120) { c.moveTo(x, y); c.quadraticCurveTo(x + 30, y - 14, x + 60, y); c.quadraticCurveTo(x + 90, y + 14, x + 120, y); }
      c.stroke();
    }

    const M = 60, CW = W - M * 2;
    // tinggi kartu untuk menempatkan semua blok di tengah
    const HEAD = 130, PAD = 44, PH = story ? 300 : 250, ROW = 112, LC = 120, FOOT = 96;
    const cardH = HEAD + PAD + PH + 36 + ROW * 3 + 12 + LC + FOOT;
    const brandH = 110, footH = 90, extraH = story ? 300 : 0;
    const safeTop = story ? 200 : 50, safeBot = story ? 220 : 40;
    const free = H - safeTop - safeBot - brandH - cardH - extraH - footH;
    const gap = Math.max(24, free / (story ? 4 : 3));
    let y = safeTop + (story ? gap : gap * 0.5);

    // baris merek
    drawMark(c, M, y, 84);
    drawText(c, 'AUDIRA LAND', M + 104, y + 46, 520, 46, 800, C.paper);
    drawText(c, 'Balai Warga · Pulau warga Instagram', M + 104, y + 84, 620, 26, 600, 'rgba(255,250,240,.72)');
    y += brandH + gap * 0.6;

    // kartu
    const cx = M, cy = y;
    c.save();
    c.shadowColor = 'rgba(0,0,0,.28)'; c.shadowBlur = 40; c.shadowOffsetY = 16;
    c.fillStyle = C.paper; rrect(c, cx, cy, CW, cardH, 36); c.fill();
    c.restore();
    c.save(); rrect(c, cx, cy, CW, cardH, 36); c.clip();
    // pita kepala kuning
    c.fillStyle = C.sun; c.fillRect(cx, cy, CW, HEAD);
    c.fillStyle = C.ink; c.fillRect(cx, cy + HEAD - 8, CW, 8);
    drawMark(c, cx + 36, cy + 26, 76);
    drawText(c, 'KARTU TANDA WARGA', cx + 128, cy + 62, 520, 36, 800, C.ink);
    drawText(c, 'Pulau AUDIRA LAND', cx + 128, cy + 98, 520, 26, 600, C.ink2);
    drawText(c, I.no, cx + CW - 36, cy + 80, 280, 34, 800, C.ink, 22, 'right');
    // motif garis halus di badan kartu
    c.strokeStyle = 'rgba(20,50,74,.045)'; c.lineWidth = 2;
    for (let k = -cardH; k < CW; k += 26) { c.beginPath(); c.moveTo(cx + k, cy + cardH); c.lineTo(cx + k + cardH, cy + HEAD); c.stroke(); }
    c.restore();

    // potret
    let by = cy + HEAD + PAD;
    const px = cx + 44;
    const pc = document.createElement('canvas'); pc.width = PH; pc.height = PH;
    AL.drawPortrait(pc.getContext('2d'), cur.res.look, PH);
    c.fillStyle = C.ink; c.beginPath(); c.arc(px + PH / 2, by + PH / 2, PH / 2 + 8, 0, Math.PI * 2); c.fill();
    c.drawImage(pc, px, by);
    pc.width = 0;

    // identitas
    const ix = px + PH + 40, iw = cx + CW - 44 - ix;
    let iy = by + (story ? 70 : 56);
    const mine = me && me.toLowerCase() === u.toLowerCase();
    drawText(c, '@' + u, ix, iy + 20, iw, 64, 800, C.ink, 30);
    iy += 66;
    drawText(c, I.title, ix, iy + 16, iw, 36, 700, C.ink2, 24);
    iy += 34;
    // pil level
    setFont(c, 30, 800);
    const lvTxt = 'Lv ' + I.lvl, lvW = c.measureText(lvTxt).width + 40;
    c.fillStyle = C.ink; rrect(c, ix, iy, lvW, 52, 26); c.fill();
    c.fillStyle = C.sun; c.textAlign = 'left'; c.fillText(lvTxt, ix + 20, iy + 37);
    const worn = wornBadge(d, u);
    if (worn) {
      const bx = ix + lvW + 14, bw = Math.max(0, iw - lvW - 14);
      c.fillStyle = C.paper2; rrect(c, bx, iy, bw, 52, 26); c.fill();
      c.font = `30px ${EMOJI}`; c.fillStyle = C.ink; c.fillText(worn[0], bx + 14, iy + 37);
      drawText(c, worn[1], bx + 60, iy + 36, bw - 76, 26, 700, C.ink, 18);
    }
    if (mine) { iy += 70; drawText(c, 'Ini kartuku!', ix, iy + 22, iw, 26, 800, C.teal); }

    // kolom data
    by += PH + 36;
    c.fillStyle = C.line; c.fillRect(cx + 44, by - 14, CW - 88, 2);
    const colW = (CW - 88 - 32) / 2;
    const fields = [
      ['KAWASAN', I.kawasan, ''], ['WARGA SEJAK', I.sejak, ''],
      ['RUMAH', I.rumah, I.alamat], ['TEMPAT KERJA', I.kerja, I.kerjaJenis],
      ['LAMA TINGGAL', I.lama, ''], ['JUARA KERJA', d ? juaraText(d.juara) : '—', ''],
    ];
    fields.forEach(([lab, val, sub], k) => {
      const fx = cx + 44 + (k % 2) * (colW + 32), fy = by + Math.floor(k / 2) * ROW;
      drawText(c, lab, fx, fy + 26, colW, 22, 800, C.ink2, 16);
      drawText(c, val, fx, fy + 66, colW, 36, 800, C.ink, 22);
      if (sub) drawText(c, sub, fx, fy + 98, colW, 24, 600, C.ink2, 16);
    });
    by += ROW * 3 + 12;

    // lencana
    c.fillStyle = C.line; c.fillRect(cx + 44, by - 8, CW - 88, 2);
    drawText(c, 'LENCANA', cx + 44, by + 32, 300, 22, 800, C.ink2);
    const icons = d ? d.lencana.map(b => b.icon) : [];
    if (icons.length) {
      const S = 64, maxN = Math.floor((CW - 88) / (S + 10));
      c.font = `${S * 0.66}px ${EMOJI}`; c.textAlign = 'center';
      icons.slice(0, maxN).forEach((ic, k) => {
        const ex = cx + 44 + k * (S + 10);
        c.fillStyle = C.paper2; c.beginPath(); c.arc(ex + S / 2, by + 48 + S / 2, S / 2, 0, Math.PI * 2); c.fill();
        c.fillStyle = C.ink; c.fillText(ic, ex + S / 2, by + 48 + S * 0.7);
      });
      c.textAlign = 'left';
    } else {
      drawText(c, 'Belum ada lencana', cx + 44, by + 90, CW - 88, 30, 700, C.ink2);
    }
    by += LC;

    // kaki kartu: kode garis + cap
    c.fillStyle = C.line; c.fillRect(cx + 44, by, CW - 88, 2);
    c.save(); c.translate(cx + 44, by + 24); drawBarcode(c, u, 380, 48, C.ink); c.restore();
    c.save();
    const sx = cx + CW - 44 - 220, sy = by + 20;
    c.strokeStyle = C.teal; c.lineWidth = 4; rrect(c, sx, sy, 220, 56, 28); c.stroke();
    drawText(c, '✓ TERCATAT', sx + 110, sy + 38, 190, 26, 800, C.teal, 18, 'center');
    c.restore();

    y = cy + cardH + gap * 0.6;

    // story: rekor & juara di bawah kartu
    if (story) {
      c.fillStyle = 'rgba(255,250,240,.08)'; rrect(c, M, y, CW, extraH - 20, 32); c.fill();
      drawText(c, 'Rekor skor kerja', M + 40, y + 60, CW - 80, 30, 800, C.sun);
      Object.entries(GAME).forEach(([k, g], i) => {
        const gx = M + 40 + i * ((CW - 80) / 3), gw = (CW - 80) / 3 - 20;
        const v = d && d.rekor && d.rekor[k];
        c.font = `44px ${EMOJI}`; c.fillStyle = C.paper; c.textAlign = 'left'; c.fillText(g.icon, gx, y + 140);
        drawText(c, v ? AL.fmtInt(v) : '—', gx + 64, y + 140, gw - 64, 48, 800, C.paper, 26);
        drawText(c, g.name + (v ? ' · ' + g.unit : ''), gx, y + 190, gw, 24, 600, 'rgba(255,250,240,.75)', 16);
      });
      drawText(c, 'Juara: ' + (d ? juaraText(d.juara) : '—'), M + 40, y + 248, CW - 80, 26, 700, 'rgba(255,250,240,.85)', 18);
      y += extraH + gap * 0.4;
    }

    // alamat situs
    const host = location.host || 'audira land';
    drawText(c, host + '/balai.html', W / 2, y + 40, W - 2 * M, 34, 800, C.sun, 22, 'center');
    drawText(c, 'Cari namamu di Buku Warga', W / 2, y + 82, W - 2 * M, 26, 600, 'rgba(255,250,240,.75)', 18, 'center');
    return cv;
  }

  function juaraText(j) {
    if (!j) return '—';
    const p = [];
    if (j.emas) p.push(j.emas + '× 🥇');
    if (j.perak) p.push(j.perak + '× 🥈');
    if (j.perunggu) p.push(j.perunggu + '× 🥉');
    return p.length ? p.join('  ') : 'Belum pernah';
  }

  function shareMsg(text, kind) {
    const m = $('shareMsg');
    m.hidden = !text; m.className = 'msg' + (kind ? ' ' + kind : ''); m.textContent = text || '';
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.hidden = true;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function unduh() {
    if (!cur) return;
    const btn = $('dl'), kind = fmt, u = cur.res.u;
    btn.disabled = true;
    shareMsg('Menggambar kartu…');
    try {
      const cv = await drawShare(kind);
      const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
      cv.width = 0; cv.height = 0;
      if (!blob) throw new Error('Gagal membuat gambar');
      const name = `ktw-${u}-${kind}.png`;
      const link = location.origin + '/balai.html?u=' + u;
      const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
      let file = null;
      try { file = new File([blob], name, { type: 'image/png' }); } catch (e) { file = null; }
      if (touch && file && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Kartu Tanda Warga AUDIRA LAND', text: `Aku warga AUDIRA LAND! @${u} · ${link}` });
          shareMsg('Kartu siap dibagikan. Jangan lupa tag @audira!', 'ok');
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') { shareMsg(''); return; }
          // gagal berbagi: lanjut unduh
        }
      }
      download(blob, name);
      shareMsg(kind === 'story' ? 'Gambar story (1080×1920) terunduh.' : 'Gambar feed (1080×1350) terunduh.', 'ok');
    } catch (e) {
      shareMsg('Kartu belum bisa dibuat: ' + e.message, 'err');
    } finally { btn.disabled = false; }
  }

  async function salin() {
    if (!cur) return;
    const link = location.origin + '/balai.html?u=' + cur.res.u;
    try {
      await navigator.clipboard.writeText(link);
    } catch (e) {
      const t = document.createElement('textarea');
      t.value = link; t.setAttribute('readonly', ''); t.className = 'bl-offscreen';
      document.body.appendChild(t); t.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      t.remove();
      if (!ok) { shareMsg('Salin manual: ' + link); return; }
    }
    shareMsg('Tautan tersalin: ' + link, 'ok');
  }

  // ================= RUTE =================
  function route() {
    const u = new URLSearchParams(location.search).get('u');
    if (u) showKtw(u);
    else { cur = null; status(''); showBook(); }
  }
  function go(href) {
    const url = new URL(href, location.href);
    if (url.pathname !== '/balai.html' || url.origin !== location.origin) { location.href = href; return; }
    if (!$('book').hidden) book.scroll = window.scrollY;
    history.pushState(null, '', url.pathname + url.search);
    route();
  }

  function bind() {
    document.addEventListener('click', e => {
      const a = e.target.closest && e.target.closest('a[href^="/balai.html"]');
      if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
      e.preventDefault();
      go(a.getAttribute('href'));
    });
    window.addEventListener('popstate', route);
    document.querySelectorAll('.bl-tabs button').forEach(b => b.addEventListener('click', () => { if (b.dataset.tab !== book.tab) setTab(b.dataset.tab); }));
    let qt = 0;
    $('q').addEventListener('input', () => {
      clearTimeout(qt);
      qt = setTimeout(() => { book.q = $('q').value.trim().toLowerCase().replace(/^@+/, ''); renderBook(); }, 160);
    });
    $('searchForm').addEventListener('submit', e => {
      e.preventDefault();
      const q = $('q').value.trim().toLowerCase().replace(/^@+/, '');
      if (q && AL.byName.has(q)) go('/balai.html?u=' + encodeURIComponent(AL.byName.get(q).u));
      else { book.q = q; renderBook(); }
    });
    $('more').addEventListener('click', appendRows);
    document.querySelectorAll('.bl-fmt button').forEach(b => b.addEventListener('click', () => {
      fmt = b.dataset.fmt;
      document.querySelectorAll('.bl-fmt button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    }));
    $('dl').addEventListener('click', unduh);
    $('copy').addEventListener('click', salin);
  }

  async function boot() {
    bind();
    try { await loadCity(); }
    catch (e) {
      status('Balai Warga belum bisa dibuka: server kota tidak terjangkau. Coba muat ulang sebentar lagi.', 'err');
      return;
    }
    route();
  }
  boot();
})(window.AL);
