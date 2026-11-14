/**
 * AUDIRA-LAND: Sistem Perjalanan Darat · Laut · Udara (spek: docs/SPEC_TRAVEL_SYSTEM.md)
 *
 * - Bus: semua stasiun saling terhubung lewat jalan raya (Dijkstra di peta jalan, arteri diutamakan).
 * - Kapal feri: Pelabuhan <-> Terminal Pesiar lewat lepas pantai laut selatan.
 * - Pesawat: dari Bandara ke stasiun mana pun (lepas landas di runway) + Tur Udara Keliling Kota.
 *
 * Kendaraan perjalanan hanya dibuat selama perjalanan (maks 1 kendaraan di scene).
 * Chunk lazy: dimuat main.js lewat import() -> tidak menambah bundle utama.
 */
import { GRID_CONFIG } from './constants.js';
import { roadAt } from './road_network.js';
import { COAST_ROADS } from './coast_roads.js';
import { pfGeo, pfLiveMaterial, pfScaleTo } from '../models/polyfork_library.js';

const SEA_Y = -0.25;
const LIFT = 0.02;                       // zero-submerging: kendaraan darat sedikit di atas permukaan
const RUNWAY_Z = 206, RUNWAY_Y = 0.3;    // runway bandara (airport.js: CZ 233, z lokal -27)
const BUS_ID = 'city-bus-49fd97';
const PLANE_ID = 'narrow-body-airliner-619183';

// Titik turun / loket tiap stasiun (dunia). r = radius munculnya tombol loket di Mode Jalan.
const STATIONS = [
    { id: 'bandara', name: 'Bandara AUDIRA', icon: '✈️', x: -130, z: 192, r: 40, air: true },
    { id: 'bis_utara', name: 'Terminal Bis Utara', icon: '🚌', x: -40, z: 192, r: 36 },
    { id: 'bis_selatan', name: 'Terminal Bis Selatan', icon: '🚌', x: -85, z: -198, r: 50 },
    { id: 'halte_havenot', name: 'Halte Desa Have-Not', icon: '🛖', x: 240, z: 10, r: 30, havenot: true },
    // Pelabuhan & Pesiar: loket di gerbang darat, ujung jalan akses pesisir (core/coast_roads.js)
    { id: 'pelabuhan', name: 'Pelabuhan Peti Kemas', icon: '⚓', x: 268, z: -334, r: 40, access: 'pelabuhan', sea: { x: 270, z: -452 } },
    { id: 'pesiar', name: 'Terminal Pesiar', icon: '🛳️', x: -268, z: -334, r: 40, access: 'pesiar', sea: { x: -180, z: -452 } }
];
const byId = id => STATIONS.find(s => s.id === id);

const FARE = { bus: 6, busSubsidi: 2, ship: 15, plane: 40, tour: 25 };
const MODE = {
    bus: { icon: '🚌', label: 'Bus', cam: 60, speed: 24 },
    ship: { icon: '⛴️', label: 'Kapal Feri', cam: 120, speed: 22 },
    plane: { icon: '✈️', label: 'Pesawat', cam: 170, speed: 60 },
    tour: { icon: '🛩️', label: 'Tur Udara', cam: 190, speed: 55 }
};

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ease = u => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;

// ------------------------------------------------------------------ jalan raya (grid petak)
const T = () => GRID_CONFIG.TILE_SIZE;
const tileCenter = a => (a - GRID_CONFIG.HALF_TILES) * T() + T() / 2;
const toTile = v => Math.floor(v / T() + GRID_CONFIG.HALF_TILES);
const I0 = () => GRID_CONFIG.ACTIVE_MIN_I, I1 = () => GRID_CONFIG.ACTIVE_MAX_I;
const J0 = () => GRID_CONFIG.ACTIVE_MIN_J, J1 = () => GRID_CONFIG.ACTIVE_MAX_J;

/** Petak jalan terdekat ke titik dunia (dalam grid aktif). */
function nearestRoad(x, z) {
    const ci = Math.max(I0(), Math.min(I1(), toTile(x))), cj = Math.max(J0(), Math.min(J1(), toTile(z)));
    let best = null, bd = Infinity;
    for (let i = I0(); i <= I1(); i++) {
        for (let j = J0(); j <= J1(); j++) {
            if (roadAt(i, j) <= 0) continue;
            // utamakan kolektor/arteri: jalan gang dihitung sedikit lebih jauh
            const d = (i - ci) ** 2 + (j - cj) ** 2 + (roadAt(i, j) === 1 ? 6 : 0);
            if (d < bd) { bd = d; best = [i, j]; }
        }
    }
    return best;
}

