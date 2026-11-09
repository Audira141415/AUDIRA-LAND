/* AUDIRA LAND · Radio AUDIRA FM 99,1
   - Lagu generatif lo-fi disintesis WebAudio di perangkat (tanpa file, tanpa hak cipta pihak lain).
   - Lagu unggahan admin (MP3) diputar dari /media.
   - Semua pendengar sinkron: posisi siaran = (jam server − epoch) mod panjang putaran.
   - Penyiar: suara sintetis peramban (id-ID) membacakan jam, kabar, acara, warga baru, sponsor. */
(function (AL) {
  'use strict';
  const STATION = 'AUDIRA FM 99,1';
  const LS = 'audira-radio';
  let skew = 0;
  const now = () => (AL.now ? AL.now() : Date.now() + skew);

  // ---------- preferensi (per perangkat) ----------
  let prefs = { vol: 0.7, penyiar: true };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) { /* abaikan */ }
  const savePrefs = () => { try { localStorage.setItem(LS, JSON.stringify(prefs)); } catch (e) { /* abaikan */ } };

  // ---------- jadwal / rotasi ----------
  let conf = { epoch: Date.UTC(2026, 10, 1), gen: 6, songLen: 150, announcer: true, every: 4, tracks: [] };
  let rot = null;
  function buildRot() {
    const items = [], T = conf.tracks.length;
    const G = conf.gen || T ? conf.gen : 1; // tanpa lagu unggahan & gen=0 → tetap 1 lagu generatif
    for (let i = 0; i < Math.max(G, T); i++) {
      if (i < G) items.push({ kind: 'gen', k: i, len: conf.songLen });
      if (i < T) items.push({ kind: 'track', ...conf.tracks[i], len: conf.tracks[i].duration });
    }
    if (!items.length) items.push({ kind: 'gen', k: 0, len: conf.songLen });
    rot = { items, cycle: items.reduce((s, it) => s + it.len, 0) };
  }
  function at(ms) {
    const s = (ms - conf.epoch) / 1000, cyc = Math.floor(s / rot.cycle);
    let pos = s - cyc * rot.cycle;
    for (let i = 0; i < rot.items.length; i++) {
      const it = rot.items[i];
      if (pos < it.len) return { it, i, cyc, offset: pos, start: ms - pos * 1000, end: ms + (it.len - pos) * 1000 };
      pos -= it.len;
    }
    return { it: rot.items[0], i: 0, cyc, offset: 0, start: ms, end: ms + rot.items[0].len * 1000 };
  }
  const nextItem = c => rot.items[(c.i + 1) % rot.items.length];

  // ---------- parameter lagu generatif ----------
  const CH = { I: [0, 4, 7, 11], ii: [2, 5, 9, 12], iii: [4, 7, 11, 14], IV: [5, 9, 12, 16], V: [7, 11, 14, 17], vi: [9, 12, 16, 19] };
  const PROGS = [['ii', 'V', 'I', 'vi'], ['I', 'vi', 'ii', 'V'], ['vi', 'IV', 'I', 'V'], ['IV', 'iii', 'ii', 'I'], ['I', 'IV', 'iii', 'vi'], ['ii', 'iii', 'IV', 'V']];
  const TA = ['Senja', 'Ombak', 'Hujan', 'Pagi', 'Pasir', 'Angin', 'Lampu', 'Kopi', 'Bintang', 'Teluk', 'Karang', 'Dermaga'];
  const TB = ['Pelan', 'Biru', 'Tenang', 'di Sore Hari', 'Kota Pulau', 'Malam', 'Hangat', 'Jauh', 'Berbisik', 'Kedua', 'Pulang', 'Asin'];
  const PENTA = [0, 2, 4, 7, 9];
  function songParams(seed) {
    const r = AL.rng(seed);
    return {
      seed,
      root: [0, 2, 3, 5, 7, 9, 10][Math.floor(r() * 7)],
      bpm: 70 + Math.floor(r() * 16),
      prog: PROGS[Math.floor(r() * PROGS.length)],
      swing: 0.54 + r() * 0.08,
      mel: r() < 0.8,
      name: TA[Math.floor(r() * TA.length)] + ' ' + TB[Math.floor(r() * TB.length)],
    };
  }
  const itemSeed = (c, it) => AL.hash32('gen:' + c.cyc + ':' + it.k);
  function itemInfo(c, it) {
    if (it.kind === 'track') return { title: it.title, by: it.artist || 'Lagu warga' };
    const P = songParams(itemSeed(c, it));
    return { title: P.name, by: 'AUDIRA FM · lo-fi generatif' };
  }

  // ---------- audio ----------
  let ctx = null, master, music, lofi, comp, analyser, noiseBuf, crackle = null, crackleGain;
  let audioEl = null, mediaSrc = null;
  let playing = false, cur = null, P = null, nextStep = 0, ctxOff = 0;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function initAudio() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = prefs.vol;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    music = ctx.createGain(); music.gain.value = 1;
    lofi = ctx.createBiquadFilter(); lofi.type = 'lowpass'; lofi.frequency.value = 5200;
    analyser = ctx.createAnalyser(); analyser.fftSize = 64;
    music.connect(lofi); lofi.connect(comp); comp.connect(master); master.connect(analyser); analyser.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // derau piringan hitam
    const cb = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), cd = cb.getChannelData(0);
    for (let i = 0; i < cd.length; i++) cd[i] = (Math.random() * 2 - 1) * 0.05 + (Math.random() < 0.0007 ? (Math.random() * 2 - 1) * 0.9 : 0);
    crackleGain = ctx.createGain(); crackleGain.gain.value = 0;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
    crackle = ctx.createBufferSource(); crackle.buffer = cb; crackle.loop = true;
    crackle.connect(hp); hp.connect(crackleGain); crackleGain.connect(comp); crackle.start();
    audioEl = new Audio(); audioEl.preload = 'auto';
    mediaSrc = ctx.createMediaElementSource(audioEl);
    mediaSrc.connect(comp);
    audioEl.addEventListener('error', () => { if (cur && cur.it.kind === 'track') cur.failed = true; });
  }

  function voice(type, freq, t, dur, peak, dest, filterHz) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
    g.gain.exponentialRampToValueAtTime(peak * 0.35, t + Math.min(0.6, dur * 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (filterHz) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterHz; o.connect(f); f.connect(g); }
    else o.connect(g);
    g.connect(dest || music);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  function keys(notes, t, dur) {
    for (const n of notes) {
      const f = mtof(57 + P.root + n);
      voice('triangle', f, t, dur, 0.05, music, 1500).detune.value = -5;
      voice('sine', f, t, dur, 0.045, music).detune.value = 6;
    }
  }
  function bass(n, t, dur) { voice('sine', mtof(36 + P.root + (n % 12)), t, dur, 0.24, music, 400); }
  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g); g.connect(music); o.start(t); o.stop(t + 0.35);
  }
  function noiseHit(t, type, freq, peak, dur) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = 0.8;
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(music);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  function playStep(s, t) {
    const bar = Math.floor(s / 16), sb = s % 16, bars = Math.floor(cur.it.len / (P.step * 16));
    const chord = CH[P.prog[bar % P.prog.length]];
    const r = AL.rng((P.seed ^ Math.imul(s + 1, 2654435761)) >>> 0);
    const drums = bar >= 2 && bar < bars - 2;
    const barDur = P.step * 16;
    if (sb === 0) { keys(chord, t, barDur * 0.95); bass(chord[0], t, barDur * 0.45); }
    if (sb === 8) bass(r() < 0.5 ? chord[0] : chord[2], t, barDur * 0.4);
    if (sb === 10 && r() < 0.45) keys([chord[1], chord[3]], t, barDur * 0.3);
    if (drums) {
      if (sb === 0 || (sb === 10 && r() < 0.5) || (sb === 7 && r() < 0.25)) kick(t);
      if (sb === 4 || sb === 12) noiseHit(t, 'bandpass', 1700, 0.16, 0.18);
      if (sb % 2 === 0 && r() > 0.12) noiseHit(t, 'highpass', 7500, sb % 4 === 0 ? 0.05 : 0.03, 0.05);
    }
    if (P.mel && bar >= 2 && bar < bars - 1 && sb % 2 === 0 && r() < 0.3) {
      const n = PENTA[Math.floor(r() * PENTA.length)] + (r() < 0.3 ? 12 : 0);
      voice('triangle', mtof(69 + P.root + n), t, P.step * (2 + Math.floor(r() * 3)), 0.06, music, 2600);
    }
  }
  function schedule() {
    if (!playing || !cur || cur.it.kind !== 'gen') return;
    const ahead = ctx.currentTime + (document.hidden ? 1.6 : 0.2);
    for (;;) {
      const tWall = cur.start / 1000 + nextStep * P.step;
      let t = tWall + ctxOff;
      if (t > ahead || nextStep * P.step >= cur.it.len) break;
      if (nextStep % 4 === 2) t += (P.swing - 0.5) * P.step * 2;
      if (t >= ctx.currentTime - 0.01) playStep(nextStep, t);
      nextStep++;
    }
  }

  function startItem(c) {
    cur = c;
    ctxOff = ctx.currentTime - now() / 1000;
    audioEl.pause();
    const fadeIn = Math.min(2, c.it.len - c.offset);
    music.gain.cancelScheduledValues(ctx.currentTime);
    music.gain.setValueAtTime(0.0001, ctx.currentTime);
    music.gain.exponentialRampToValueAtTime(speaking ? 0.3 : 1, ctx.currentTime + Math.max(0.05, fadeIn));
    if (c.it.kind === 'gen') {
      P = songParams(itemSeed(c, c.it));
      P.step = 60 / P.bpm / 4;
      nextStep = Math.ceil(c.offset / P.step);
      crackleGain.gain.setTargetAtTime(0.5, ctx.currentTime, 0.5);
    } else {
      P = null;
      crackleGain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      audioEl.src = c.it.src;
      const seek = () => {
        audioEl.removeEventListener('loadedmetadata', seek);
        audioEl.currentTime = Math.max(0, (now() - c.start) / 1000);
        if (playing && cur === c) audioEl.play().catch(() => { c.failed = true; });
      };
      audioEl.addEventListener('loadedmetadata', seek);
      audioEl.load();
    }
    renderNow();
    maybeTalk(c);
  }
  function loop() {
    if (!playing) return;
    if (!cur || now() >= cur.end || cur.failed) {
      const c = at(now());
      // lagu unggahan gagal dimuat: isi sisa waktunya dengan musik generatif
      if (cur && cur.failed && c.it === cur.it) startItem({ ...c, it: { kind: 'gen', k: 99 + c.i, len: c.it.len }, start: cur.start, end: cur.end });
      else startItem(c);
    }
    schedule();
  }

  // ---------- penyiar ----------
  let lastTalk = 0, speaking = false, talkTimer = 0;
  let idVoice = null;
  const pickVoice = () => {
    if (!('speechSynthesis' in window)) return;
    idVoice = speechSynthesis.getVoices().find(v => /^id(-|_|$)/i.test(v.lang)) || null;
  };
  if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.addEventListener?.('voiceschanged', pickVoice); }

  async function script(c) {
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const dot = s => (/[.!?]$/.test(s.trim()) ? s.trim() : s.trim() + '.'); // hindari "!." ganda
    const lines = [];
    const d = new Date(now()), h = d.getHours(), m = d.getMinutes();
    lines.push(pick([`Kamu mendengarkan ${STATION}, radionya warga AUDIRA LAND.`, `Ini ${STATION}, dari pulau kita untuk kamu.`, `Masih bersama ${STATION}.`]));
    lines.push(m === 0 ? `Sekarang pukul ${h} tepat.` : `Sekarang pukul ${h} lewat ${m} menit.`);
    const extra = [];
    try {
      const k = await fetch('/api/kabar?b=' + Math.floor(Date.now() / 30000)).then(r => r.json());
      if (k.posts && k.posts[0]) extra.push(`Kabar kota: ${dot(k.posts[0].title)}`);
      const ev = k.events && k.events.find(e => e.date === k.today);
      if (ev) extra.push(`Jangan lupa, hari ini ada ${ev.title}${ev.time ? ' pukul ' + ev.time.replace(':', '.') : ''}${ev.place ? ' di ' + ev.place : ''}.`);
    } catch (e) { /* tanpa kabar */ }
    try {
      const s = await fetch('/api/sponsor?b=' + Math.floor(Date.now() / 30000)).then(r => r.json());
      if (s.sponsors && s.sponsors.length) { const sp = pick(s.sponsors); extra.push(`Siaran ini didukung oleh ${dot(sp.name)}${sp.tagline ? ' ' + dot(sp.tagline) : ''}`); }
    } catch (e) { /* tanpa sponsor */ }
    if (AL.residents && AL.residents.length) {
      const newest = AL.residents.reduce((a, b) => (b.joined > a.joined ? b : a));
      if (now() - newest.joined < 3600e3) extra.push(`Selamat datang untuk warga baru, ${newest.u.replace(/[._]+/g, ' ')}.`);
      else extra.push(`Kota kita sekarang dihuni ${AL.residents.length.toLocaleString('id-ID')} warga.`);
    }
    extra.sort(() => Math.random() - 0.5);
    lines.push(...extra.slice(0, 2));
    const nx = itemInfo(c, c.it);
    lines.push(dot(c.it.kind === 'track' ? `Berikut ini, ${nx.title}${nx.by ? ' dari ' + nx.by : ''}` : `Berikut ini, ${nx.title}`));
    return lines.join(' ');
  }
  function duck(on) {
    speaking = on;
    if (!ctx) return;
    music.gain.setTargetAtTime(on ? 0.3 : 1, ctx.currentTime, 0.25);
    if (audioEl) audioEl.volume = on ? 0.35 : 1;
  }
  async function talk(c) {
    lastTalk = Date.now();
    const text = await script(c);
    showSub(text);
    if (!idVoice || !('speechSynthesis' in window)) { setTimeout(() => showSub(''), 9000); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.voice = idVoice; u.lang = idVoice.lang; u.rate = 1.02; u.pitch = 1.05; u.volume = Math.min(1, prefs.vol + 0.2);
    u.onstart = () => duck(true);
    u.onend = u.onerror = () => { duck(false); showSub(''); };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
  function maybeTalk(c) {
    clearTimeout(talkTimer);
    if (!conf.announcer || !prefs.penyiar) return;
    const gap = Date.now() - lastTalk;
    const wait = lastTalk === 0 ? 5000 : 1500;
    if (lastTalk !== 0 && gap < conf.every * 60000) return;
    talkTimer = setTimeout(() => { if (playing && cur === c) talk(c); }, wait);
  }

  // ---------- UI ----------
  const els = {};
  function svg(d) { return `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${d}</svg>`; }
  AL.radioMount = function (host, opts) {
    opts = opts || {};
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'radio-btn' + (opts.btnClass ? ' ' + opts.btnClass : '');
    btn.setAttribute('aria-label', 'Radio ' + STATION); btn.title = STATION;
    btn.innerHTML = svg('<rect x="3" y="8" width="18" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="15.5" cy="14" r="2.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6.5 12.5h4M6.5 15.5h4M7 8l9-4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>') + '<span class="bars" aria-hidden="true"><i></i><i></i><i></i></span>';
    if (opts.before) host.insertBefore(btn, opts.before); else host.appendChild(btn);

    const panel = document.createElement('section');
    panel.className = 'radio-panel' + (opts.panelClass ? ' ' + opts.panelClass : '');
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Radio ' + STATION);
    panel.innerHTML = `
      <div class="rp-head"><span class="live">Siaran langsung</span><strong>${STATION}</strong><button type="button" class="rp-close" aria-label="Tutup radio">×</button></div>
      <div class="rp-now"><canvas width="88" height="56" aria-hidden="true"></canvas><div><p class="rp-title">Radio mati</p><p class="rp-by">Ketuk Putar untuk menyalakan</p></div></div>
      <div class="rp-bar"><span></span></div>
      <p class="rp-sub" aria-live="polite" hidden></p>
      <div class="rp-ctrl">
        <button type="button" class="rp-play">Putar</button>
        <label class="rp-vol"><span class="sr">Volume</span><input type="range" min="0" max="1" step="0.05" value="${prefs.vol}" aria-label="Volume"></label>
        <label class="rp-pen"><input type="checkbox" ${prefs.penyiar ? 'checked' : ''}> Penyiar</label>
      </div>`;
    document.body.appendChild(panel);
    const sub = document.createElement('p');
    sub.className = 'radio-sub'; sub.hidden = true; sub.setAttribute('aria-live', 'polite');
    document.body.appendChild(sub);
    Object.assign(els, { btn, panel, sub, title: panel.querySelector('.rp-title'), by: panel.querySelector('.rp-by'), bar: panel.querySelector('.rp-bar span'), psub: panel.querySelector('.rp-sub'), play: panel.querySelector('.rp-play'), eq: panel.querySelector('canvas') });

    btn.addEventListener('click', () => { panel.hidden = !panel.hidden; if (!panel.hidden) renderNow(); });
    panel.querySelector('.rp-close').addEventListener('click', () => { panel.hidden = true; });
    els.play.addEventListener('click', () => (playing ? stop() : start()));
    panel.querySelector('.rp-vol input').addEventListener('input', e => {
      prefs.vol = +e.target.value; savePrefs();
      if (master) master.gain.setTargetAtTime(prefs.vol, ctx.currentTime, 0.05);
    });
    panel.querySelector('.rp-pen input').addEventListener('change', e => {
      prefs.penyiar = e.target.checked; savePrefs();
      if (!prefs.penyiar && 'speechSynthesis' in window) { speechSynthesis.cancel(); duck(false); showSub(''); }
    });
    loadConf();
    setInterval(loadConf, 5 * 60000);
    setInterval(() => { if (playing) loop(); }, 25);
    setInterval(renderProgress, 500);
    requestAnimationFrame(drawEq);
  };

  async function loadConf() {
    try {
      const d = await fetch('/api/radio', { signal: AbortSignal.timeout(6000) }).then(r => r.json());
      skew = d.now - Date.now();
      const changed = !rot || d.epoch !== conf.epoch;
      conf = d;
      if (changed) { buildRot(); if (playing) { cur = null; loop(); } else renderNow(); }
    } catch (e) { if (!rot) buildRot(); }
  }
  async function start() {
    initAudio();
    await ctx.resume();
    playing = true;
    if (!rot) buildRot();
    cur = null; loop();
    els.btn.classList.add('on'); els.play.textContent = 'Jeda';
    els.play.classList.add('on');
  }
  function stop() {
    playing = false;
    clearTimeout(talkTimer);
    if (audioEl) audioEl.pause();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    duck(false); showSub('');
    if (ctx) { music.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1); crackleGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1); }
    cur = null;
    els.btn.classList.remove('on'); els.play.textContent = 'Putar'; els.play.classList.remove('on');
    renderNow();
  }
  function renderNow() {
    if (!els.title) return;
    if (!rot) buildRot();
    const c = cur || at(now()), info = itemInfo(c, c.it);
    els.title.textContent = info.title;
    els.by.textContent = playing ? info.by : 'Sedang diputar · ketuk Putar untuk mendengar';
    renderProgress();
  }
  function renderProgress() {
    if (!els.bar || !rot) return;
    const c = cur || at(now());
    els.bar.style.width = Math.min(100, (now() - c.start) / (c.end - c.start) * 100) + '%';
    if (!cur && !els.panel.hidden && now() >= c.end) renderNow();
  }
  function showSub(text) {
    if (!els.sub) return;
    els.psub.textContent = text; els.psub.hidden = !text;
    els.sub.textContent = text ? '📻 ' + text : ''; els.sub.hidden = !text || !els.panel.hidden;
  }
  function drawEq() {
    requestAnimationFrame(drawEq);
    if (!els.eq || els.panel.hidden) return;
    const c = els.eq.getContext('2d'), W = els.eq.width, H = els.eq.height;
    c.clearRect(0, 0, W, H);
    const n = 11, data = new Uint8Array(32);
    if (playing && analyser) analyser.getByteFrequencyData(data);
    for (let i = 0; i < n; i++) {
      const v = playing ? data[i + 1] / 255 : 0.08;
      const h = Math.max(3, v * H);
      c.fillStyle = i % 2 ? '#177a7a' : '#14324a';
      c.fillRect(i * 8, H - h, 6, h);
    }
  }
  AL.radio = { start, stop, at: ms => (rot ? at(ms) : null), get playing() { return playing; }, conf: () => conf };
})(window.AL);
