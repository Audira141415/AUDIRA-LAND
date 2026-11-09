/* AUDIRA LAND · main: kamera, input, loop, urutan gambar, siang-malam. */
(function (AL) {
  'use strict';
  const canvas = document.getElementById('map');
  const ctx = canvas.getContext('2d');
  const LITE = (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
  AL.LITE = LITE;
  const DPR_CAP = LITE ? 1.5 : 2;
  let vw = 0, vh = 0, dpr = 1;

  // ---------- data ----------
  AL.lots.forEach(l => { l.hmax = AL.HMAX[l.type]; });
  AL.statics.forEach(o => { o.hmax = AL.HMAX[o.kind]; });
  AL.buildGround();
  const objs = AL.lots.concat(AL.statics).map(o => {
    const span = o.kind ? 0.5 : 1; // kavling 2×2: pusat di +1
    o.key = o.x + o.y + span * 2;
    return o;
  }).sort((a, b) => a.key - b.key);
  AL.objs = objs;
  // tambah/hapus objek statis setelah peta jadi (mis. papan sponsor), urutan kedalaman tetap terjaga
  AL.insertObj = o => {
    o.key = o.x + o.y + 1;
    let lo = 0, hi = objs.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (objs[m].key < o.key) lo = m + 1; else hi = m; }
    objs.splice(lo, 0, o);
  };
  AL.removeObjs = pred => { for (let i = objs.length - 1; i >= 0; i--) if (pred(objs[i])) objs.splice(i, 1); };
  AL.spawnCars(LITE ? 14 : 28);

  // ---------- kamera ----------
  const center = AL.toWorld(AL.W / 2, AL.H / 2);
  const cam = { x: center.x, y: center.y - 40, zoom: 1 };
  AL.cam = cam;
  let fly = null;
  function resize() {
    vw = window.innerWidth; vh = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px'; canvas.style.height = vh + 'px';
  }
  resize();
  cam.zoom = AL.clamp(Math.min(vw, vh * 1.8) / (AL.W * AL.TW) * 1.6, 0.16, 1.2);
  window.addEventListener('resize', resize);
  const ZMIN = 0.16, ZMAX = 3.2;
  function zoomAt(f, sx, sy) {
    const nz = AL.clamp(cam.zoom * f, ZMIN, ZMAX);
    const wx = (sx - vw / 2) / cam.zoom + cam.x, wy = (sy - vh / 2) / cam.zoom + cam.y;
    cam.zoom = nz;
    cam.x = wx - (sx - vw / 2) / nz; cam.y = wy - (sy - vh / 2) / nz;
    fly = null;
  }
  AL.zoomBy = f => zoomAt(f, vw / 2, vh / 2);
  AL.flyTo = function (tx, ty, z, zoom) {
    const w = AL.toWorld(tx, ty, z || 0);
    fly = { x0: cam.x, y0: cam.y, z0: cam.zoom, x1: w.x, y1: w.y + 30, z1: zoom || Math.max(cam.zoom, 1.5), t: 0 };
  };
  AL.screenToWorld = (sx, sy) => ({ x: (sx - vw / 2) / cam.zoom + cam.x, y: (sy - vh / 2) / cam.zoom + cam.y });

  // ---------- input: geser, cubit, roda ----------
  const ptrs = new Map();
  let drag = null, pinch = null, moved = 0;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { drag = { x: e.clientX, y: e.clientY }; moved = 0; }
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
      drag = null;
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt(d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch.d = d; moved += 10;
    } else if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      cam.x -= dx / cam.zoom; cam.y -= dy / cam.zoom;
      drag = { x: e.clientX, y: e.clientY };
      moved += Math.abs(dx) + Math.abs(dy);
      fly = null;
    }
  });
  const up = e => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (e.type === 'pointerup' && drag && moved < 6) AL.onTap && AL.onTap(e.clientX, e.clientY);
    if (ptrs.size === 0) drag = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });

  // ---------- waktu & siang-malam ----------
  const clock = { fast: false, offset: 0 }; // offset menit game
  AL.clock = clock;
  AL.gameDate = () => new Date(Date.now() + clock.offset * 60000);
  function nightFactor(d) {
    const h = d.getHours() + d.getMinutes() / 60;
    if (h >= 6.5 && h < 17.5) return 0;
    if (h >= 17.5 && h < 19) return (h - 17.5) / 1.5;
    if (h >= 19 || h < 4.5) return 1;
    return 1 - (h - 4.5) / 2; // 4.5–6.5 fajar
  }
  AL.nightFactor = () => nightFactor(AL.gameDate());
  // warna suasana per jam (lapisan soft-light di atas kota): fajar merah muda, sore keemasan, senja jingga-ungu
  const smooth = (a, b, h) => { const k = Math.min(1, Math.max(0, (h - a) / (b - a))); return k * k * (3 - 2 * k); };
  function grade(d) {
    const h = d.getHours() + d.getMinutes() / 60;
    const fajar = smooth(4.8, 5.6, h) * (1 - smooth(6.2, 7.4, h));
    const emas = smooth(15.6, 17.0, h) * (1 - smooth(18.2, 19.0, h));
    const senja = smooth(17.4, 18.2, h) * (1 - smooth(18.8, 19.6, h));
    const out = [];
    if (fajar > 0) out.push(['255,160,170', 0.42 * fajar]);
    if (emas > 0) out.push(['255,168,80', 0.85 * emas], ['255,214,150', 0.35 * emas]);
    if (senja > 0) out.push(['190,90,150', 0.32 * senja]);
    return out;
  }
  AL.gradeNow = () => grade(AL.gameDate());

  // ---------- hit test kavling (piksel sprite) ----------
  AL.hitTest = function (sx, sy) {
    const z = cam.zoom;
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (o.kind === 'tree' || o.kind === 'palm') continue;
      const sp = o._sp;
      if (!sp) continue;
      const w = AL.toWorld(o.x, o.y);
      const k = z / sp.s;
      const x0 = (w.x - cam.x) * z + vw / 2 - sp.ox * k, y0 = (w.y - cam.y) * z + vh / 2 - sp.oy * k;
      const px = Math.floor((sx - x0) / k), py = Math.floor((sy - y0) / k);
      if (px < 0 || py < 0 || px >= sp.cv.width || py >= sp.cv.height) continue;
      const a = sp.cv.getContext('2d').getImageData(px, py, 1, 1).data[3];
      if (a > 90) return o;
    }
    return null;
  };

  // ---------- loop ----------
  let last = performance.now(), simT = 0, commuterT = 0, fpsAvg = 60;
  const budget = { n: 0 };
  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    fpsAvg = fpsAvg * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
    simT += dt;
    AL.simT = simT;
    if (clock.fast) clock.offset += dt * 6; // 1 detik nyata = 6 menit game
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  function update(dt) {
    if (fly) {
      fly.t = Math.min(1, fly.t + dt / 0.9);
      const k = AL.ease(fly.t);
      cam.x = AL.lerp(fly.x0, fly.x1, k); cam.y = AL.lerp(fly.y0, fly.y1, k); cam.zoom = AL.lerp(fly.z0, fly.z1, k);
      if (fly.t >= 1) fly = null;
    }
    AL.updateFerry();
    AL.updateAgents(dt);
    commuterT -= dt;
    const maxW = LITE ? 25 : 50;
    if (commuterT <= 0 && AL.countWalkers() < maxW) { AL.spawnCommuter(); commuterT = 0.35; }
  }

  function draw() {
    const z = cam.zoom, t = simT, night = AL.nightFactor();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const tone = grade(AL.gameDate());
    const hangat = tone.reduce((s, x) => s + x[1], 0);
    ctx.fillStyle = AL.mix(AL.mix('#5fb3c9', '#7fb8c0', Math.min(1, hangat)), '#16243d', night * 0.75);
    ctx.fillRect(0, 0, vw, vh);
    AL.drawGround(ctx, cam, vw, vh, dpr, t);
    if (night > 0) { ctx.fillStyle = 'rgba(16,24,56,' + (night * 0.6) + ')'; ctx.fillRect(0, 0, vw, vh); }

    // lampu jalan
    if (night > 0.15) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const rr = 26 * z;
      for (const L of AL.ground.lamps) {
        const sx = (L.x - cam.x) * z + vw / 2, sy = (L.y - cam.y) * z + vh / 2;
        if (sx < -rr * 1.5 || sy < -rr * 1.5 || sx > vw + rr * 1.5 || sy > vh + rr * 1.5) continue;
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rr * 1.5);
        g.addColorStop(0, 'rgba(255,214,140,' + (0.42 * night) + ')'); g.addColorStop(0.35, 'rgba(255,196,120,' + (0.16 * night) + ')'); g.addColorStop(1, 'rgba(255,196,120,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, rr * 1.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // objek statis + agen, digabung urut kedalaman
    const s = AL.tierFor(z * dpr);
    budget.n = LITE ? 12 : 28;
    const dyn = AL.agents.map(a => ({ a, key: a.x + a.y })).sort((p, q) => p.key - q.key);
    let di = 0;
    const drawDyn = a => {
      const w = AL.toWorld(a.x, a.y, AL.groundZ ? AL.groundZ(a.x, a.y) : 0); // naik di flyover
      const sx = (w.x - cam.x) * z + vw / 2, sy = (w.y - cam.y) * z + vh / 2;
      if (sx < -120 * z || sy < -120 * z || sx > vw + 120 * z || sy > vh + 120 * z) return;
      if (a.kind === 'car') AL.drawCar(ctx, a, sx, sy, z, night);
      else if (a.kind === 'walker') AL.drawWalker(ctx, sx, sy, z, a.look, t + a.res.seed % 7, night);
      else if (a.kind === 'ferry') AL.drawFerry(ctx, a, sx, sy, z, night, t);
      else if (a.draw) a.draw(ctx, sx, sy, z, night, t); // agen lain (mis. ayam kampung)
    };
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      while (di < dyn.length && dyn[di].key < o.key) drawDyn(dyn[di++].a);
      const w = AL.toWorld(o.x, o.y);
      const b = AL.spriteBox(o.hmax, s), k = z / s;
      const x0 = (w.x - cam.x) * z + vw / 2 - b.ox * k, y0 = (w.y - cam.y) * z + vh / 2 - b.oy * k;
      if (x0 > vw || y0 > vh || x0 + b.w * k < 0 || y0 + b.h * k < 0) continue;
      const sp = AL.getSprite(o, s, false, budget);
      if (!sp) continue;
      o._sp = sp;
      const kk = z / sp.s;
      const dx = (w.x - cam.x) * z + vw / 2 - sp.ox * kk, dy = (w.y - cam.y) * z + vh / 2 - sp.oy * kk;
      ctx.drawImage(sp.cv, dx, dy, sp.cv.width * kk, sp.cv.height * kk);
      if (night > 0.02) {
        const spn = AL.getSprite(o, s, true, budget);
        if (spn) {
          const kn = z / spn.s;
          ctx.globalAlpha = night;
          ctx.drawImage(spn.cv, (w.x - cam.x) * z + vw / 2 - spn.ox * kn, (w.y - cam.y) * z + vh / 2 - spn.oy * kn, spn.cv.width * kn, spn.cv.height * kn);
          ctx.globalAlpha = 1;
        }
      }
    }
    while (di < dyn.length) drawDyn(dyn[di++].a);

    // hologram sponsor melayang di atas gedung (selalu di depan)
    const toScr = (tx, ty, tz) => { const w = AL.toWorld(tx, ty, tz); return [(w.x - cam.x) * z + vw / 2, (w.y - cam.y) * z + vh / 2]; };
    if (AL.drawHolos) AL.drawHolos(ctx, toScr, z, t, vw, vh);
    if (AL.drawParties) AL.drawParties(ctx, toScr, z, t, vw, vh);
    if (AL.drawKampung) AL.drawKampung(ctx, toScr, z, t, vw, vh, night);
    if (AL.drawLandmarks) AL.drawLandmarks(ctx, toScr, z, t, vw, vh, night);
    if (AL.drawFlyovers) AL.drawFlyovers(ctx, toScr, z, t, vw, vh, night);
    for (const f of AL.overlays) { try { f(ctx, toScr, z, t, vw, vh, night); } catch (e) { console.error(e); } }

    // gradasi suasana (fajar/sore/senja) + vinyet lembut; HUD & penanda di bawah ini tetap warna asli
    if (tone.length) {
      ctx.save(); ctx.globalCompositeOperation = 'soft-light';
      for (const [rgb, a] of tone) { ctx.fillStyle = 'rgba(' + rgb + ',' + a + ')'; ctx.fillRect(0, 0, vw, vh); }
      ctx.restore();
    }
    {
      const vg = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.45, vw / 2, vh / 2, Math.hypot(vw, vh) * 0.62);
      vg.addColorStop(0, 'rgba(10,20,40,0)'); vg.addColorStop(1, 'rgba(10,20,40,' + (0.1 + 0.22 * night) + ')');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, vw, vh);
    }

    // sorot mercusuar
    const LH = AL.lighthouse;
    if (LH && night > 0.15) {
      const w = AL.toWorld(LH.x + 0.5, LH.y + 0.5, 2.72);
      const sx = (w.x - cam.x) * z + vw / 2, sy = (w.y - cam.y) * z + vh / 2;
      const ang = t * 0.9, len = 420 * z;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, len);
      g.addColorStop(0, 'rgba(255,240,170,' + (0.5 * night) + ')'); g.addColorStop(1, 'rgba(255,240,170,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(sx, sy);
      ctx.ellipse(sx, sy, len, len * 0.5, 0, ang - 0.12, ang + 0.12);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // art bible §1/§3: rumah sendiri (warga yang sudah masuk lewat kode KTW) selalu ditandai pin koral
    const f = AL.focus;
    let myName = null;
    try { myName = localStorage.getItem('audira-taman-user'); } catch (e) { /* penyimpanan diblokir */ }
    const mine = myName && AL.byName.get(myName.toLowerCase());
    if (mine && mine.home >= 0 && !(f && f.lot === mine.home)) {
      const lot = AL.lots[mine.home];
      const w = AL.toWorld(lot.x + 1, lot.y + 1, (lot.hTop || 1.2) + 0.3);
      const sx = (w.x - cam.x) * z + vw / 2, sy = (w.y - cam.y) * z + vh / 2;
      if (sx > -80 && sx < vw + 80 && sy > -60 && sy < vh + 60) {
        ctx.beginPath(); ctx.moveTo(sx - 7, sy - 12); ctx.lineTo(sx + 7, sy - 12); ctx.lineTo(sx, sy); ctx.closePath();
        ctx.fillStyle = '#ff7a59'; ctx.fill(); ctx.strokeStyle = '#14324a'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.font = '800 11px "Plus Jakarta Sans", system-ui, sans-serif';
        const label = 'Rumahmu', tw = ctx.measureText(label).width + 16;
        ctx.beginPath(); ctx.roundRect(sx - tw / 2, sy - 33, tw, 18, 9);
        ctx.fillStyle = '#fffaf0'; ctx.fill(); ctx.strokeStyle = 'rgba(20,50,74,.2)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#14324a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, sx, sy - 24); ctx.textAlign = 'left';
      }
    }
    // penanda fokus
    if (f) {
      const lot = AL.lots[f.lot];
      if (lot) {
        const w = AL.toWorld(lot.x + 1, lot.y + 1, (lot.hTop || 1.2) + 0.5);
        const sx = (w.x - cam.x) * z + vw / 2, sy = (w.y - cam.y) * z + vh / 2 - Math.abs(Math.sin(t * 4)) * 8;
        ctx.fillStyle = '#ff7a59'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.bezierCurveTo(sx - 14, sy - 16, sx - 12, sy - 32, sx, sy - 32);
        ctx.bezierCurveTo(sx + 12, sy - 32, sx + 14, sy - 16, sx, sy);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(sx, sy - 21, 4.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const f of AL.screenFx) { try { f(ctx, vw, vh, t, night); } catch (e) { console.error(e); } }
    AL.stats = { fps: Math.round(fpsAvg), sprites: AL.spriteCacheSize(), agents: AL.agents.length };
  }
  AL.renderOnce = function () { update(0.016); draw(); return AL.stats; };

  requestAnimationFrame(t => { last = t; frame(t); });
  AL.net.boot().then(() => {
    AL.ui.init();
    AL.sponsorInit && AL.sponsorInit();
    if (AL.pestaInit && !AL.net.demo) AL.pestaInit();
    if (AL.dompetInit && !AL.net.demo) AL.dompetInit();
    if (AL.radioMount && !AL.net.demo) AL.radioMount(document.querySelector('.tools'), { before: document.getElementById('speed') });
    if (!AL.net.demo) for (const f of AL.onBoot) { try { f(); } catch (e) { console.error(e); } }
  });
})(window.AL);