/** Dijkstra di petak jalan; biaya arteri 2, kolektor 3, gang 6 (bus lewat jalan besar). */
function roadPath(a, b) {
    const W = I1() - I0() + 1, H = J1() - J0() + 1, N = W * H;
    const key = (i, j) => (i - I0()) * H + (j - J0());
    const dist = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
    const heap = [];
    const push = (k, d) => {
        heap.push([d, k]);
        let n = heap.length - 1;
        while (n > 0) { const p = (n - 1) >> 1; if (heap[p][0] <= heap[n][0]) break; [heap[p], heap[n]] = [heap[n], heap[p]]; n = p; }
    };
    const pop = () => {
        const top = heap[0], last = heap.pop();
        if (heap.length) {
            heap[0] = last;
            let n = 0;
            for (;;) {
                const l = 2 * n + 1, r = l + 1;
                let m = n;
                if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
                if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
                if (m === n) break;
                [heap[m], heap[n]] = [heap[n], heap[m]]; n = m;
            }
        }
        return top;
    };
    const s = key(a[0], a[1]), g = key(b[0], b[1]);
    dist[s] = 0; push(s, 0);
    while (heap.length) {
        const [d, k] = pop();
        if (k === g) break;
        if (d > dist[k]) continue;
        const i = Math.floor(k / H) + I0(), j = (k % H) + J0();
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const ni = i + di, nj = j + dj;
            if (ni < I0() || ni > I1() || nj < J0() || nj > J1()) continue;
            const c = roadAt(ni, nj);
            if (c <= 0) continue;
            const nk = key(ni, nj), nd = d + (c === 3 ? 2 : c === 2 ? 3 : 6);
            if (nd < dist[nk]) { dist[nk] = nd; prev[nk] = k; push(nk, nd); }
        }
    }
    if (prev[g] < 0 && g !== s) return null;
    const out = [];
    for (let k = g; k >= 0; k = prev[k]) out.push([Math.floor(k / H) + I0(), (k % H) + J0()]);
    out.reverse();
    // sisakan titik belok saja
    const pts = [];
    for (let n = 0; n < out.length; n++) {
        const p = out[n - 1], c = out[n], q = out[n + 1];
        if (!p || !q || (c[0] - p[0]) !== (q[0] - c[0]) || (c[1] - p[1]) !== (q[1] - c[1])) {
            pts.push(new THREE.Vector3(tileCenter(c[0]), LIFT, tileCenter(c[1])));
        }
    }
    return pts;
}

// ------------------------------------------------------------------ kendaraan
function makeBus() {
    const geo = pfGeo(BUS_ID);
    const g = new THREE.Group();
    if (geo) {
        // pfLiveMaterial = warna asli dari vertex color (pfMaterial polos membuat bus putih)
        const m = new THREE.Mesh(geo, pfLiveMaterial());
        m.scale.setScalar(pfScaleTo(BUS_ID, 'z', 11));
        m.castShadow = true;
        g.add(m);
        return g;
    }
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3, 11), new THREE.MeshLambertMaterial({ color: 0x2E86C1 }));
    body.position.y = 1.5; body.castShadow = true; g.add(body);
    return g;
}

function makePlane() {
    const geo = pfGeo(PLANE_ID);
    const g = new THREE.Group();
    if (geo) {
        const m = new THREE.Mesh(geo, pfLiveMaterial());
        m.scale.setScalar(pfScaleTo(PLANE_ID, 'z', 34));
        m.castShadow = true;
        g.add(m);
        return g;
    }
    const mat = new THREE.MeshLambertMaterial({ color: 0xF4F6F8 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 30, 12).rotateX(Math.PI / 2), mat);
    body.position.y = 2;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(30, 0.5, 6), mat);
    wing.position.y = 1.6;
    g.add(body, wing);
    return g;
}

