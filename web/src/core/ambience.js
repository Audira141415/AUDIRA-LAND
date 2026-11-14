/**
 * AUDIRA-LAND: Suasana Suara per Desa (Web Audio API, 0 KB aset)
 * Spek docs/SPEC_CIRI_KHAS_DESA.md bagian 2. Isi suara tiap desa dari VILLAGE_IDENTITY.<desa>.sound.
 *  - Dua bus suara: Desa Have & Desa Have-Not. Mengikuti target kamera (x < / > sungai),
 *    crossfade ±1,5 dtk saat target melewati sungai (setTargetAtTime, konstanta 0,5 dtk).
 *  - Desa Have: dengung lalu lintas (noise rendah), klakson sesekali, keramaian (gumam);
 *    malam: musik kafe lirih (arpeggio lembut).
 *  - Desa Have-Not: angin di sawah, kicau burung, kokok ayam pagi (05–08);
 *    malam: jangkrik, katak, kentongan ronda. Azan sintetis di jam salat (opsional, bisa dimatikan).
 * Browser hanya mengizinkan audio setelah interaksi pengguna, jadi start() dipanggil
 * pada sentuhan/klik pertama. Pilihan bisu & azan disimpan di localStorage.
 */

import { VILLAGE_IDENTITY, villageIdAtX } from './village_identity.js';

const KEY = 'audira_ambience_muted';
const AZAN_KEY = 'audira_ambience_azan';
// Perkiraan jam salat WIB (jam desimal); azan diputar sekali saat jam game melewatinya
const PRAYER_HOURS = [4.67, 11.92, 15.17, 17.92, 19.08];
const XFADE_TC = 0.5;   // detik; ±95% dalam 1,5 dtk

export class Ambience {
    constructor() {
        this.ctx = null;
        this.night = false;
        this.timers = [];
        this.village = 'have';
        this.hour = 12;
        this.lastHour = null;
        try { this.muted = localStorage.getItem(KEY) === '1'; } catch (e) { this.muted = false; }
        try { this.azanOn = localStorage.getItem(AZAN_KEY) !== '0'; } catch (e) { this.azanOn = true; }
    }

    start() {
        if (this.ctx || this.muted) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.0;
        this.master.connect(this.ctx.destination);
        this.master.gain.linearRampToValueAtTime(0.55, this.ctx.currentTime + 2.5);
        this.bus = {};
        for (const id of ['have', 'have_not']) {
            const g = this.ctx.createGain();
            g.gain.value = id === this.village ? 1 : 0;
            g.connect(this.master);
            this.bus[id] = g;
        }
        this.loops = {};
        this.noise = this.noiseBuffer();
        this.startWind();
        this.startTraffic();
        this.schedule();
    }

    setMuted(m) {
        this.muted = m;
        try { localStorage.setItem(KEY, m ? '1' : '0'); } catch (e) { /* abaikan */ }
        if (m && this.ctx) {
            this.timers.forEach(clearTimeout);
            this.timers = [];
            this.loops = {};
            this.ctx.close();
            this.ctx = null;
        } else if (!m) {
            this.start();
        }
    }

    /** Azan di jam salat (opsional). */
    setAzan(on) {
        this.azanOn = !!on;
        try { localStorage.setItem(AZAN_KEY, on ? '1' : '0'); } catch (e) { /* abaikan */ }
    }

    setNight(isNight) {
        this.night = isNight;
        if (this.ctx && this.trafficGain) {
            // Lalu lintas malam lebih sepi
            this.trafficGain.gain.setTargetAtTime(isNight ? 0.05 : 0.13, this.ctx.currentTime, 2);
        }
    }

