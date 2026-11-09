/* AUDIRA LAND · util: hash, rng, noise, warna, format angka. */
window.AL = window.AL || {};
(function (AL) {
  'use strict';

  AL.hash32 = function (str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
    return h >>> 0;
  };

  // hash integer 2D -> [0,1)
  AL.ihash = function (x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  // mulberry32
  AL.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const lerp = (a, b, t) => a + (b - a) * t;
  AL.lerp = lerp;
  AL.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  AL.pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];
  AL.ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  AL.noise = function (x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = AL.ihash(xi, yi, seed), b = AL.ihash(xi + 1, yi, seed);
    const c = AL.ihash(xi, yi + 1, seed), d = AL.ihash(xi + 1, yi + 1, seed);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
  AL.fbm = function (x, y, seed) {
    let s = 0, amp = 0.5, f = 1, n = 0;
    for (let o = 0; o < 4; o++) { s += AL.noise(x * f, y * f, seed + o * 101) * amp; n += amp; amp *= 0.5; f *= 2; }
    return s / n;
  };

  // ---- warna ----
  const cache = new Map();
  function hexToRgb(h) {
    let v = cache.get(h);
    if (v) return v;
    let s = h.replace('#', '');
    if (s.length === 3) s = s.split('').map(c => c + c).join('');
    const n = parseInt(s, 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    cache.set(h, v);
    return v;
  }
  function rgbToHex(r, g, b) {
    const c = x => Math.round(AL.clamp(x, 0, 255));
    return '#' + ((1 << 24) | (c(r) << 16) | (c(g) << 8) | c(b)).toString(16).slice(1);
  }
  AL.shade = (hex, f) => { const [r, g, b] = hexToRgb(hex); return rgbToHex(r * f, g * f, b * f); };
  AL.mix = (h1, h2, t) => {
    const a = hexToRgb(h1), b = hexToRgb(h2);
    return rgbToHex(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));
  };
  AL.NIGHT = '#1a2342';

  AL.fmtInt = n => Math.floor(n).toLocaleString('id-ID');
  AL.fmtKoin = n => Math.floor(n).toLocaleString('id-ID') + ' koin';
  AL.fmtDate = ms => new Date(ms).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  AL.fmtDur = ms => {
    const d = Math.floor(ms / 86400000);
    if (d >= 1) return d + ' hari';
    const h = Math.floor(ms / 3600000);
    if (h >= 1) return h + ' jam';
    return Math.max(1, Math.floor(ms / 60000)) + ' menit';
  };
  AL.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
})(window.AL);