/** Kapal feri prosedural (haluan +Z, lunas di muka laut). */
function makeFerry() {
    const g = new THREE.Group();
    const L = 30, W = 8;
    const part = (geo, hex, y) => {
        const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: hex }));
        m.position.y = y; m.castShadow = true; g.add(m); return m;
    };
    part(new THREE.BoxGeometry(W, 2.6, L), 0x1F4E79, SEA_Y + 1.3);                 // lambung
    // haluan setengah lingkaran menghadap +Z (theta -90°..+90°)
    const bow = part(new THREE.CylinderGeometry(W / 2, W / 2, 2.6, 10, 1, false, -Math.PI / 2, Math.PI), 0x1F4E79, SEA_Y + 1.3);
    bow.position.z = L / 2;
    part(new THREE.BoxGeometry(W - 0.6, 0.5, L - 0.4), 0xC0392B, SEA_Y + 2.85);     // dek merah
    part(new THREE.BoxGeometry(W - 1.6, 3.2, L * 0.55), 0xFDFEFE, SEA_Y + 4.7);     // kabin penumpang
    const funnel = part(new THREE.CylinderGeometry(0.9, 1.1, 3, 10), 0xF1C40F, SEA_Y + 7.7);
    funnel.position.z = -L * 0.12;
    return g;
}

// ------------------------------------------------------------------ sistem
export class TravelSystem {
    constructor({ scene, camera, hud, playerState, getWalk }) {
        this.scene = scene;
        this.camera = camera;
        this.hud = hud;
        this.ps = playerState;
        this.getWalk = getWalk || (() => null);
        this.trip = null;
        this.near = null;
        this.pathCache = new Map();
        // Halte Have-Not: titik jalan nyata terdekat ke pusat desa
        const hn = byId('halte_havenot'), t = nearestRoad(hn.x, hn.z);
        if (t) { hn.x = tileCenter(t[0]); hn.z = tileCenter(t[1]); }
        this.injectCss();
        this.buildDom();
        this.attachZoneButton();
    }

    isBusy() { return !!this.trip; }

    // ---------------------------------------------------------------- rute
    routesFrom(st) {
        const out = [];
        for (const d of STATIONS) {
            if (d === st) continue;
            const sub = st.havenot || d.havenot;
            out.push({ mode: 'bus', from: st, to: d, fare: sub ? FARE.busSubsidi : FARE.bus, note: sub ? 'Tarif subsidi desa' : '' });
        }
        if (st.sea) for (const d of STATIONS) if (d !== st && d.sea) out.push({ mode: 'ship', from: st, to: d, fare: FARE.ship });
        if (st.air) {
            // tujuan pesawat: yang jauh saja (terminal bis tetangga bandara cukup naik bus)
            for (const d of STATIONS) if (d !== st && Math.hypot(d.x - st.x, d.z - st.z) > 150) out.push({ mode: 'plane', from: st, to: d, fare: FARE.plane, note: 'Termasuk antar-jemput' });
            out.push({ mode: 'tour', from: st, to: st, fare: FARE.tour, note: 'Keliling kota, kembali ke Bandara' });
        }
        for (const r of out) { r.curve = this.curveFor(r); r.secs = r.curve ? Math.round(r.curve.getLength() / MODE[r.mode].speed) + 3 : 0; }
        return out.filter(r => r.curve);
    }