    /**
     * Dipanggil tiap frame dari main.js: desa mengikuti target kamera, azan mengikuti jam game.
     * @param {number} dt
     * @param {{x:number}} target  target kamera (posisi dunia)
     * @param {number} hour        jam game (desimal)
     */
    update(dt, target, hour) {
        if (target) {
            const v = villageIdAtX(target.x);
            if (v !== this.village) {
                this.village = v;
                if (this.ctx) {
                    const t = this.ctx.currentTime;
                    for (const [id, g] of Object.entries(this.bus)) g.gain.setTargetAtTime(id === v ? 1 : 0, t, XFADE_TC);
                }
            }
        }
        if (Number.isFinite(hour)) {
            if (this.lastHour !== null && this.ctx && this.azanOn) {
                for (const p of PRAYER_HOURS) {
                    const crossed = this.lastHour <= hour ? (this.lastHour < p && hour >= p) : (this.lastHour < p || hour >= p);
                    if (crossed && Math.abs(hour - this.lastHour) < 2) { this.azan(); break; }
                }
            }
            this.lastHour = hour;
            this.hour = hour;
        }
    }

    /** Bus aktif (cukup keras untuk didengar) - suara desa yang tak terdengar tidak disintesis. */
    audible(id) {
        return this.bus && this.bus[id] && (this.village === id || this.bus[id].gain.value > 0.05);
    }

    noiseBuffer() {
        const len = this.ctx.sampleRate * 2;
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {
            last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; // brown noise: lembut
            d[i] = last * 3.5;
        }
        return buf;
    }

