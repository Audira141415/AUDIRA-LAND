/**
 * AUDIRA-LAND: Kontrol Mode Jalan (Joystick + Emote + Tombol Mode)
 * Joystick layar kiri-bawah, bar emote kanan-bawah, tombol alih mode.
 * getInput() dibaca tiap frame oleh WalkMode. Lari otomatis saat knob mentok (mag > 0.85).
 *
 * Dependensi: { onToggleWalk(): boolean(active), onEmote(key), isWalkActive(): boolean }
 */

const EMOTES = [['wave', '👋'], ['dance', '🕺'], ['sit', '🪑'], ['cheer', '🙌']];
const RADIUS = 52;

export class TouchControls {
    constructor(opts = {}) {
        this.o = opts;
        this.vec = { x: 0, y: 0, run: false };
        this.dragId = null;
        this.mount();
    }

    mount() {
        let el = document.getElementById('walk-controls');
        if (!el) {
            el = document.createElement('div');
            el.id = 'walk-controls';
            document.body.appendChild(el);
        }
        this.el = el;
        el.innerHTML = `
            <button class="walk-toggle" id="walk-toggle" title="Mode Jalan: jelajahi kota sebagai tokoh">🚶 Mode Jalan</button>
            <div class="walk-pad" id="walk-pad" aria-hidden="true">
                <div class="walk-knob" id="walk-knob"></div>
            </div>
            <div class="walk-emotes" id="walk-emotes" aria-hidden="true">
                ${EMOTES.map(([k, e]) => `<button class="walk-emote" data-emote="${k}">${e}</button>`).join('')}
            </div>`;

        this.pad = el.querySelector('#walk-pad');
        this.knob = el.querySelector('#walk-knob');

        el.querySelector('#walk-toggle').addEventListener('click', () => {
            const active = this.o.onToggleWalk?.();
            this.setActiveUI(!!active);
        });
        el.querySelectorAll('.walk-emote').forEach((b) =>
            b.addEventListener('click', () => this.o.onEmote?.(b.dataset.emote)));

        this.pad.addEventListener('pointerdown', (e) => this.onDown(e));
        window.addEventListener('pointermove', (e) => this.onMove(e));
        window.addEventListener('pointerup', (e) => this.onUp(e));
        window.addEventListener('pointercancel', (e) => this.onUp(e));
    }

    setActiveUI(active) {
        this.el.classList.toggle('walking', active);
        const tgl = this.el.querySelector('#walk-toggle');
        tgl.textContent = active ? '🗺️ Mode Peta' : '🚶 Mode Jalan';
        tgl.classList.toggle('on', active);
        if (!active) this.reset();
    }

    reset() {
        this.vec = { x: 0, y: 0, run: false };
        this.dragId = null;
        if (this.knob) this.knob.style.transform = 'translate(0px, 0px)';
    }

    center() {
        const r = this.pad.getBoundingClientRect();
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    }

    onDown(e) {
        if (!this.el.classList.contains('walking')) return;
        this.dragId = e.pointerId;
        this.pad.setPointerCapture?.(e.pointerId);
        this.onMove(e);
    }

    onMove(e) {
        if (this.dragId !== e.pointerId) return;
        const { cx, cy } = this.center();
        let dx = e.clientX - cx;
        let dy = e.clientY - cy;
        const dist = Math.hypot(dx, dy);
        const clamped = Math.min(dist, RADIUS);
        const ang = Math.atan2(dy, dx);
        const kx = Math.cos(ang) * clamped;
        const ky = Math.sin(ang) * clamped;
        this.knob.style.transform = `translate(${kx}px, ${ky}px)`;
        const mag = clamped / RADIUS;
        this.vec.x = (dx / (dist || 1)) * mag;
        this.vec.y = (dy / (dist || 1)) * mag;
        this.vec.run = mag > 0.85;
    }

    onUp(e) {
        if (this.dragId !== e.pointerId) return;
        this.reset();
    }

    getInput() { return this.vec; }
}