    curveFor(r) {
        const k = `${r.mode}:${r.from.id}:${r.to.id}`;
        if (this.pathCache.has(k)) return this.pathCache.get(k);
        let pts = null;
        const V = (x, y, z) => new THREE.Vector3(x, y, z);
        const { from: A, to: B } = r;
        if (r.mode === 'bus') {
            // Stasiun pesisir: lewat jalan akses (stasiun -> ujung kota), lalu jaringan jalan kota
            const leg = st => (st.access ? COAST_ROADS[st.access].map(([x, z]) => V(x, LIFT, z)) : [V(st.x, LIFT, st.z)]);
            const legA = leg(A).reverse(), legB = leg(B);
            const ea = legA[legA.length - 1], sb = legB[0];
            const a = nearestRoad(ea.x, ea.z), b = nearestRoad(sb.x, sb.z);
            const mid = a && b ? roadPath(a, b) : null;
            if (mid && mid.length) {
                // buang titik kembar (stasiun tepat di petak jalan) agar tangen kurva tidak nol
                pts = [V(A.x, LIFT, A.z), ...legA, ...mid, ...legB, V(B.x, LIFT, B.z)]
                    .filter((p, n, arr) => n === 0 || p.distanceTo(arr[n - 1]) > 1);
            }
        } else if (r.mode === 'ship') {
            const y = SEA_Y, a = A.sea, b = B.sea, mx = (a.x + b.x) / 2;
            pts = [V(a.x, y, a.z), V(a.x, y, -490), V(a.x + Math.sign(mx - a.x) * 60, y, -525),
                V(mx, y, -545), V(b.x + Math.sign(mx - b.x) * 60, y, -525), V(b.x, y, -490), V(b.x, y, b.z)];
        } else {
            // lepas landas barat -> timur di runway, menanjak
            pts = [V(-255, RUNWAY_Y, RUNWAY_Z), V(-170, RUNWAY_Y, RUNWAY_Z), V(-90, 12, RUNWAY_Z), V(-20, 45, RUNWAY_Z - 10)];
            if (r.mode === 'tour') {
                pts.push(V(150, 70, 140), V(300, 75, -40), V(200, 80, -300), V(-60, 80, -380),
                    V(-330, 75, -200), V(-360, 65, 60), V(-300, 40, 206), V(-200, 14, RUNWAY_Z), V(-120, RUNWAY_Y, RUNWAY_Z));
            } else {
                const dx = B.x, dz = B.z, last = pts[pts.length - 1];
                pts.push(V((last.x + dx) / 2, 80, (last.z + dz) / 2), V(dx, 55, dz + 40), V(dx, 30, dz));
            }
        }
        const curve = pts && pts.length >= 2 ? new THREE.CatmullRomCurve3(pts, false, 'catmullrom', r.mode === 'bus' ? 0.15 : 0.5) : null;
        this.pathCache.set(k, curve);
        return curve;
    }

    // ---------------------------------------------------------------- UI
    injectCss() {
        if (document.getElementById('travel-css')) return;
        const s = document.createElement('style');
        s.id = 'travel-css';
        s.textContent = `
#travel-prompt{position:fixed;left:50%;bottom:150px;transform:translateX(-50%);z-index:60;display:none;
 padding:12px 20px;border-radius:999px;border:2px solid #fff;background:#C0392B;color:#fff;font:700 15px/1 system-ui,sans-serif;
 box-shadow:0 6px 18px rgba(0,0,0,.3);cursor:pointer;white-space:nowrap}
#travel-prompt.show{display:block}
#travel-fade{position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .6s;z-index:90}
#travel-ride{position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:61;display:none;align-items:center;gap:10px;
 padding:8px 10px 8px 16px;border-radius:999px;background:rgba(20,24,30,.82);color:#fff;font:600 14px system-ui,sans-serif;max-width:calc(100vw - 32px)}
#travel-ride.show{display:flex}
#travel-ride .bar{width:90px;height:6px;border-radius:3px;background:rgba(255,255,255,.25);overflow:hidden;flex:none}
#travel-ride .bar i{display:block;height:100%;width:0;background:#F1C40F}
#travel-ride button{border:0;border-radius:999px;padding:6px 12px;background:#fff;color:#222;font:700 13px system-ui,sans-serif;cursor:pointer;flex:none}
.travel-list{display:flex;flex-direction:column;gap:8px}
.travel-sec{font:700 12px system-ui,sans-serif;text-transform:uppercase;letter-spacing:.06em;opacity:.65;margin:8px 0 0}
.travel-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;border:1px solid rgba(0,0,0,.12);background:rgba(255,255,255,.6)}
.travel-row .ic{font-size:24px;flex:none}
.travel-row .tx{flex:1;min-width:0}
.travel-row .tx b{display:block;font-size:15px}
.travel-row .tx small{opacity:.7}
.travel-row button{flex:none;min-width:84px}
.travel-coins{font-weight:700}`;
        document.head.appendChild(s);
    }

    buildDom() {
        const el = (tag, id, html = '') => {
            let e = document.getElementById(id);
            if (!e) { e = document.createElement(tag); e.id = id; document.body.appendChild(e); }
            e.innerHTML = html;
            return e;
        };
        this.promptEl = el('button', 'travel-prompt');
        this.promptEl.addEventListener('click', e => { e.stopPropagation(); if (this.near) this.openCounter(this.near); });
        this.fadeEl = el('div', 'travel-fade');
        this.rideEl = el('div', 'travel-ride', '<span class="lbl"></span><span class="bar"><i></i></span><button type="button">Lewati ⏩</button>');
        this.rideEl.querySelector('button').addEventListener('click', e => { e.stopPropagation(); if (this.trip) this.trip.t = this.trip.dur; });
        this.modal = el('div', 'travel-modal-overlay');
        this.modal.className = 'modal-backdrop';
        this.modal.addEventListener('click', e => { if (e.target === this.modal) this.closeCounter(); });
    }

