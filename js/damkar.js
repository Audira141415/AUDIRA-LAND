/* AUDIRA LAND · event kebakaran bersama (klien).
   Polling GET /api/damkar (3 dtk saat ada api, 30 dtk bila tidak). Banner "Kebakaran di …" memfokuskan kamera,
   tombol Siram mengumpulkan ketukan lalu dikirim tiap ±2 dtk (server membatasi 8/dtk per warga).
   Peta: api + asap di kavling yang terbakar, bekas gosong 2 jam bila gagal dipadamkan. */
(function (AL) {
  'use strict';
  const RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SEEN = 'audira-damkar-lihat';
  const MAX_TAP_S = 10; // ketukan lebih cepat dari ini diabaikan di klien
  let st = { aktif: null, hangus: [], selesai: null };
  let skew = 0, pending = 0, sending = false, pollT = 0, flushT = 0;
  let el = null;
  const splashes = []; // { t0 } percikan air lokal
  const taps = [];

  const token = () => { try { return localStorage.getItem('audira-taman-token') || ''; } catch (e) { return ''; } };
  const auth = () => { const t = token(); return t ? { Authorization: 'Bearer ' + t } : {}; };
  const srvNow = () => Date.now() + skew;

  function focusLot(i) {
    const lot = AL.lots[i];
    if (!lot) return;
    if (AL.focusLot) AL.focusLot(i);
    else { AL.focus = { lot: i }; AL.flyTo(lot.x + 1, lot.y + 1, 0, 1.7); }
  }

  // ---------- jaringan ----------
  async function poll() {
    clearTimeout(pollT);
    try {
      const r = await fetch('/api/damkar', { headers: auth(), signal: AbortSignal.timeout(6000) });
      if (r.ok) apply(await r.json());
    } catch (e) { /* server sibuk: coba lagi nanti */ }
    pollT = setTimeout(poll, st.aktif && !document.hidden ? 3000 : 30000);
  }
  function apply(d) {
    skew = d.now - Date.now();
    const a = d.aktif;
    if (a && st.aktif && st.aktif.id === a.id) {
      // jangan mundurkan angka optimistis yang belum terkirim
      a.total += pending; a.mine += pending;
    }
    st = { aktif: a || null, hangus: d.hangus || [], selesai: d.selesai || null };
    render();
  }
  async function flush() {
    if (sending || !pending || !st.aktif) return;
    sending = true;
    const n = Math.min(pending, 64), id = st.aktif.id;
    pending -= n;
    try {
      const r = await fetch('/api/damkar/siram', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify({ id, n }), signal: AbortSignal.timeout(6000),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) apply(j);
      else if (r.status === 401 || r.status === 403) { pending = 0; note(j.error || 'Masuk sebagai warga dulu (kode KTW).'); }
    } catch (e) { pending += n; } // gagal kirim: coba lagi pada kiriman berikutnya
    sending = false;
  }

  // ---------- banner ----------
  function build() {
    el = document.createElement('section');
    el.className = 'dmk';
    el.hidden = true;
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `
      <button type="button" class="dmk-go"><span class="dmk-ico" aria-hidden="true">🔥</span><span class="dmk-txt"></span><span class="dmk-time"></span></button>
      <div class="dmk-bar" role="progressbar" aria-label="Api yang sudah padam" aria-valuemin="0" aria-valuemax="100"><i></i></div>
      <div class="dmk-row"><span class="dmk-count"></span><button type="button" class="btn sm dmk-siram">💧 Siram</button></div>
      <button type="button" class="dmk-x" aria-label="Tutup" hidden>×</button>`;
    document.body.appendChild(el);
    el.querySelector('.dmk-go').addEventListener('click', () => {
      const f = st.aktif || st.selesai;
      if (f) focusLot(f.lot);
    });
    el.querySelector('.dmk-siram').addEventListener('click', siram);
    el.querySelector('.dmk-x').addEventListener('click', () => { if (st.selesai) tandai(st.selesai.id); el.hidden = true; });
  }
  function note(t) {
    const c = el && el.querySelector('.dmk-count');
    if (c) { c.textContent = t; c.classList.add('warn'); }
  }
  function sudahLihat(id) { try { return localStorage.getItem(SEEN) === String(id); } catch (e) { return false; } }
  function tandai(id) { try { localStorage.setItem(SEEN, String(id)); } catch (e) { /* abaikan */ } }

  function render() {
    if (!el) return;
    const a = st.aktif, d = st.selesai;
    const txt = el.querySelector('.dmk-txt'), btn = el.querySelector('.dmk-siram'), cnt = el.querySelector('.dmk-count');
    const bar = el.querySelector('.dmk-bar'), x = el.querySelector('.dmk-x'), go = el.querySelector('.dmk-go');
    cnt.classList.remove('warn');
    if (a) {
      el.hidden = false; el.className = 'dmk on';
      go.querySelector('.dmk-ico').textContent = '🔥';
      txt.innerHTML = 'Kebakaran di <b>' + AL.esc(a.name) + '</b>! Bantu padamkan';
      const p = Math.min(100, Math.round((a.total / Math.max(1, a.target)) * 100));
      bar.hidden = false; bar.querySelector('i').style.width = p + '%'; bar.setAttribute('aria-valuenow', p);
      const login = !!token();
      btn.hidden = false;
      btn.textContent = login ? '💧 Siram' : 'Masuk untuk menyiram';
      cnt.textContent = p + '% padam · ' + AL.fmtInt(a.helpers) + ' penolong' + (a.mine ? ' · kamu ' + AL.fmtInt(a.mine) + '×' : '');
      x.hidden = true;
      tick();
      return;
    }
    if (d && !sudahLihat(d.id)) {
      el.hidden = false; el.className = 'dmk ' + (d.status === 'padam' ? 'ok' : 'gagal');
      go.querySelector('.dmk-ico').textContent = d.status === 'padam' ? '🚒' : '💨';
      txt.innerHTML = d.status === 'padam'
        ? 'Api di <b>' + AL.esc(d.name) + '</b> padam! Terima kasih, ' + AL.fmtInt(d.helpers) + ' penolong.'
        : 'Api di <b>' + AL.esc(d.name) + '</b> tidak sempat padam. Bangunan pulih dalam 2 jam.';
      el.querySelector('.dmk-time').textContent = '';
      bar.hidden = true; btn.hidden = true; x.hidden = false;
      cnt.textContent = d.koin ? 'Kamu dapat ' + AL.fmtKoin(d.koin) + ' (menyiram ' + AL.fmtInt(d.mine) + '×).' : d.mine ? 'Kamu ikut menyiram ' + AL.fmtInt(d.mine) + '×.' : '';
      return;
    }
    el.hidden = true;
  }
  function tick() {
    if (!el || !st.aktif) return;
    const s = Math.max(0, Math.ceil((st.aktif.endsAt - srvNow()) / 1000));
    el.querySelector('.dmk-time').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function siram() {
    const a = st.aktif;
    if (!a) return;
    if (!token()) { const j = document.getElementById('join'); if (j) j.click(); return; }
    const now = performance.now();
    while (taps.length && now - taps[0] > 1000) taps.shift();
    if (taps.length >= MAX_TAP_S) return;
    taps.push(now);
    pending++; a.total++; a.mine++;
    splashes.push({ t0: performance.now() / 1000, r: Math.random() });
    if (splashes.length > 24) splashes.shift();
    const p = Math.min(100, Math.round((a.total / Math.max(1, a.target)) * 100));
    el.querySelector('.dmk-bar i').style.width = p + '%';
    el.querySelector('.dmk-count').textContent = p + '% padam · ' + AL.fmtInt(a.helpers) + ' penolong · kamu ' + AL.fmtInt(a.mine) + '×';
  }

  // ---------- gambar di peta ----------
  const inView = (x, y, vw, vh, m) => x > -m && y > -m && x < vw + m && y < vh + m;
  function flame(ctx, x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.bezierCurveTo(x - w, y - h * 0.5, x - w * 0.2, y - h * 0.7, x, y - h);
    ctx.bezierCurveTo(x + w * 0.2, y - h * 0.7, x + w, y - h * 0.5, x + w, y);
    ctx.closePath(); ctx.fill();
  }
  function drawFire(ctx, toScr, z, t, vw, vh, night) {
    const a = st.aktif, lot = a && AL.lots[a.lot];
    if (!lot) return;
    const h = lot.hTop || 1.2;
    const [x, y] = toScr(lot.x + 1, lot.y + 1, h * 0.85);
    const s = AL.clamp(z, 0.3, 2.4);
    if (!inView(x, y, vw, vh, 140 * s)) return;
    const left = AL.clamp(1 - a.total / Math.max(1, a.target), 0.15, 1); // api mengecil saat disiram
    const T = RM ? 0 : t;
    // cahaya
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const R = 70 * s * (0.6 + 0.4 * left) * (1 + Math.sin(T * 9) * 0.05);
    const g = ctx.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, 'rgba(255,150,60,' + (0.35 + 0.35 * night).toFixed(2) + ')'); g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // asap naik
    for (let i = 0; i < 6; i++) {
      const k = ((T * 0.35 + i / 6) % 1);
      const sx = x + Math.sin(i * 2.1 + T * 0.8) * 8 * s + k * 26 * s, sy = y - 26 * s - k * 90 * s;
      ctx.fillStyle = 'rgba(70,70,76,' + (0.42 * (1 - k)).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(sx, sy, (6 + k * 16) * s, 0, Math.PI * 2); ctx.fill();
    }
    // lidah api
    const n = 5;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 7 * s;
      const fl = 0.75 + 0.25 * Math.sin(T * 11 + i * 1.7) + 0.1 * Math.sin(T * 23 + i);
      const hh = (24 + (i % 2) * 10) * s * fl * left;
      flame(ctx, x + off, y + 4 * s, 6 * s, hh, '#e8402a');
      flame(ctx, x + off, y + 4 * s, 4 * s, hh * 0.72, '#ff9a2e');
      flame(ctx, x + off, y + 4 * s, 2.2 * s, hh * 0.42, '#ffe08a');
    }
    // percikan air dari ketukan sendiri
    const now = performance.now() / 1000;
    for (let i = splashes.length - 1; i >= 0; i--) {
      const sp = splashes[i], k = (now - sp.t0) / 0.6;
      if (k >= 1) { splashes.splice(i, 1); continue; }
      const sx = x + (sp.r - 0.5) * 40 * s, top = y - 110 * s;
      if (k < 0.6) {
        const yy = top + (y - top) * (k / 0.6);
        ctx.fillStyle = 'rgba(120,200,240,.9)';
        ctx.beginPath(); ctx.ellipse(sx, yy, 2.4 * s, 4.5 * s, 0, 0, Math.PI * 2); ctx.fill();
      } else {
        const q = (k - 0.6) / 0.4;
        ctx.strokeStyle = 'rgba(200,235,255,' + (1 - q).toFixed(2) + ')'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(sx, y, (4 + q * 12) * s, (2 + q * 5) * s, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }
  function drawHangus(ctx, toScr, z, t, vw, vh) {
    for (const b of st.hangus) {
      if (st.aktif && st.aktif.lot === b.lot) continue;
      const lot = AL.lots[b.lot];
      if (!lot) continue;
      const [gx, gy] = toScr(lot.x + 1, lot.y + 1, 0);
      const s = z;
      if (!inView(gx, gy, vw, vh, 90 * s)) continue;
      const h = lot.hTop || 1.2;
      const [, ty] = toScr(lot.x + 1, lot.y + 1, h);
      // jelaga di tanah + bangunan menghitam
      const gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, 46 * s);
      gr.addColorStop(0, 'rgba(30,22,16,.62)'); gr.addColorStop(1, 'rgba(30,22,16,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.ellipse(gx, gy, 46 * s, 23 * s, 0, 0, Math.PI * 2); ctx.fill();
      const my = (gy + ty) / 2, rh = Math.max(10 * s, (gy - ty) / 2);
      const gb = ctx.createRadialGradient(gx, my, 0, gx, my, 30 * s);
      gb.addColorStop(0, 'rgba(26,18,12,.58)'); gb.addColorStop(1, 'rgba(26,18,12,0)');
      ctx.fillStyle = gb;
      ctx.beginPath(); ctx.ellipse(gx, my, 30 * s, rh, 0, 0, Math.PI * 2); ctx.fill();
      // asap tipis sisa
      if (!RM) for (let i = 0; i < 2; i++) {
        const k = ((t * 0.2 + i / 2) % 1);
        ctx.fillStyle = 'rgba(90,90,96,' + (0.25 * (1 - k)).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(gx + k * 16 * s, ty - 10 * s - k * 50 * s, (4 + k * 9) * s, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  AL.overlays.push((ctx, toScr, z, t, vw, vh, night) => {
    if (st.hangus.length) drawHangus(ctx, toScr, z, t, vw, vh);
    if (st.aktif) drawFire(ctx, toScr, z, t, vw, vh, night);
  });

  AL.damkar = { state: () => st, focus: focusLot };
  AL.onBoot.push(() => {
    build();
    poll();
    setInterval(tick, 1000);
    flushT = setInterval(flush, 2000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
    window.addEventListener('pagehide', () => { clearInterval(flushT); });
  });
})(window.AL);
