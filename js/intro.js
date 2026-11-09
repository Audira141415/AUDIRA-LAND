/* AUDIRA LAND · intro harian: sekali per hari (WIB) per perangkat, cut-scene 2,5 dtk di atas peta.
   Kapal feri mendekati pulau, judul AUDIRA LAND, jumlah warga, dan tanggal. Ketuk/tekan tombol apa pun untuk lewati.
   Tidak muncul bila prefers-reduced-motion atau ?demo (onBoot memang tidak dipanggil di mode demo). */
(function (AL) {
  'use strict';
  const KEY = 'audira-intro-hari';
  const DUR = 2.5, FADE = 0.45;
  const RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const hariIni = () => new Date((AL.now ? AL.now() : Date.now()) + 7 * 3600e3).toISOString().slice(0, 10);

  let run = null; // { t0, pop, date, label, skip, out }

  function mulai() {
    if (RM || new URLSearchParams(location.search).has('demo')) return;
    const today = hariIni();
    try { if (localStorage.getItem(KEY) === today) return; localStorage.setItem(KEY, today); } catch (e) { return; } // tanpa penyimpanan: jangan ulang tiap buka
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'intro-skip';
    skip.setAttribute('aria-label', 'Lewati intro');
    skip.textContent = 'Ketuk untuk lewati';
    skip.addEventListener('click', selesai);
    document.addEventListener('keydown', selesai, { once: true });
    document.body.appendChild(skip);
    run = {
      t0: performance.now() / 1000, out: null, skip,
      pop: AL.fmtInt(AL.residents ? AL.residents.length : 0),
      date: new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }),
      label: AL.musim && AL.musim.label ? AL.musim.label() : '',
    };
  }
  function selesai() {
    if (!run || run.out !== null) return;
    run.out = performance.now() / 1000;
    if (run.skip) { run.skip.remove(); run.skip = null; }
  }

  // kapal feri orisinal: lambung koral, kabin krem berjendela, cerobong kuning bergaris
  function ferry(ctx, x, y, s, bob) {
    y += bob;
    // buih buritan (V di belakang kapal: kapal bergerak ke kanan-atas)
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2 * s; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 40 * s, y + 8 * s); ctx.lineTo(x - 120 * s, y + 34 * s);
    ctx.moveTo(x - 40 * s, y + 12 * s); ctx.lineTo(x - 100 * s, y + 52 * s);
    ctx.stroke();
    // bayangan air
    ctx.fillStyle = 'rgba(10,30,50,.25)';
    ctx.beginPath(); ctx.ellipse(x, y + 12 * s, 52 * s, 8 * s, -0.18, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.18);
    // lambung
    ctx.fillStyle = '#ff7a59';
    ctx.beginPath(); ctx.moveTo(-46 * s, -6 * s); ctx.lineTo(50 * s, -6 * s); ctx.lineTo(38 * s, 10 * s); ctx.lineTo(-40 * s, 10 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#14324a'; ctx.fillRect(-44 * s, 3 * s, 86 * s, 2.4 * s);
    // kabin
    ctx.fillStyle = '#fffaf0';
    ctx.beginPath(); ctx.roundRect(-30 * s, -22 * s, 54 * s, 16 * s, 3 * s); ctx.fill();
    ctx.fillStyle = '#5fb3c9';
    for (let i = 0; i < 6; i++) ctx.fillRect((-26 + i * 8.5) * s, -18 * s, 5 * s, 5 * s);
    ctx.fillStyle = '#fffaf0';
    ctx.beginPath(); ctx.roundRect(-18 * s, -32 * s, 28 * s, 10 * s, 3 * s); ctx.fill();
    // cerobong
    ctx.fillStyle = '#ffd166'; ctx.fillRect(14 * s, -40 * s, 8 * s, 14 * s);
    ctx.fillStyle = '#14324a'; ctx.fillRect(14 * s, -36 * s, 8 * s, 2.5 * s);
    ctx.restore();
  }

  AL.screenFx.push((ctx, vw, vh) => {
    if (!run) return;
    const now = performance.now() / 1000, e = now - run.t0;
    if (run.out === null && e >= DUR) selesai();
    const fo = run.out === null ? 0 : (now - run.out) / FADE;
    if (fo >= 1) { run = null; return; }
    const A = (1 - fo) * Math.min(1, e / 0.35); // masuk & keluar halus
    const s = AL.clamp(Math.min(vw, vh) / 520, 0.7, 1.6);
    ctx.save();
    ctx.globalAlpha = A;
    // tirai laut: gelap di tepi, terang di tengah (peta tetap terlihat samar)
    const g = ctx.createRadialGradient(vw / 2, vh * 0.48, Math.min(vw, vh) * 0.15, vw / 2, vh * 0.5, Math.max(vw, vh) * 0.75);
    g.addColorStop(0, 'rgba(20,50,74,.30)'); g.addColorStop(1, 'rgba(12,32,52,.88)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    // feri meluncur dari kiri bawah mendekati pulau (tengah layar), melambat saat tiba
    const k = 1 - Math.pow(1 - Math.min(1, e / DUR), 3);
    const fx = AL.lerp(-80 * s, vw * 0.36, k), fy = AL.lerp(vh * 0.9, vh * 0.66, k);
    ferry(ctx, fx, fy, s, Math.sin(e * 3.2) * 2 * s);
    // judul
    const tA = AL.clamp((e - 0.3) / 0.5, 0, 1), ty = vh * 0.36 + (1 - tA) * 14 * s;
    ctx.globalAlpha = A * tA;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd166';
    ctx.font = '800 ' + Math.round(13 * s) + 'px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(run.label ? run.label.toUpperCase() : 'SELAMAT DATANG DI', vw / 2, ty - 34 * s);
    ctx.fillStyle = '#fffaf0';
    ctx.font = '800 ' + Math.round(40 * s) + 'px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('AUDIRA LAND', vw / 2, ty);
    // garis ombak di bawah judul
    ctx.strokeStyle = '#7fcbd8'; ctx.lineWidth = 2.5 * s; ctx.lineCap = 'round';
    ctx.beginPath();
    const w = 120 * s * tA;
    for (let i = 0; i <= 24; i++) { const x = vw / 2 - w / 2 + (w * i) / 24, y = ty + 30 * s + Math.sin(i / 2.2 + e * 4) * 2.5 * s; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke();
    const iA = AL.clamp((e - 0.7) / 0.5, 0, 1);
    ctx.globalAlpha = A * iA;
    ctx.font = '700 ' + Math.round(15 * s) + 'px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillStyle = '#fffaf0';
    ctx.fillText(run.pop + ' warga', vw / 2, ty + 56 * s);
    ctx.font = '600 ' + Math.round(13 * s) + 'px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,250,240,.78)';
    ctx.fillText(run.date, vw / 2, ty + 78 * s);
    ctx.textAlign = 'left';
    ctx.restore();
  });

  AL.onBoot.push(mulai);
  AL.introAktif = () => !!run;
})(window.AL);