    attachZoneButton() {
        let tries = 0;
        const go = () => {
            const group = document.querySelector('#hud-cam-presets .zone-nav-group');
            if (!group) { if (++tries < 40) setTimeout(go, 500); return; }
            if (group.querySelector('.btn-zone-travel')) return;
            const b = document.createElement('button');
            b.className = 'btn-view btn-zone-travel';
            b.title = 'Beli tiket bus, kapal, atau pesawat dari stasiun terdekat';
            b.textContent = '🎫 Perjalanan';
            group.appendChild(b);
            b.addEventListener('click', e => {
                e.stopPropagation();
                const w = this.getWalk();
                const p = w && w.isActive() ? w.pos : this.camera.target;
                this.openCounter(this.nearestStation(p.x, p.z));
            });
        };
        go();
    }

    nearestStation(x, z) {
        let best = STATIONS[0], bd = Infinity;
        for (const s of STATIONS) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
        return best;
    }

    openCounter(st) {
        if (this.trip) return;
        const coins = this.ps.state.coins || 0;
        const routes = this.routesFrom(st);
        const groups = [['bus', 'Darat'], ['ship', 'Laut'], ['plane', 'Udara'], ['tour', 'Wisata Udara']];
        const rows = groups.map(([m, title]) => {
            const rs = routes.filter(r => r.mode === m);
            if (!rs.length) return '';
            return `<div class="travel-sec">${title}</div>` + rs.map(r => {
                const idx = routes.indexOf(r), M = MODE[r.mode];
                const name = r.mode === 'tour' ? 'Tur Udara Keliling Kota' : `${esc(r.to.icon)} ${esc(r.to.name)}`;
                const note = [`${M.label} · ±${r.secs} dtk`, r.note].filter(Boolean).map(esc).join(' · ');
                return `<div class="travel-row"><span class="ic">${M.icon}</span><span class="tx"><b>${name}</b><small>${note}</small></span>
<button type="button" class="btn-primary" data-r="${idx}" ${coins < r.fare ? 'disabled' : ''}>${r.fare} ₳</button></div>`;
            }).join('');
        }).join('');
        this.modal.innerHTML = `<div class="modal-card"><div class="modal-header"><h2>${esc(st.icon)} Loket ${esc(st.name)}</h2>
<button class="modal-close" type="button" aria-label="Tutup">×</button></div>
<div class="modal-body"><p>Saldo kamu: <span class="travel-coins">${coins} ₳</span>. Pilih tujuan, lalu nikmati perjalanannya.</p>
<div class="travel-list">${rows}</div></div></div>`;
        this.modal.querySelector('.modal-close').addEventListener('click', () => this.closeCounter());
        this.modal.querySelectorAll('button[data-r]').forEach(b => b.addEventListener('click', e => {
            e.stopPropagation();
            this.buy(routes[+b.dataset.r]);
        }));
        this.modal.classList.add('active');
    }

    closeCounter() { this.modal.classList.remove('active'); }

    buy(r) {
        if (!r || this.trip) return;
        if (!this.ps.deductCoins(r.fare)) {
            this.hud.showToast('🎫 Koin kurang', `Tiket ${MODE[r.mode].label} butuh ${r.fare} ₳.`, '⚠️');
            return;
        }
        if (this.ps.notify) this.ps.notify();
        if (this.hud.updatePlayerUI) this.hud.updatePlayerUI(this.ps.state);
        if (this.hud.playMelodicCoinSound) this.hud.playMelodicCoinSound();
        this.closeCounter();
        this.start(r);
    }