    loopNoise(filterType, freq, q, gain, dest) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noise;
        src.loop = true;
        src.playbackRate.value = 0.9 + Math.random() * 0.2;
        const f = this.ctx.createBiquadFilter();
        f.type = filterType;
        f.frequency.value = freq;
        f.Q.value = q;
        const g = this.ctx.createGain();
        g.gain.value = gain;
        src.connect(f).connect(g).connect(dest);
        src.start();
        return g;
    }

    /** Angin di sawah (Have-Not, lebih keras) + angin tipis kota (Have). */
    startWind() {
        for (const [id, base] of [['have_not', 0.22], ['have', 0.06]]) {
            const g = this.loopNoise('lowpass', 420, 0.7, base, this.bus[id]);
            const lfo = this.ctx.createOscillator();
            lfo.frequency.value = 0.07;
            const lfoGain = this.ctx.createGain();
            lfoGain.gain.value = base * 0.55;
            lfo.connect(lfoGain).connect(g.gain);
            lfo.start();
        }
    }

    /** Dengung lalu lintas kota (Have): noise rendah + desis ban, bergelombang pelan. */
    startTraffic() {
        this.trafficGain = this.ctx.createGain();
        this.trafficGain.gain.value = this.night ? 0.05 : 0.13;
        this.trafficGain.connect(this.bus.have);
        this.loopNoise('lowpass', 160, 0.8, 1.0, this.trafficGain);
        const hiss = this.loopNoise('bandpass', 900, 0.6, 0.25, this.trafficGain);
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 0.11;
        const lg = this.ctx.createGain();
        lg.gain.value = 0.15;
        lfo.connect(lg).connect(hiss.gain);
        lfo.start();
    }

    later(key, fn, ms) {
        const id = setTimeout(() => {
            this.timers = this.timers.filter(t => t !== id);
            if (this.ctx && document.visibilityState === 'visible') fn();
            this.loops[key] = false;
            this.schedule();
        }, ms);
        this.timers.push(id);
        this.loops[key] = true;
    }

    /** Rantai acara per kategori; tiap kategori punya satu timer. */
    schedule() {
        if (!this.ctx) return;
        this.loops = this.loops || {};
        const L = this.loops, h = this.hour;
        const S = { have: VILLAGE_IDENTITY.have.sound, have_not: VILLAGE_IDENTITY.have_not.sound };
        const on = (id, name) => this.audible(id) && (this.night ? S[id].night : S[id].day).includes(name);
        // --- Desa Have ---
        if (!L.honk) this.later('honk', () => on('have', 'klakson') && this.honk(), 4000 + Math.random() * 9000);
        if (!L.crowd) this.later('crowd', () => on('have', 'keramaian') && this.crowd(), 1500 + Math.random() * 2500);
        if (!L.cafe) this.later('cafe', () => on('have', 'musik_kafe') && this.cafeMusic(), 3500 + Math.random() * 3000);
        // --- Desa Have-Not ---
        if (!L.bird) this.later('bird', () => on('have_not', 'burung') && this.bird(this.bus.have_not), 1500 + Math.random() * 4500);
        if (!L.rooster) this.later('rooster', () => on('have_not', 'ayam') && h >= 5 && h < 8 && this.rooster(), 5000 + Math.random() * 9000);
        if (!L.cricket) this.later('cricket', () => on('have_not', 'jangkrik') && this.cricket(), 600 + Math.random() * 1400);
        if (!L.frog) this.later('frog', () => on('have_not', 'katak') && this.frog(), 1200 + Math.random() * 3000);
        if (!L.kentong) this.later('kentong', () => on('have_not', 'kentongan') && this.kentongan(), 14000 + Math.random() * 20000);
        // Burung sesekali juga di taman kota (siang, pelan)
        if (!L.cityBird) this.later('cityBird', () => !this.night && this.audible('have') && this.bird(this.bus.have, 0.5), 6000 + Math.random() * 9000);
    }

    tone(dest, type, f0, f1, t, dur, peak, filter = null) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0, t);
        if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.02, dur * 0.2));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        if (filter) { o.connect(filter); filter.connect(g); } else o.connect(g);
        g.connect(dest);
        o.start(t);
        o.stop(t + dur + 0.02);
        return o;
    }

    pan(dest) {
        if (!this.ctx.createStereoPanner) return dest;
        const p = this.ctx.createStereoPanner();
        p.pan.value = Math.random() * 1.6 - 0.8;
        p.connect(dest);
        return p;
    }

    bird(dest = this.bus.have_not, vol = 1) {
        const t0 = this.ctx.currentTime;
        const notes = 2 + Math.floor(Math.random() * 4);
        const base = 2200 + Math.random() * 1600;
        const out = this.pan(dest);
        for (let n = 0; n < notes; n++) {
            const t = t0 + n * (0.09 + Math.random() * 0.05);
            this.tone(out, 'sine', base * (0.9 + Math.random() * 0.25), base * (1.25 + Math.random() * 0.3), t, 0.08, 0.05 * vol);
        }
    }

    /** Klakson mobil: dua nada kotak pendek (kadang dua kali). */
    honk() {
        const t0 = this.ctx.currentTime;
        const out = this.pan(this.bus.have);
        const bp = () => { const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 1.2; return f; };
        const reps = Math.random() < 0.4 ? 2 : 1;
        for (let r = 0; r < reps; r++) {
            const t = t0 + r * 0.28;
            this.tone(out, 'square', 415, 415, t, 0.2, 0.025, bp());
            this.tone(out, 'square', 523, 523, t, 0.2, 0.02, bp());
        }
    }

    /** Keramaian: gumam suara orang (noise ber-formant, potongan pendek acak). */
    crowd() {
        const t0 = this.ctx.currentTime;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let k = 0; k < n; k++) {
            const t = t0 + k * (0.15 + Math.random() * 0.3);
            const src = this.ctx.createBufferSource();
            src.buffer = this.noise;
            const f = this.ctx.createBiquadFilter();
            f.type = 'bandpass';
            f.frequency.setValueAtTime(500 + Math.random() * 700, t);
            f.frequency.linearRampToValueAtTime(400 + Math.random() * 900, t + 0.4);
            f.Q.value = 5;
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.16, t + 0.08);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
            src.connect(f).connect(g).connect(this.pan(this.bus.have));
            src.start(t, Math.random());
            src.stop(t + 0.55);
        }
    }

    /** Musik kafe lirih: arpeggio 4 nada (akor maj7) segitiga + lowpass. */
    cafeMusic() {
        const t0 = this.ctx.currentTime;
        const roots = [261.63, 293.66, 220.0, 246.94];
        const root = roots[Math.floor(Math.random() * roots.length)];
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1400;
        lp.connect(this.bus.have);
        [1, 1.26, 1.5, 1.888, 1.5, 1.26].forEach((m, k) => {
            this.tone(lp, 'triangle', root * m, root * m, t0 + k * 0.32, 0.9, 0.022);
        });
        this.tone(lp, 'sine', root / 2, root / 2, t0, 1.8, 0.02);
    }

    /** Kokok ayam: "ku-ku-ruu-yuuk" (gergaji, nada naik lalu turun panjang). */
    rooster() {
        const t0 = this.ctx.currentTime;
        const out = this.pan(this.bus.have_not);
        const bp = () => { const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 2; return f; };
        const seg = [[620, 700, 0, 0.14], [660, 760, 0.18, 0.14], [700, 980, 0.36, 0.28], [980, 640, 0.66, 0.6]];
        for (const [f0, f1, dt, dur] of seg) this.tone(out, 'sawtooth', f0, f1, t0 + dt, dur, 0.035, bp());
    }

    cricket() {
        const t0 = this.ctx.currentTime;
        const freq = 4200 + Math.random() * 900;
        for (let n = 0; n < 3; n++) this.tone(this.bus.have_not, 'sine', freq, freq, t0 + n * 0.06, 0.04, 0.018);
    }

    /** Katak sawah: dengkur rendah berdenyut. */
    frog() {
        const t0 = this.ctx.currentTime;
        const out = this.pan(this.bus.have_not);
        const base = 140 + Math.random() * 60;
        const lp = () => { const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; return f; };
        const n = 2 + Math.floor(Math.random() * 3);
        for (let k = 0; k < n; k++) this.tone(out, 'square', base * 1.2, base, t0 + k * 0.22, 0.14, 0.03, lp());
    }

    kentongan() {
        // Pola pukulan siskamling: tok-tok ... tok
        const pattern = [0, 0.32, 0.64, 1.3];
        const t0 = this.ctx.currentTime;
        for (const dt of pattern) {
            const bp = this.ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = 650;
            bp.Q.value = 6;
            this.tone(this.bus.have_not, 'triangle', 720, 520, t0 + dt, 0.22, 0.09, bp);
        }
    }

    /**
     * Azan sintetis (jauh & pelan): suara sinus bervibrato meliuk pada beberapa nada maqam, ±8 dtk.
     * Terdengar di kedua desa (lebih jelas di Have-Not). Bisa dimatikan lewat setAzan(false).
     */
    azan() {
        if (!this.ctx || !this.azanOn) return;
        const t0 = this.ctx.currentTime + 0.1;
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1800;
        const g = this.ctx.createGain();
        g.gain.value = 0.0001;
        // Gema sederhana (masjid jauh)
        const dl = this.ctx.createDelay(1.0);
        dl.delayTime.value = 0.32;
        const fb = this.ctx.createGain();
        fb.gain.value = 0.35;
        lp.connect(g);
        g.connect(this.bus.have_not);
        g.connect(dl); dl.connect(fb); fb.connect(dl);
        dl.connect(this.bus.have_not);
        const dim = this.ctx.createGain();
        dim.gain.value = 0.5;
        g.connect(dim).connect(this.bus.have);
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        const vib = this.ctx.createOscillator();
        vib.frequency.value = 5.2;
        const vibG = this.ctx.createGain();
        vibG.gain.value = 5;
        vib.connect(vibG).connect(o.frequency);
        const notes = [293.7, 311.1, 349.2, 392.0, 349.2, 311.1, 293.7, 293.7];
        let t = t0;
        notes.forEach((f, k) => {
            o.frequency.setTargetAtTime(f, t, 0.12);
            t += k === notes.length - 1 ? 1.6 : 0.9 + (k % 3) * 0.25;
        });
        g.gain.setTargetAtTime(0.05, t0, 0.4);
        g.gain.setTargetAtTime(0.0001, t - 0.8, 0.5);
        o.connect(lp);
        o.start(t0); vib.start(t0);
        o.stop(t + 1.5); vib.stop(t + 1.5);
    }
}
