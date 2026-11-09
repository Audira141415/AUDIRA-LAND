/* AUDIRA LAND · net: muat daftar warga & jadwal kapal dari server, polling tiap 15 detik.
   Server tidak terjangkau (atau ?demo) → mode demo: warga & kapal dibuat di perangkat. */
(function (AL) {
  'use strict';
  const net = { online: false, demo: false, skew: 0, every: 300000, queued: 0, maxSeq: 0, juara: {}, lencana: {} };
  AL.net = net;
  AL.now = () => Date.now() + net.skew;

  function addSlot(seq, u, at) {
    let list = AL.slots.get(at);
    if (!list) { list = []; AL.slots.set(at, list); }
    if (!list.some(p => p.seq === seq)) list.push({ seq, u, at });
  }

  async function fetchCity() {
    // ember 15 detik: semua klien di ember yang sama dapat jawaban cache yang sama
    const b = Math.floor(Date.now() / 15000);
    const r = await fetch('/api/city?b=' + b + (net.maxSeq ? '&after=' + net.maxSeq : ''), { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  net.apply = function (d) {
    net.skew = d.now - Date.now();
    net.every = d.every;
    net.queued = d.queue.length;
    const now = AL.now();
    const dockEnd = AL.FERRY_DOCKED * 1000, win = (AL.FERRY_TRAVEL + AL.FERRY_DOCKED) * 1000;
    net.juara = d.juara || {};
    net.lencana = d.lencana || {};
    // nomor urut aman untuk ?after=: semua warga <= nomor ini sudah tiba & selesai turun kapal
    let top = net.maxSeq, cap = Infinity;
    for (const [seq, , at, f] of d.residents) { if (f && now < at + dockEnd) cap = Math.min(cap, seq - 1); else top = Math.max(top, seq); }
    for (const [seq] of d.queue) cap = Math.min(cap, seq - 1);
    net.maxSeq = Math.max(net.maxSeq, Math.min(top, cap));
    for (const [seq, u, at, f] of d.residents) {
      if (AL.bySeq.has(seq)) continue;
      if (f && now < at + win) addSlot(seq, u, at);           // kapalnya masih terlihat
      if (f && now < at + dockEnd) continue;                   // kapal sedang menurunkan: biar kapal yang menambahkan
      AL.addResident(u, at, seq).isNew = false;
    }
    for (const [seq, u, at] of d.queue) addSlot(seq, u, at);
  };

  async function poll() {
    try { net.apply(await fetchCity()); net.online = true; }
    catch (e) { net.online = false; }
  }

  // ---------- mode demo ----------
  let demoSeq = 0;
  function demoTick() {
    const now = AL.now();
    for (const S of AL.slots.keys()) if (S > now) return;
    const at = now + 25000, n = 3 + Math.floor(Math.random() * 5);
    for (let k = 0; k < n; k++) { demoSeq++; addSlot(demoSeq, AL.demoName(demoSeq + 7), at); }
  }

  net.boot = async function () {
    if (!new URLSearchParams(location.search).has('demo')) {
      try {
        net.apply(await fetchCity());
        net.online = true;
        setInterval(poll, 15000);
        return;
      } catch (e) { /* lanjut ke demo */ }
    }
    net.demo = true;
    net.every = 45000;
    AL.initDemo();
    demoSeq = AL.residents.length;
    demoTick();
    setInterval(demoTick, 1000);
  };

  // ---------- pendaftaran ----------
  async function post(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Gagal (' + r.status + ')');
    return j;
  }
  net.daftar = (username, setuju) => post('/api/daftar', { username, setuju });
  net.keluar = username => post('/api/keluar', { username });
})(window.AL);