    // ---------------------------------------------------------------- perjalanan
    start(r) {
        const vehicle = r.mode === 'bus' ? makeBus() : r.mode === 'ship' ? makeFerry() : makePlane();
        vehicle.name = 'travel_vehicle';
        this.scene.add(vehicle);
        const cam = this.camera;
        const walk = this.getWalk();
        const walking = !!(walk && walk.isActive());
        if (walking && walk.group) walk.group.visible = false;
        this.trip = {
            r, vehicle, walking, t: 0, dur: Math.max(6, r.curve.getLength() / MODE[r.mode].speed), done: false,
            saved: { dist: cam.distanceDesired, elev: cam.elevationDesired }
        };
        cam.distanceDesired = MODE[r.mode].cam;
        cam.elevationDesired = (r.mode === 'bus' ? 34 : 38) * Math.PI / 180;
        this.rideEl.querySelector('.lbl').textContent = `${MODE[r.mode].icon} ${r.mode === 'tour' ? 'Tur Udara' : 'Menuju ' + r.to.name}`;
        this.rideEl.classList.add('show');
        this.promptEl.classList.remove('show');
        this.place(0);
    }

    place(u) {
        const { r, vehicle } = this.trip;
        const c = r.curve, p = c.getPointAt(u), tg = c.getTangentAt(Math.min(u, 0.999));
        vehicle.position.copy(p);
        vehicle.rotation.order = 'YXZ';
        vehicle.rotation.y = Math.atan2(tg.x, tg.z);
        if (r.mode === 'plane' || r.mode === 'tour') {
            vehicle.rotation.x = -Math.asin(Math.max(-1, Math.min(1, tg.y))) * 0.8;
            const ahead = c.getTangentAt(Math.min(0.999, u + 0.02));
            const turn = Math.atan2(ahead.x, ahead.z) - vehicle.rotation.y;
            vehicle.rotation.z = -Math.atan2(Math.sin(turn), Math.cos(turn)) * 6;
        } else if (r.mode === 'ship') {
            vehicle.rotation.z = Math.sin(this.trip.t * 1.3) * 0.03;
        }
        this.camera.targetDesired.set(p.x, Math.max(0, p.y * 0.6), p.z);
    }

    finish() {
        const trip = this.trip;
        trip.done = true;
        this.fadeEl.style.opacity = '1';
        setTimeout(() => {
            this.scene.remove(trip.vehicle);
            trip.vehicle.traverse(o => { if (o.isMesh && o.geometry && o.geometry !== pfGeo(PLANE_ID) && o.geometry !== pfGeo(BUS_ID)) o.geometry.dispose(); });
            const d = trip.r.to, cam = this.camera, walk = this.getWalk();
            if (trip.walking && walk) {
                walk.pos.set(d.x, 0, d.z);
                if (walk.findFreeSpawn) walk.findFreeSpawn();
                if (walk.group) { walk.group.visible = true; walk.group.position.copy(walk.pos); }
            }
            cam.targetDesired.set(d.x, 0, d.z);
            if (cam.target) cam.target.set(d.x, 0, d.z);
            cam.distanceDesired = trip.saved.dist;
            cam.elevationDesired = trip.saved.elev;
            this.rideEl.classList.remove('show');
            this.trip = null;
            this.fadeEl.style.opacity = '0';
            this.hud.showToast(`${d.icon} Tiba di ${d.name}`, trip.r.mode === 'tour' ? 'Tur udara selesai. Terima kasih sudah terbang bersama AUDIRA Air!' : 'Selamat datang. Hati-hati di jalan!', '🎫');
        }, 650);
    }

    update(dt) {
        if (this.trip) {
            if (this.trip.done) return;
            this.trip.t = Math.min(this.trip.dur, this.trip.t + dt);
            const u = this.trip.t / this.trip.dur;
            this.place(this.trip.r.mode === 'bus' || this.trip.r.mode === 'ship' ? ease(u) : u);
            this.rideEl.querySelector('.bar i').style.width = `${(u * 100).toFixed(1)}%`;
            if (u >= 1) this.finish();
            return;
        }
        // Tombol loket muncul saat tokoh dekat stasiun (Mode Jalan saja)
        const w = this.getWalk();
        let near = null;
        if (w && w.isActive()) {
            for (const s of STATIONS) if (Math.hypot(s.x - w.pos.x, s.z - w.pos.z) < s.r) { near = s; break; }
        }
        if (near !== this.near) {
            this.near = near;
            this.promptEl.textContent = near ? `🎫 Loket ${near.name}` : '';
            this.promptEl.classList.toggle('show', !!near);
        }
    }
}
