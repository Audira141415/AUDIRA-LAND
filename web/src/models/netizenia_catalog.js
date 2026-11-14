/**
 * AUDIRA-LAND - Scraped & Enhanced Complete Netizenia Architecture Catalog
 * Extracted from https://republiknetizenia.pages.dev/v2/
 * Contains 36 complete building types, procedural geometry generators,
 * Warm Ink Nusantara color tokens, and Zero-Submerging Surface Policy alignment.
 */

import { protectMaterial } from '../core/static_batcher.js';

const THREE = (typeof window !== 'undefined' && window.THREE) ? window.THREE : (globalThis.THREE || {});

// Constants & Floor Dimensions
export const LANTAI = 3.2;
export const LANTAI_USAHA = 4.2;
export const MANUSIA = 1.7;
export const PINTU_W = 1.0;
export const PINTU_H = 2.1;
export const TROTOAR = 1.4;
export const ASPAL = 5.2;
export const CURB = 0.22;
export const T = 8.0;

export const clamp = (a, min, max) => Math.max(min, Math.min(max, a));

// Color Palette & Tokens
export const GENTENG = ["#9C4935","#8E3E34","#A8553B","#9C4935","#A8553B","#5E6670","#4F555C","#5E6670","#4F6D5A","#6B5546"];
export const KUSEN = "#EDE8DC";
export const KACA = ["#C9D6E0","#7D93A8"];
export const LAMPU = "#F2CF8A";
export const RUMPUT = ["#8FA462","#7F9455"];
export const PAVING = ["#CFC6B8","#C9C1B2","#CFC3AE","#CFC6B4","#C9BFA6","#C6B898"];
export const WALLS = ["#DDD0B4","#C9BBA2","#B98C6E","#956350","#C9A86A","#8E9A78","#8FA0AA","#C9A4A0","#6C6A66","#E3DED2"];
export const ZONE_BASE = {
  CBD: "#CFC6B8",
  RUKO: "#C9C1B2",
  RUKO_KECIL: "#CFC3AE",
  KAMPUNG: "#CFC6B4",
  KOTA: "#8FA462",
  DESA: "#7F9455"
};
export const AKSEN = ["#A9463A","#4F7A55","#4C6A96","#C2913A","#6F5E8C","#9C4935","#3F6B62","#8E3E34","#3F7D92","#B06A7C"];

export const PAL = {
  nat: "#BFB6A8",
  aspal: "#45464A",
  trotoar: "#CFC9BC",
  curb: "#A9A398",
  marka: "#E8E6DF",
  zebra: "#D9D7CE",
  pasir: "#D3C293",
  tanah: "#C9A06A",
  air: "#7F93A6",
  airTepi: "#6B7E92",
  pintu: "#5A4636",
  pintu2: "#4E3C2E",
  gagang: "#B8922E",
  kayu: ["#8C6A48","#5E4630","#7A5A3A"],
  putih: ["#E6E2D8","#DDD9CE","#D9D4C8","#E3DED2","#E2D6B8"],
  bendera: ["#B5473A","#E6E2D8"],
  besi: "#2B2B2B",
  bingkai: "#2B2F33",
  beton: "#9E9A90",
  betonGelap: "#6F6A60",
  seng: "#6E7F8A",
  abu: "#8E979C",
  abuGelap: "#5E666C",
  logam: "#8A939A",
  negara: "#8E3E34",
  ban: "#1E1C1A",
  pohon: { batang: "#5E4630", atas: "#7FA850", tengah: "#6A9245", bawah: "#4F7239" },
  cemara: ["#4E3C2E","#3F5E44","#4A6B4A","#557A52"],
  palem: "#5C7D3E",
  semak: "#5F7A3F",
  padi: ["#9DC25B","#7EAF4F"],
  sawahAir: "#B8D9D4",
  pematang: "#B59A6A",
  bedeng: "#7E9452"
};

// Global Primitives accumulator for procedural generation
let P = [];
let G = [];

export const box = (a, t, o, n, e, s, r, l) => P.push({ g: "box", s: [a, t, o], p: [n, e + t / 2, s], c: r, ry: l });
export const pyr = (a, t, o, n, e, s, r, l) => P.push({ g: "pyr", s: [a, t, o], p: [n, e + t / 2, s], c: r, ry: l });
export const roof = (a, t, o, n, e, s, r, l) => P.push({ g: "prism", s: [a, t, o], p: [n, e + t / 2, s], c: r, ry: l });
export const cyl = (a, t, o, n, e, s) => P.push({ g: "cyl", s: [2 * a, t, 2 * a], p: [o, n + t / 2, e], c: s });
export const cone = (a, t, o, n, e, s) => P.push({ g: "cone", s: [2 * a, t, 2 * a], p: [o, n + t / 2, e], c: s });
export const sph = (a, t, o, n, c, sy) => P.push({ g: "sph", s: [2 * a, 2 * (sy || a), 2 * a], p: [t, o, n], c: c });
export const gbox = (a, t, o, n, e, s, r) => G.push({ g: "box", s: [a, t, o], p: [n, e + t / 2, s], c: r || KACA[0], c2: r && r !== KACA[0] ? r : KACA[1] });
export const gsph = (a, t, o, n, e) => G.push({ g: "sph", s: [2 * a, 2 * a, 2 * a], p: [t, o, n], c: e || LAMPU });

export function winRow(a, t, o, n, e, s, r) {
  e = e || 0.9;
  s = s || 0.8;
  r = r || 0;
  for (let l = 0; l < a; l++) {
    const i = r - t / 2 + t * (l + 0.5) / a;
    box(s + 0.22, e + 0.22, 0.08, i, o - 0.11, n - 0.02, "#EDE8DC");
    gbox(s, e, 0.1, i, o, n);
  }
}

export function winSide(a, t, o, n, e) {
  e = e || 0.9;
  for (let s = 0; s < a; s++) {
    gbox(0.1, e, 0.75, n, o, -t / 2 + t * (s + 0.5) / a);
  }
}

export function door(a, t, o, n, e) {
  box(n = n || PINTU_W, e = e || PINTU_H, 0.14, a, 0, t, o || "#5A4636");
  box(0.12, 0.12, 0.05, a + 0.32 * n, 0.5 * e, t + 0.09, "#B8922E");
}

export function flag(a, t, o, n) {
  cyl(0.08, n, a, t, o, "#8A939A");
  sph(0.14, a, t + n + 0.05, o, "#B8922E");
  box(0.06, 0.6, 1.6, a, t + n - 0.7, o + 0.82, "#B5473A");
  box(0.06, 0.6, 1.6, a, t + n - 1.3, o + 0.82, "#E6E2D8");
}

export function tree(a, t, o, n) {
  o = 1.4 * (o || 1);
  if ("palm" !== n) {
    cyl(0.2 * o, 1.3 * o, a, 0, t, "#5E4630");
    sph(1.05 * o, a, 1.3 * o + 0.85 * o, t, "#6A9245", 0.95 * o);
    sph(0.7 * o, a + 0.45 * o, 1.3 * o + 1.35 * o, t - 0.2 * o, "#7FA850");
  } else {
    cyl(0.18 * o, 3.6 * o, a, 0, t, "#8C6A48");
    for (let n = 0; n < 5; n++) {
      const e = n / 5 * Math.PI * 2;
      box(0.25 * o, 0.12 * o, 2.2 * o, a + 1 * Math.cos(e) * o, 3.5 * o, t + 1 * Math.sin(e) * o, "#5C7D3E", Math.PI / 2 - e);
    }
    sph(0.3 * o, a, 3.6 * o, t, "#7A5A3A");
  }
}

export function bush(a, t, o) {
  sph(0.55 * (o = o || 1), a, 0.4 * o, t, "#5F7A3F", 0.4 * o);
}

export function fence(a, t, o, n, e, s) {
  n = n || "#E6E2D8";
  s = s || 0;
  if (e) {
    const t = (a - e) / 2;
    for (const a of [-1, 1]) {
      box(t, 0.5, 0.1, s + a * (e + t) / 2, 0, o, n);
      for (let r = 0; r <= 3; r++) box(0.14, 0.7, 0.14, s + a * (e / 2 + t * r / 3), 0, o, n);
    }
  } else {
    box(a, 0.5, 0.1, s, 0, o, n);
    for (let t = 0; t <= 6; t++) box(0.14, 0.7, 0.14, s - a / 2 + a * t / 6, 0, o, n);
  }
}

export function tapak(a, t, o, n) {
  const e = a + 0.8,
    s = t + 0.8,
    r = o && o.adj || {},
    l = 0.9 * a,
    i = t * (n || 0.92),
    c = r.l ? -e / 2 : -l / 2,
    u = r.r ? e / 2 : l / 2,
    d = -s / 2 + 0.3,
    h = d + i;
  return { bw: u - c, bd: i, xl: c, xr: u, cx: (c + u) / 2, zb: d, zf: h, zc: (d + h) / 2, LW: e, LD: s, l: !!r.l, r: !!r.r };
}

export const ovX = (a, t) => [a.bw + (a.l ? 0 : t) + (a.r ? 0 : t), a.cx + ((a.r ? 0 : t) - (a.l ? 0 : t)) / 2];

export function lampPost(a, t) {
  cyl(0.08, 3.2, a, 0, t, "#2B2B2B");
  box(0.7, 0.12, 0.25, a + 0.3, 3.15, t, "#2B2B2B");
  gbox(0.4, 0.1, 0.2, a + 0.5, 3.05, t, "#F2CF8A");
}

// --- Warm Nusantara Color & Shading Helpers ---
export const _hexArr = (a) => {
  let t = String(a || "#FFFFFF");
  if (t[0] !== "#" && typeof THREE !== 'undefined' && THREE.Color) {
    t = "#" + new THREE.Color(t).getHexString();
  }
  if (t.length === 4) {
    t = "#" + t[1] + t[1] + t[2] + t[2] + t[3] + t[3];
  }
  const o = parseInt(t.slice(1, 7), 16) || 0;
  return [(o >> 16) & 255, (o >> 8) & 255, o & 255];
};

export const _arrHex = (a, t, o) =>
  "#" + [a, t, o].map(c => clamp(Math.round(c), 0, 255).toString(16).padStart(2, "0")).join("").toUpperCase();

export function darken(a, t) {
  const o = _hexArr(a);
  return _arrHex(o[0] * t, o[1] * t, o[2] * t);
}

export function campur(a, t, o) {
  const n = _hexArr(a), e = _hexArr(t);
  return _arrHex(n[0] + (e[0] - n[0]) * o, n[1] + (e[1] - n[1]) * o, n[2] + (e[2] - n[2]) * o);
}

export const sphLo = (r, x, y, z, c, sy) => {
  const item = { g: "sph", s: [2 * r, 2 * (sy || r), 2 * r], p: [x, y, z], c };
  P.push(item);
  return item;
};

export const cylLo = (r, h, x, y, z, c) => {
  const item = { g: "cyl", s: [2 * r, h, 2 * r], p: [x, y + h / 2, z], c };
  P.push(item);
  return item;
};

// --- Rangka (Coordinate Frame) & Taruh Helpers ---
export function rangka(a, t, o, n) {
  const e = n || 0,
    s = Math.cos(e),
    r = Math.sin(e),
    l = (n, e, l) => [a + n * s + l * r, t + e, o - n * r + l * s];
  return {
    r: e,
    x: a,
    y: t,
    z: o,
    at: l,
    sub: (a, t, o, n) => {
      const s = l(a, t, o);
      return rangka(s[0], s[1], s[2], e + (n || 0));
    }
  };
}

export function taruh(frame, type, w, h, d, x, y, z, color, opts) {
  const p = frame.at(x, y + h / 2, z);
  const u = {
    g: type,
    s: [w, h, d],
    p: p,
    c: color,
    ry: frame.r
  };
  if (opts) {
    if (opts.rx) u.rx = opts.rx;
    if (opts.ry) u.ry = frame.r + opts.ry;
  }
  if (opts && opts.glow) {
    G.push(u);
  } else {
    P.push(u);
  }
  return u;
}

export const _kaca = (frame, w, h, x, y, z, color, opts) =>
  taruh(frame, "box", w, h, 0.06, x, y, z, color || LAMPU, Object.assign({ glow: true }, opts));

export const _ext = (a, t, o) => {
  const n = o && o.l ? 0 : t,
    e = o && o.r ? 0 : t;
  return [a + n + e, (e - n) / 2];
};

export function _jeruji(frame, w, h, x, y, z, count, color, opts) {
  opts = opts || {};
  const n = count || Math.max(3, Math.round(w / 0.18));
  const c = color || PAL.besi;
  taruh(frame, "box", w, 0.04, 0.04, x, y + h - 0.02, z, c, opts);
  taruh(frame, "box", w, 0.04, 0.04, x, y + 0.02, z, c, opts);
  const step = w / n;
  for (let i = 0; i < n; i++) {
    const bx = x - w / 2 + step * (i + 0.5);
    taruh(frame, "box", 0.025, h - 0.04, 0.025, bx, y + 0.02, z, c, opts);
  }
}

export function _bingkai(frame, w, h, thick, x, y, z, color) {
  const c = color || KUSEN;
  const t = thick || 0.08;
  taruh(frame, "box", t, h, t, x - w / 2 + t / 2, y, z, c);
  taruh(frame, "box", t, h, t, x + w / 2 - t / 2, y, z, c);
  taruh(frame, "box", w, t, t, x, y + h - t, z, c);
  taruh(frame, "box", w, t, t, x, y, z, c);
}

// --- Komponen Arsitektur Otentik Nusantara ---
export function dinding(a, t, o, n, e, s, r, l) {
  const i = rangka(n, e, s, (l = l || {}).rot),
    c = l.adj || {},
    d = taruh(i, "box", a, t, o, 0, 0, 0, r);
  const h = l.plinth ?? 0.45;
  if (h > 0) {
    const [w, x] = _ext(a, 0.03, c);
    taruh(i, "box", w, h, o + 0.06, x, 0, 0, l.cPlinth || darken(r, 0.78));
  }
  if (l.lis) {
    for (const pos of l.lis) {
      const [w, x] = _ext(a, 0.06, c);
      taruh(i, "box", w, 0.12, o + 0.12, x, pos, 0, l.cLis || darken(r, 0.8));
    }
  }
  return d;
}

export function teras(a, t, o, n, e) {
  const s = rangka(o, 0, n, (e = e || {}).rot),
    r = e.tinggi ?? 0.3,
    l = e.tangga ?? 2,
    i = e.tanggaW || Math.min(a, 1.6),
    c = e.tanggaX || 0,
    d = e.c || "#C9BFA6",
    h = taruh(s, "box", a, r, t + 0.03, 0, 0, (t - 0.03) / 2, d);
  for (let k = 0; k < l; k++) {
    const stepH = r * (l - k) / (l + 1);
    taruh(s, "box", i, stepH, 0.32, c, 0, t + 0.14 + 0.3 * k, darken(d, 0.93));
  }
  if (e.kolom) {
    for (const kx of e.kolom) {
      const colH = (e.kolomH || LANTAI) - r;
      taruh(s, "box", 0.18, colH, 0.18, kx, r, t - 0.14, e.cKolom || "#E6E2D8");
    }
  }
  return h;
}

export function jendela(a, t, o, n) {
  n = n || {};
  const w = n.w || 1.1,
    h = n.h || 1.5,
    r = rangka(a, t, o, n.rot),
    l = n.kusen || KUSEN;
  taruh(r, "box", w + 0.22, h + 0.22, 0.07, 0, 0, 0, n.reveal || darken(n.wall || "#C9BBA2", 0.7));
  _kaca(r, w, h, 0, 0, 0.02, LAMPU);
  _bingkai(r, w + 0.12, h + 0.1, 0.09, 0, 0, 0.035, l);
  if (n.ambang !== false) {
    taruh(r, "box", w + 0.32, 0.12, 0.2, 0, -0.05, 0.06, n.cAmbang || darken(l, 0.85));
  }
  if (n.topi) {
    taruh(r, "box", w + 0.34, 0.14, 0.38, 0, h + 0.07, 0.12, n.cTopi || darken(n.wall || "#C9BBA2", 0.78));
  }
  if (n.teralis) {
    _jeruji(r, w - 0.02, h - 0.02, 0, 0.01, 0.05, n.teralisN || Math.max(3, Math.round(w / 0.17)), n.cTeralis || PAL.besi);
  }
}

export function jendelaKecil(a, t, o, n) {
  n = n || {};
  return jendela(a, t, o, {
    w: n.w || 0.6,
    h: n.h || 0.8,
    wall: n.wall,
    kusen: n.kusen,
    rot: n.rot,
    ambang: n.ambang ?? false,
    teralis: n.teralis ?? false
  });
}

export function pintu(a, t, o) {
  o = o || {};
  const w = o.w || PINTU_W,
    h = o.h || PINTU_H,
    s = rangka(a, o.y || 0, t, o.rot),
    r = o.kusen || KUSEN,
    l = o.c || PAL.pintu,
    u = o.boven ? 0.42 : 0;
  taruh(s, "box", w + 0.3, h + 0.15 + u, 0.06, 0, 0, 0, darken(o.wall || "#C9BBA2", 0.7));
  _bingkai(s, w + 0.14, h + 0.1, 0.08, 0, 0, 0.03, r);
  taruh(s, "box", w, h, 0.08, 0, 0, 0.02, l);
  taruh(s, "box", 0.12, 0.12, 0.05, 0.32 * w, 0.5 * h, 0.09, PAL.gagang || "#B8922E");
  if (o.boven) {
    taruh(s, "box", w, 0.32, 0.06, 0, h + 0.08, 0.02, "#4E4740");
  }
}

export function atapPelana(a, t, o, n, e, s) {
  s = s || {};
  const r = ((s.sudut ?? 36) * Math.PI) / 180;
  const tanR = Math.tan(r);
  const cosR = Math.cos(r);
  const ov = s.overhang ?? 0.55;
  const c = s.arah === "z";
  const gentengCol = s.c || GENTENG[0];
  const g = rangka(o, n, e, (s.rot || 0) + (c ? Math.PI / 2 : 0));
  const span = c ? t : a;
  const ridgeLen = c ? a : t;
  const f = s.ovL ?? ov;
  const m = s.ovR ?? ov;
  const frontOv = s.ovD ?? ov;
  const totalRidge = span + f + m;
  const ridgeOffset = (m - f) / 2;
  const halfDepth = ridgeLen / 2 + frontOv;
  
  const roofH = halfDepth * tanR;
  const slopeLen = halfDepth / cosR + 0.12 * tanR + 0.06;
  const slopeOffset = halfDepth / 2 - (0.12 * tanR + 0.06) * cosR / 2;
  
  for (const side of [1, -1]) {
    taruh(g, "box", totalRidge, 0.12, slopeLen, ridgeOffset, 0.02 + (ridgeLen / 2 - slopeOffset) * tanR + 0.12 / (2 * cosR), side * slopeOffset, gentengCol, { rx: side * r });
  }
  
  const peakY = 0.02 + ridgeLen / 2 * tanR + 0.12 / cosR;
  const eavesY = 0.02 - frontOv * tanR;
  
  taruh(g, "prism", span, ridgeLen / 2 * tanR, ridgeLen, 0, 0, 0, s.cWall || "#C9BBA2");
  
  if (s.bubungan !== false) {
    taruh(g, "box", totalRidge, 0.16, 0.26, ridgeOffset, peakY - 0.05, 0, darken(gentengCol, 0.8));
  }
  
  if (s.lisplang !== false) {
    for (const side of [1, -1]) {
      for (const eave of [1, -1]) {
        taruh(g, "box", 0.05, 0.22, slopeLen, ridgeOffset + side * (totalRidge / 2 + 0.02), 0.02 + (ridgeLen / 2 - slopeOffset) * tanR + 0.12 / (2 * cosR), eave * slopeOffset, s.cLisplang || "#E6E2D8", { rx: eave * r });
      }
    }
  }
  
  return { q: null, yPuncak: n + peakY, yTepi: n + eavesY };
}

export function atapLimasan(a, t, o, n, e, s) {
  s = s || {};
  const r = ((s.sudut ?? 30) * Math.PI) / 180;
  const ov = s.overhang ?? 0.6;
  const gentengCol = s.c || GENTENG[0];
  const w = a + 2 * ov;
  const d = t + 2 * ov;
  const roofH = Math.min(w, d) / 2 * Math.tan(r);
  const g = rangka(o, n, e, s.rot || 0);
  taruh(g, "pyr", w, roofH, d, 0, 0, 0, gentengCol);
  return { yPuncak: n + roofH, yTepi: n - 0.1 };
}

export function atapJoglo(a, t, o, n, e, s) {
  s = s || {};
  const gentengCol = s.c || GENTENG[0];
  const ov = s.overhang ?? 0.6;
  const g = rangka(o, n, e, s.rot || 0);
  const w1 = a + 2 * ov;
  const d1 = t + 2 * ov;
  const h1 = 1.1;
  taruh(g, "pyr", w1, h1, d1, 0, 0, 0, gentengCol);
  const w2 = a * 0.55;
  const d2 = t * 0.55;
  const h2 = 1.6;
  taruh(g, "pyr", w2, h2, d2, 0, h1, 0, darken(gentengCol, 0.92));
  return { yPuncak: n + h1 + h2, yTepi: n };
}

export function tandon(a, t, o, n) {
  n = n || {};
  const r = n.r || 0.45;
  const h = n.h || 1.1;
  const legsH = n.kaki ?? 0.8;
  const color = n.c === "biru" ? "#3E6FB0" : (n.c || "#3E6FB0");
  if (legsH > 0) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        box(0.06, legsH, 0.06, a + sx * r * 0.7, t, o + sz * r * 0.7, PAL.besi);
      }
    }
    box(2 * r + 0.1, 0.06, 2 * r + 0.1, a, t + legsH / 2, o, PAL.besi);
    box(2 * r + 0.12, 0.08, 2 * r + 0.12, a, t + legsH, o, PAL.besi);
  }
  const tank = cylLo(r, h, a, t + legsH + 0.08, o, color);
  cylLo(0.35 * r, 0.12, a, t + legsH + 0.08 + h, o, darken(color, 0.82));
  return tank;
}

export function antena(a, t, o, n) {
  n = n || {};
  const h = n.h || 2.6;
  const s = rangka(a, t, o, n.rot || 0);
  taruh(s, "box", 0.05, h, 0.05, 0, 0, 0, "#9C9A92");
  for (let i = 0; i < 3; i++) {
    const dipoleLen = 1.1 - 0.25 * i;
    const dy = h - 0.25 - 0.35 * i;
    taruh(s, "box", dipoleLen, 0.035, 0.035, 0, dy, 0, "#9C9A92", { ry: 0.3 });
  }
  return null;
}

export function pagarHalaman(a, t, o) {
  o = o || {};
  const frame = rangka(o.x0 || 0, 0, t, o.rot || 0);
  const gaya = o.gaya || "besi";
  const h = o.h || 0.9;
  const gateW = o.gerbang === false ? 0 : (o.gW || 1.3);
  const gateX = (o.gx || 0) - (o.x0 || 0);
  const halfA = a / 2;
  const segments = gateW > 0 
    ? [[-halfA, gateX - gateW / 2 - 0.15], [gateX + gateW / 2 + 0.15, halfA]]
    : [[-halfA, halfA]];
  const baseColor = o.c || "#C9BBA0";
  const pillarColor = o.cPilar || "#E3DED2";
  const ironColor = o.cBesi || PAL.besi;
  const pillars = [];
  
  for (const [start, end] of segments) {
    const len = end - start;
    const center = (start + end) / 2;
    if (len < 0.1) continue;
    const wallH = gaya === "besi" ? 0.42 : h;
    taruh(frame, "box", len, wallH, 0.18, center, 0, 0, baseColor);
    taruh(frame, "box", len, 0.06, 0.22, center, wallH, 0, darken(baseColor, 0.88));
    if (gaya === "besi") {
      const ironH = h - 0.42 + 0.25;
      _jeruji(frame, len, ironH, center, wallH + 0.06, 0, Math.max(3, Math.round(len / 0.22)), ironColor);
    }
    const pillarCount = Math.max(1, Math.round(len / (o.pilar || 2.4)));
    for (let k = 0; k <= pillarCount; k++) {
      pillars.push(start + len * k / pillarCount);
    }
  }
  
  const pillarH = (gaya === "besi" ? h + 0.25 : h) + 0.15;
  const uniquePillars = [...new Set(pillars.map(p => Math.round(p * 100) / 100))];
  for (const px of uniquePillars) {
    taruh(frame, "box", 0.26, pillarH, 0.26, px, 0, 0, pillarColor);
    taruh(frame, "box", 0.30, 0.08, 0.30, px, pillarH, 0, darken(pillarColor, 0.9));
  }
  
  if (gateW > 0 && o.gerbangBesi !== false) {
    const gateH = h + 0.15;
    _jeruji(frame, gateW, gateH, gateX, 0.05, 0, Math.max(4, Math.round(gateW / 0.18)), o.cGerbang || PAL.besi);
    for (const sign of [-1, 1]) {
      const postX = gateX + sign * (gateW / 2 + 0.15);
      taruh(frame, "box", 0.28, gateH + 0.2, 0.28, postX, 0, 0, pillarColor);
      taruh(frame, "box", 0.32, 0.08, 0.32, postX, gateH + 0.2, 0, darken(pillarColor, 0.9));
    }
  }
}

export function rumah2_balkon(a, t, o, n, e, s, r) {
  const l = rangka(a, t, o, 0);
  taruh(l, "box", n, 0.16, e + 0.04, 0, 0, (e - 0.04) / 2, r || "#BFB6A8");
  _jeruji(l, n - 0.04, 0.75, 0, 0.16, e - 0.04, Math.max(5, Math.round(n / 0.16)), s);
  for (const side of [-1, 1]) {
    _jeruji(l.sub(side * (n / 2 - 0.02), 0, (e - 0.04) / 2, side * Math.PI / 2), e - 0.06, 0.75, 0, 0.16, 0, Math.max(3, Math.round(e / 0.2)), s);
  }
  taruh(l, "box", n, 0.06, 0.08, 0, 0.16 + 0.75, e - 0.04, s);
}

export function rumah2_dormer(a, t, o, n, e, s, r, l, i, c) {
  const u = n(o);
  const d = u + r;
  const g = 0.95;
  const p = t - o - g / 2;
  dinding(s, d - (u - 0.6), g, a, u - 0.6, p, i, { plinth: 0 });
  jendelaKecil(a, u + 0.18, t - o, { w: Math.min(0.8, s - 0.5), h: Math.min(0.7, r - 0.35), wall: i, kusen: c });
  atapPelana(s, g, a, d, p, { arah: "z", sudut: 32, overhang: 0.12, c: l, cWall: i });
}

export function carport(a, t, o, n, e) {
  e = e || {};
  const s = rangka(a, 0, t, e.rot || 0);
  const r = e.h || 2.75;
  const angle = (e.miring ?? 4) * Math.PI / 180;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const colH = r - (sz > 0 ? n * Math.tan(angle) : 0);
      taruh(s, "box", 0.08, colH, 0.08, sx * (o / 2 - 0.1), 0, sz * (n / 2 - 0.1), PAL.besi);
    }
  }
  taruh(s, "box", o, 0.06, n / Math.cos(angle), 0, r - n / 2 * Math.tan(angle) + 0.03, 0, e.c || "#9FB3B8", { rx: angle });
}

export function rumah2_motor(a, t, o, n, e) {
  const s = rangka(a, t, o, n || 0);
  const bodyCol = campur(e || "#B4443A", "#F2EEE6", 0.28);
  for (const side of [-0.55, 0.55]) {
    taruh(s, "cyl", 0.52, 0.09, 0.52, 0, 0, side, "#1E1C1A", { rx: Math.PI / 2, ry: Math.PI / 2 });
  }
  taruh(s, "box", 0.3, 0.18, 0.6, 0, 0.25, 0.02, "#3A3D40");
  taruh(s, "box", 0.34, 0.34, 0.66, 0, 0.45, -0.32, bodyCol);
  taruh(s, "box", 0.3, 0.1, 0.55, 0, 0.62, -0.15, "#2B2B2B");
  taruh(s, "box", 0.65, 0.05, 0.05, 0, 0.72, 0.3, "#9C9A92");
}

export function meteranListrik(a, t, o, n) {
  const frame = rangka(a, t, o, (n = n || {}).rot || 0);
  taruh(frame, "box", 0.28, 0.38, 0.14, 0, 0, 0.04, "#BFC3C6");
  taruh(frame, "box", 0.18, 0.14, 0.02, 0, 0.18, 0.12, "#3A3D40");
}

export function lampuDinding(a, t, o, n) {
  const frame = rangka(a, t, o, (n = n || {}).rot || 0);
  taruh(frame, "box", 0.06, 0.06, 0.25, 0, 0, 0.12, PAL.besi);
  taruh(frame, "box", 0.2, 0.26, 0.2, 0, -0.05, 0.25, "#3A3D40");
  _kaca(frame, 0.14, 0.14, 0, -0.2, 0.25, LAMPU);
}

export function bangku(a, t, o) {
  o = o || {};
  const w = o.w || 1.3;
  const frame = rangka(a, o.y || 0, t, o.rot || 0);
  const color = o.c || PAL.kayu[0];
  taruh(frame, "box", w, 0.08, 0.42, 0, 0.42, 0, color);
  for (const side of [-1, 1]) {
    taruh(frame, "box", 0.08, 0.42, 0.36, side * (w / 2 - 0.12), 0, 0, darken(color, 0.8));
  }
  if (o.sandaran !== false) {
    taruh(frame, "box", w, 0.28, 0.06, 0, 0.65, -0.2, color);
  }
}

export function pot(a, t, o, n) {
  o = o || 1;
  n = n || {};
  const y = n.y || 0;
  const potCol = n.c || "#9C4935";
  if (n.kotak) {
    box(0.42 * o, 0.38 * o, 0.42 * o, a, y, t, potCol);
  } else {
    cylLo(0.22 * o, 0.38 * o, a, y, t, potCol);
  }
  const leafCol = n.bunga ? campur(n.daun || "#5F7A3F", n.bunga, 0.55) : (n.daun || "#5F7A3F");
  sphLo(0.3 * o, a, y + 0.38 * o + 0.22 * o, t, leafCol, 0.26 * o);
}

export function pohonKecil(a, t, o, n) {
  o = o || 1;
  n = n || {};
  cylLo(0.12 * o, 1.4 * o, a, 0, t, PAL.pohon.batang);
  sphLo(0.75 * o, a, 1.4 * o + 0.65 * o, t, PAL.pohon.atas);
}

export function jemuran(a, t, o) {
  o = o || {};
  const w = o.w || 2.0;
  const h = o.h || 1.65;
  const count = o.n || 4;
  const frame = rangka(a, o.y || 0, t, o.rot || 0);
  const clothesCols = ["#B5473A", "#E6E2D8", "#4C6A96", "#C2913A", "#6F5E8C", "#5F8F4E"];
  for (const side of [-1, 1]) {
    taruh(frame, "box", 0.06, h, 0.06, side * w / 2, 0, 0, "#8C8A84");
  }
  taruh(frame, "box", w, 0.03, 0.03, 0, h - 0.04, 0, "#8C8A84");
  const step = w / (count + 1);
  for (let i = 0; i < count; i++) {
    const cx = -w / 2 + step * (i + 1);
    const clothCol = clothesCols[(i + (o.warna || 0)) % clothesCols.length];
    taruh(frame, "box", step * 0.75, 0.55, 0.04, cx, h - 0.65, 0, clothCol);
  }
}

export function talang(a, t, o, n) {
  n = n || {};
  const h = o || 3.0;
  box(0.08, h, 0.08, a, t, n.z || 0, PAL.seng || "#8E979C");
}

export function ac(a, t, o, n) {
  n = n || {};
  const frame = rangka(a, t, o, n.rot || 0);
  taruh(frame, "box", 0.85, 0.55, 0.32, 0, 0, 0.16, "#EDE8DC");
  taruh(frame, "cyl", 0.22, 0.03, 0.22, 0.15, 0.05, 0.33, "#3A3D40", { rx: Math.PI / 2 });
}

export function teks(str, a, t, o, n) {
  n = n || {};
  const frame = rangka(a, t, o, n.rot || 0);
  taruh(frame, "box", 0.42, 0.25, 0.03, 0, 0, n.dz || 0.02, "#2B2F33");
  taruh(frame, "box", 0.36, 0.20, 0.04, 0, 0, (n.dz || 0.02) + 0.01, "#E6E2D8");
}

// Three.js Shared Geometries & Material Cache
let GEOMETRIES = null;

function getGeometries() {
  if (GEOMETRIES) return GEOMETRIES;
  GEOMETRIES = {
    box: new THREE.BoxGeometry(1, 1, 1).toNonIndexed(),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8).toNonIndexed(),
    cone: new THREE.ConeGeometry(0.5, 1, 8).toNonIndexed(),
    sph: new THREE.SphereGeometry(0.5, 8, 6).toNonIndexed(),
    pyr: (() => {
      const geo = new THREE.ConeGeometry(0.5, 1, 4, 1);
      if (typeof geo.rotateY === 'function') {
        geo.rotateY(Math.PI / 4);
        geo.scale(Math.SQRT2, 1, Math.SQRT2);
      }
      return geo.toNonIndexed();
    })(),
    prism: (() => {
      const geo = new THREE.BufferGeometry();
      const o = [-0.5, -0.5, -0.5];
      const n = [-0.5, -0.5, 0.5];
      const e = [-0.5, 0.5, 0];
      const s = [0.5, -0.5, -0.5];
      const r = [0.5, -0.5, 0.5];
      const l = [0.5, 0.5, 0];
      const i = [o, n, e, s, l, r, o, s, r, o, r, n, n, r, l, n, l, e, o, e, l, o, l, s];
      if (typeof THREE.Float32BufferAttribute === 'function') {
        geo.setAttribute('position', new THREE.Float32BufferAttribute(i.flat(), 3));
      }
      if (typeof geo.computeVertexNormals === 'function') {
        geo.computeVertexNormals();
      }
      return geo;
    })()
  };
  return GEOMETRIES;
}

const materialCache = new Map();
function getLambertMat(colorStr) {
  const key = `${colorStr}`;
  if (!materialCache.has(key)) {
    materialCache.set(key, new THREE.MeshLambertMaterial({
      color: new THREE.Color(colorStr),
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      depthTest: true
    }));
  }
  return materialCache.get(key);
}

export const dynamicGlowMaterials = [];
const glowCache = new Map();

function getGlowMat(colorStr) {
  // updateCatalogLighting memberi SEMUA material glow warna yang sama, jadi satu material
  // bersama cukup: jendela seluruh kota dilebur jadi 1 draw call per chunk.
  colorStr = 'shared';
  if (!glowCache.has(colorStr)) {
    // Material jendela & lentera otentik: Solid, mati di siang hari, bercahaya hangat di malam hari
    const mat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(0x3B4252), // Tint kaca gelap di siang hari
      emissive: new THREE.Color(0x000000), // Emissive 0 saat siang (mati)
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      depthTest: true
    });
    glowCache.set(colorStr, mat);
    protectMaterial(mat);
    dynamicGlowMaterials.push({ mat, originalGlowColor: new THREE.Color(colorStr || '#F2CF8A') });
  }
  return glowCache.get(colorStr);
}

/**
 * Mengubah pencahayaan jendela/lampu gedung secara dinamis (Siang vs Malam)
 * Menjawab instruksi: Lampu menyala jika malam dan mati saat siang.
 */
export function updateCatalogLighting(isNight) {
  for (let i = 0; i < dynamicGlowMaterials.length; i++) {
    const item = dynamicGlowMaterials[i];
    if (isNight) {
      // Malam: Lampu kuning keemasan menyala hangat
      item.mat.color.setHex(0xFFE082);
      item.mat.emissive.setHex(0xFFA000);
      item.mat.emissiveIntensity = 1.2;
    } else {
      // Siang: Lampu padam, kaca memantulkan warna natural gelap
      item.mat.color.setHex(0x475569);
      item.mat.emissive.setHex(0x000000);
      item.mat.emissiveIntensity = 0.0;
    }
  }
}

const _dummy = new THREE.Object3D();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _normalMatrix = new THREE.Matrix3();

function mergePrimitivesToGeometry(items, scale = 1.0, geos) {
  if (!items || items.length === 0) return null;
  let totalVerts = 0;
  for (let k = 0; k < items.length; k++) {
    const base = geos[items[k].g] || geos.box;
    totalVerts += base.attributes.position.array.length;
  }
  const mergedPos = new Float32Array(totalVerts);
  const mergedNorm = new Float32Array(totalVerts);
  let offset = 0;
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    const base = geos[it.g] || geos.box;
    const pos = base.attributes.position.array;
    const norm = base.attributes.normal.array;

    _dummy.position.set(it.p[0] * scale, it.p[1] * scale, it.p[2] * scale);
    _dummy.scale.set(it.s[0] * scale, it.s[1] * scale, it.s[2] * scale);
    _dummy.rotation.set(it.rx || 0, it.ry || 0, 0);
    _dummy.updateMatrix();

    const m = _dummy.matrix;
    _normalMatrix.getNormalMatrix(m);

    for (let i = 0; i < pos.length; i += 3) {
      _v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(m);
      mergedPos[offset + i] = _v.x;
      mergedPos[offset + i + 1] = _v.y;
      mergedPos[offset + i + 2] = _v.z;

      _n.set(norm[i], norm[i + 1], norm[i + 2]).applyMatrix3(_normalMatrix).normalize();
      mergedNorm[offset + i] = _n.x;
      mergedNorm[offset + i + 1] = _n.y;
      mergedNorm[offset + i + 2] = _n.z;
    }
    offset += pos.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(mergedNorm, 3));
  return geo;
}

/**
 * Builds an optimized 3D Three.js Group from primitive arrays P and G
 * Merges primitives by color to achieve ultra-low draw calls and 60 FPS.
 */
export function buildGroupFromPrimitives(scale = 1.0) {
  const group = new THREE.Group();
  const geos = getGeometries();

  // Solid primitives grouped by color
  const solidByColor = new Map();
  for (let i = 0; i < P.length; i++) {
    const item = P[i];
    const c = item.c || "#FFFFFF";
    let list = solidByColor.get(c);
    if (!list) {
      list = [];
      solidByColor.set(c, list);
    }
    list.push(item);
  }

  for (const [color, items] of solidByColor.entries()) {
    const geo = mergePrimitivesToGeometry(items, scale, geos);
    if (geo) {
      const mat = getLambertMat(color);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  // Glowing primitives grouped by color
  const glowByColor = new Map();
  for (let i = 0; i < G.length; i++) {
    const item = G[i];
    const c = item.c || LAMPU;
    let list = glowByColor.get(c);
    if (!list) {
      list = [];
      glowByColor.set(c, list);
    }
    list.push(item);
  }

  for (const [color, items] of glowByColor.entries()) {
    const geo = mergePrimitivesToGeometry(items, scale, geos);
    if (geo) {
      const mat = getGlowMat(color);
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
    }
  }

  return group;
}

export const NETIZENIA_BUILDINGS = {
  rumah: {
    n: "Rumah Kecil",
    kind: "pribadi",
    grp: "rumah",
    zones: ["KOTA", "KAMPUNG", "DESA"],
    w: 1,
    h: 1,
    cost: 150,
    res: 4,
    hrs: 2,
    d: "Rumah pertama gratis bergaya Nusantara otentik.",
    m: (a, t, o, n, e, s, r, l, i) => {
      const c = 3 & ((i = i || {}).seed || 0);
      const u = i.adj || {};
      const d = !!u.l;
      const h = !!u.r;
      const g = d || h;
      const p = a + 0.8;
      const b = t + 0.8;
      const f = LANTAI;
      const m = "KOTA" === r;
      const A = "DESA" === r;
      const k = !m && !A;
      const E = g ? 0.55 : 0.7;
      const x = d ? -p / 2 : 0.45 * -a;
      const w = h ? p / 2 : 0.45 * a;
      const M = w - x;
      const C = (x + w) / 2;
      const _ = b / 2 - (m ? 1.9 : 1.3);
      const y = -b / 2 + E + 0.1;
      const P_depth = _ - y;
      const B = (y + _) / 2;
      const D = 0 === c || 2 === c;
      const v = _ - 1.5;
      const L = D ? x : w - 2.7;
      const S = D ? x + 2.7 : w;
      const T_mid = (L + S) / 2;
      const I = D ? 1 : -1;
      const F = D ? S : x;
      const j = D ? w : L;
      const O = (F + j) / 2;
      const R = j - F;
      const N = c % 2 ? KUSEN : "#7A5A3A";
      const K = 2 === c ? "#7E7468" : darken(n, 0.78);
      const H = [PAL.pintu, o, "#7A5A3A", "#4E3C2E"][c];
      
      // Rumput halaman dasar kavling
      box(a + 0.75, 0.08, t + 0.75, 0, 0, 0, c % 2 ? RUMPUT[0] : RUMPUT[1]);
      
      // Dinding utama & plinth pondasi beton
      dinding(M, f, v - y, C, 0, (y + v) / 2, n, { plinth: 0.45, cPlinth: K, adj: u });
      dinding(R, f, 1.52, O, 0, v + 0.75 - 0.01, n, { plinth: 0.45, cPlinth: K, adj: { l: D ? 0 : d, r: D ? h : 0 } });
      
      // Teras depan & pilar serambi
      const z = D ? [0.2 - 1.35, 1.25] : [-1.25, 1.35 - 0.2];
      const leftBound = d ? -p / 2 : -p / 2 + 0.05;
      const rightBound = h ? p / 2 : p / 2 - 0.05;
      const walkwayX = clamp(T_mid - 0.45 * I, leftBound + 1, rightBound - 1);
      
      teras(2.74, 1.5, T_mid + 0.02 * I, v, {
        tinggi: 0.3,
        tangga: 2,
        tanggaW: 1.3,
        tanggaX: walkwayX - T_mid - 0.02 * I,
        c: c % 2 ? "#C9BFA6" : "#B98C6E",
        kolom: z,
        kolomH: g || 2 === c ? f + 0.22 : f + 0.02,
        cKolom: "#E6E2D8"
      });
      
      // Pintu kayu jati depan & bovenlicht roster
      pintu(D ? S - 0.95 : L + 0.95, v, {
        y: 0.3,
        wall: n,
        c: H,
        slot: 1 === c ? 1 : 0,
        kusen: N,
        boven: !(c % 2) || "roster"
      });
      
      // Jendela kecil nako dekat pintu
      if (c % 2 === 0) {
        jendelaKecil(D ? L + 0.62 : S - 0.62, 1.25, v, { w: 0.55, h: 0.9, wall: n, kusen: N, nako: true });
      }
      
      // Lampu dinding teras depan
      lampuDinding(D ? S - 1.75 : L + 1.75, 2.45, v, {});
      
      // Meteran listrik PLN & nomor rumah
      const W_rot = D ? -Math.PI / 2 : Math.PI / 2;
      meteranListrik(S * (D ? 1 : 0) + L * (D ? 0 : 1), 1.45, v + 0.55, { rot: W_rot });
      teks(String(3 + 7 * c + (m ? 10 : 0)), D ? S : L, 2.25, v + 0.75, { rot: W_rot, tinggi: 0.18, c: darken(n, 0.45), dz: 0.012 });
      
      // Bangku kayu serambi
      bangku(T_mid - 0.35 * I, v + 0.45, { w: 1.1, y: 0.3, c: "#8C6A48", sandaran: false });
      
      // Jendela depan lengkap dengan TERALIS besi & cahaya hangat
      if (c % 2 === 0) {
        for (const side of [-1, 1]) {
          jendela(O + 0.92 * side, 1, _, { w: 0.95, h: 1.45, wall: n, kusen: N, topi: 0 === c, teralis: true });
        }
      } else if (1 === c) {
        jendela(O, 1, _, { w: 1.6, h: 1.45, wall: n, kusen: N, daun: o, daunSlot: 1, palangH: true, topi: true, teralis: true });
      } else {
        for (const side of [-1, 1]) {
          jendela(O + 0.9 * side, 1.05, _, { w: 0.74, h: 1.4, wall: n, kusen: N, daun: o, daunSlot: 1, teralis: true });
        }
      }
      
      // Jendela samping & AC outdoor
      if (!d) jendela(x, 1, (y + v) / 2 - 0.3, { rot: -Math.PI / 2, w: 1, h: 1.4, wall: n, kusen: N });
      if (!h) {
        jendelaKecil(w, 1.5, y + 1.1, { rot: Math.PI / 2, w: 0.6, h: 0.6, wall: n, kusen: N });
        if (1 === c) ac(w, 2.2, v - 0.9, { rot: Math.PI / 2 });
      }
      jendelaKecil(C + 0.22 * M, 1.5, y, { rot: Math.PI, w: 0.6, h: 0.6, wall: n, kusen: N });
      
      // Atap Pelana Genteng Nusantara (lisplang putih, wuwungan, genteng)
      let roofRes;
      if (g) {
        roofRes = atapPelana(M, P_depth, C, f, B, { arah: "x", gaya: "dinding", sudut: 33, ovD: E, ovL: d ? 0 : 0.45, ovR: h ? 0 : 0.45, c: l, cWall: n, lisplang: true });
      } else if (2 === c) {
        roofRes = atapPelana(M, P_depth, C, f, B, { arah: "z", gaya: "dinding", sudut: 35, overhang: 0.5, c: l, cWall: n, lisplang: true });
      } else if (3 === c) {
        roofRes = atapJoglo(M, P_depth, C, f, B, { overhang: E, c: l, cWall: n });
      } else {
        roofRes = atapPelana(M, P_depth, C, f, B, { arah: "x", gaya: "dinding", sudut: 32, overhang: E, c: l, cWall: n, lisplang: true });
      }
      
      // Talang air
      const gutterY = g || 2 === c ? f - 0.45 : f - 0.05;
      talang(D ? w - 0.12 : x + 0.12, 0, gutterY, { z: _ });
      talang(D ? x + 0.14 : w - 0.14, 0, gutterY, { z: v });
      
      // Antena TV UHF di puncak wuwungan atap!
      if (0 === c || 3 === c || (k && 1 === c) || 2 === c) {
        antena(C + (D ? 0.3 : -0.3), roofRes.yPuncak - 0.08, B, { h: 2.4 });
      }
      
      // Toren Air Penguin Biru pada dudukan atap
      if (1 === c || 3 === c) {
        tandon(C - 1.2 * I, roofRes.yPuncak - 0.6, y + 0.8, { c: "biru", kaki: 0.7 });
      }
      
      // Pagar halaman depan (besi hitam + pondasi tembok + gerbang)
      const fenceZ = b / 2 - 0.17;
      pagarHalaman(rightBound - leftBound, fenceZ, {
        x0: (leftBound + rightBound) / 2,
        gaya: "besi",
        h: m ? 0.9 : 0.8,
        gx: walkwayX,
        gW: 1.3,
        adj: u,
        c: campur(n, "#C9BBA0", 0.6),
        cGerbang: PAL.besi,
        gerbangBesi: true
      });
      
      // Jalur setapak paving dari gerbang ke serambi
      const walkStart = _ + 0.6;
      const walkEnd = fenceZ - 0.1;
      if (walkEnd - walkStart > 0.1) {
        box(1.3, 0.08, walkEnd - walkStart, walkwayX, 0, (walkStart + walkEnd) / 2, "#C9BFA6");
      }
      
      // Pot bunga teras
      pot(walkwayX + 0.95 * I, _ + 0.32, 0.9, { bunga: c % 2 ? "#C9503C" : null, kotak: 2 === c });
      
      // Pohon taman atau jemuran pakaian
      if (m || c % 2 === 0) {
        pohonKecil(D ? Math.min(w - 0.55, p / 2 - 0.75) : Math.max(x + 0.55, -p / 2 + 0.75), _ + 1.05, 0.82, { jenis: "bulat" });
      } else {
        jemuran(O, _ + 0.75, { w: Math.min(2.2, R - 0.5), h: 1.65, n: 4, warna: c });
      }
    }
  },
  rumah2: {
    n: "Rumah Tingkat",
    kind: "pribadi",
    grp: "rumah",
    zones: ["KOTA", "KAMPUNG", "DESA"],
    w: 1,
    h: 1,
    cost: 320,
    res: 8,
    hrs: 4,
    d: "Rumah dua lantai dengan balkon teras, toren air, dan carport.",
    m: (a, t, o, n, e, s, r, l, i) => {
      const c = 3 & ((i = i || {}).seed || 0);
      const u = i.adj || {};
      const d = !!u.l;
      const h = !!u.r;
      const g = d || h;
      const p = a + 0.8;
      const b = t + 0.8;
      const f = LANTAI;
      const m = 2 * LANTAI;
      const A = "KOTA" === r;
      const k = "DESA" === r;
      const E = Math.max(0, WALLS.indexOf(n));
      const x = 0 === c ? "r" : (2 === c ? "l" : null);
      
      let w = d ? -p / 2 : -p / 2 + 0.55;
      let M = h ? p / 2 : p / 2 - 0.55;
      const C_left = d ? -p / 2 : -p / 2 + 0.05;
      const right_bound = h ? p / 2 : p / 2 - 0.05;
      if ("r" === x) M = right_bound - 2.75;
      else if ("l" === x) w = C_left + 2.75;
      
      const y = M - w;
      const B = (w + M) / 2;
      const D = b / 2 - (A ? 2 : 1.4);
      const v = -b / 2 + 0.65;
      const L = D - v;
      const S = (v + D) / 2;
      const T_frame = [KUSEN, KUSEN, "#7A5A3A", "#5E4630"][c];
      const I_plinth = 2 === c ? "#7E7468" : darken(n, 0.78);
      const F_door = [PAL.pintu, "#7A5A3A", o, "#4E3C2E"][c];
      
      // Rumput halaman dasar
      box(a + 0.75, 0.08, t + 0.75, 0, 0, 0, c % 2 ? RUMPUT[0] : RUMPUT[1]);
      
      // Dinding 2 lantai dengan lis lantai intermediate
      dinding(y, m, L, B, 0, S, n, { plinth: 0.45, cPlinth: I_plinth, lis: [f - 0.06], adj: { l: d && !("l" === x), r: h && !("r" === x) } });
      
      const j = "r" === x || 3 === c;
      const O = Math.min(2.7, 0.5 * y);
      const R = A ? 1.25 : 0.75;
      const N = 0.3;
      const K = j ? M - O : w;
      const H = j ? M : w + O;
      const z = (K + H) / 2;
      const signSide = j ? -1 : 1;
      
      // Teras serambi lantai 1
      teras(O, R, z, D, { tinggi: N, tangga: 1, tanggaW: 1.2, tanggaX: 0.3 * -signSide, c: ["#C9BFA6", "#B98C6E", "#CFC3AE", "#BFB6A8"][c] });
      for (const colX of [K + 0.14, H - 0.14]) {
        box(0.22, f - N, 0.22, colX, N, D + R - 0.14, "#E6E2D8");
      }
      
      // Balkon lantai 2 dengan railing besi hitam
      rumah2_balkon(z, f, D, O, R, PAL.besi, "#CFC9BC");
      box(O - 0.04, 0.06, 0.06, z, f - 0.05, D + R - 0.03, "#9C968C");
      
      // Pintu depan lantai 1
      const doorX = z + signSide * (O / 2 - 0.75);
      pintu(doorX, D, { y: N, wall: n, c: F_door, slot: 2 === c ? 1 : 0, kusen: T_frame, boven: !(c % 2) || "roster" });
      
      // Jendela depan lantai 1 dengan TERALIS
      const U = j ? w : H;
      const W_side = j ? K : M;
      const V = (U + W_side) / 2;
      const Y_width = W_side - U;
      const windowCount = Y_width > 3.4 ? 2 : 1;
      const winW = 2 === windowCount ? Math.min(3 === c ? 0.88 : 1.1, Y_width / 2 - 0.55) : Math.min(3 === c ? 0.9 : 1.3, Y_width - 0.8);
      const getWinX = (idx) => V + (2 === windowCount ? (idx ? 1 : -1) * Y_width * 0.24 : 0);
      
      for (let idx = 0; idx < windowCount; idx++) {
        jendela(getWinX(idx), 1, D, { w: winW, h: 1.45, wall: n, kusen: T_frame, topi: 0 === c || 2 === c, daun: 3 === c && o, daunSlot: 1, teralis: true });
      }
      
      // Pintu kaca geser lantai 2 menuju balkon
      pintu(z - 0.1 * signSide, D, { y: f + 0.17, w: 1.4, h: 2.15, daun: 2, c: "#3A3F44", kaca: true, kusen: T_frame, wall: n });
      
      // Jendela lantai 2 dengan teralis
      for (let idx = 0; idx < windowCount; idx++) {
        jendela(getWinX(idx), f + 0.95, D, { w: winW, h: 1.4, wall: n, kusen: T_frame, daun: 3 === c && o, daunSlot: 1, palangH: 1 === c, teralis: true });
      }
      
      // Kompresor AC outdoor & lampu teras
      ac(getWinX(0), f + 0.14, D, {});
      lampuDinding(z - signSide * (O / 2 - 0.45), 2.35, D, {});
      meteranListrik(z - signSide * (O / 2 - 0.4), 1.35, D, {});
      
      // Jendela samping
      if (!(d && "l" !== x)) {
        jendela(w, f + 0.95, v + 0.4 * L, { rot: -Math.PI / 2, w: 0.9, h: 1.3, wall: n, kusen: T_frame });
      }
      
      // Atap Pelana Genteng & Lisplang
      const ovL = d && "l" !== x ? 0 : 0.45;
      const ovR = h && "r" !== x ? 0 : 0.45;
      let roofRes, roofFormula, roofSlope;
      
      if (g || 0 === c || 1 === c) {
        const roofAng = 38;
        roofSlope = Math.tan(roofAng * Math.PI / 180);
        const roofT = 0.12;
        const roofCos = Math.cos(roofAng * Math.PI / 180);
        roofRes = atapPelana(y, L, B, m, S, { arah: "x", gaya: "dinding", sudut: roofAng, ovD: 0.55, ovL, ovR, c: l, cWall: n, lisplang: true });
        roofFormula = (offset) => m + 0.02 + roofT / roofCos + offset * roofSlope;
      } else if (2 === c) {
        roofRes = atapPelana(y, L, B, m, S, { arah: "z", gaya: "dinding", sudut: 38, overhang: 0.45, ovL: 0.5, ovR: 0.45, c: l, cWall: n, lisplang: true });
      } else {
        const roofAng = 35;
        const roofOver = 0.5;
        roofSlope = Math.tan(roofAng * Math.PI / 180);
        roofRes = atapLimasan(y, L, B, m, S, { sudut: roofAng, overhang: roofOver, c: l, cWall: n });
        roofFormula = (offset) => m + (roofOver + offset) * roofSlope;
      }
      
      // Dormer atap atas
      if (1 === c || 3 === c) {
        rumah2_dormer(B + (j ? -1 : 1) * y * 0.18, D, 0.55, roofFormula || ((val) => m + val), roofSlope || 0.7, 1.5, 0.95, l, n, T_frame);
      }
      
      // Antena TV UHF di atap
      antena(B + (j ? -0.3 : 0.3), roofRes.yPuncak - 0.08, S, { h: 2.8 });
      
      // TOREN AIR PENGUIN BIRU (Tandon Air)
      if (x) {
        const tankX = "r" === x ? (M + right_bound) / 2 : (C_left + w) / 2;
        const tankZ = v + 0.55;
        const tankBaseY = m + 0.3;
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            box(0.07, tankBaseY, 0.07, tankX + 0.38 * sx, 0, tankZ + 0.38 * sz, "#5E666C");
          }
        }
        box(0.9, 0.08, 0.9, tankX, tankBaseY, tankZ, "#5E666C");
        tandon(tankX, tankBaseY + 0.08, tankZ, { c: "biru", kaki: 0 });
      } else {
        tandon(B - (j ? -1 : 1) * y * 0.22, roofRes.yPuncak - 1.05, v + 0.55, { c: "biru", kaki: 0.65 });
      }
      
      // Carport & Garasi Motor
      if (x) {
        const cpX1 = "r" === x ? M + 0.02 : C_left;
        const cpX2 = "r" === x ? right_bound : w - 0.02;
        const cpCenter = (cpX1 + cpX2) / 2;
        const cpWidth = cpX2 - cpX1;
        const cpZ1 = v + 1.2;
        const cpZ2 = b / 2 - 0.35;
        const cpDepth = cpZ2 - cpZ1;
        const cpCenterZ = (cpZ1 + cpZ2) / 2;
        
        carport(cpCenter, cpCenterZ, cpWidth, cpDepth, { h: 2.75, miring: 4, c: 0 === c ? "#9FB3B8" : "#8E979C" });
        box(cpWidth, 0.09, cpDepth + 0.4, cpCenter, 0, cpCenterZ - 0.2, "#BFB6A8");
        rumah2_motor(cpCenter, 0.09, cpCenterZ + 0.3, 0.15, ["#B4443A", "#3E5A82", "#2E3A40", "#C9D3DC"][E % 4]);
      }
      
      // Pagar halaman depan dengan gerbang besi
      const fenceZ = b / 2 - 0.17;
      const gateX = x ? ("r" === x ? (M + right_bound) / 2 : (C_left + w) / 2) : clamp(doorX, C_left + 1, right_bound - 1);
      const gateW = x ? 2.4 : 1.3;
      pagarHalaman(right_bound - C_left, fenceZ, {
        x0: (C_left + right_bound) / 2,
        gaya: "besi",
        h: A ? 1.0 : 0.85,
        gx: gateX,
        gW: gateW,
        adj: u,
        c: campur(n, "#C9BBA0", 0.55),
        cGerbang: PAL.besi,
        gerbangBesi: true
      });
      
      // Jalur setapak dari gerbang ke serambi
      if (!x) {
        const walkStart = D + R + 0.35;
        const walkEnd = fenceZ - 0.1;
        if (walkEnd - walkStart > 0.1) {
          box(1.2, 0.09, walkEnd - walkStart, clamp(doorX, C_left + 0.7, right_bound - 0.7), 0, (walkStart + walkEnd) / 2, "#C9BFA6");
        }
      }
      
      // Pot bunga teras
      pot(j ? K - 0.45 : H + 0.45, D + 0.45, 0.9, { bunga: c % 2 ? "#C9503C" : null, kotak: 2 === c });
      
      // Pohon taman depan
      pohonKecil(j ? Math.max(w + 0.7, -p / 2 + 0.8) : Math.min(M - 0.7, p / 2 - 0.8), D + 1.1, 0.8, { jenis: "bulat" });
      
      // Pelat nomor rumah
      teks(String(21 + 2 * E + c), j ? K - 0.02 : H + 0.02, 2.2, D, { tinggi: 0.16, c: darken(n, 0.45), dz: 0.012 });
    }
  },
  kos:{n:"Kos-kosan",kind:"pribadi",grp:"rumah",zones:["RUKO","RUKO_KECIL","KOTA","KAMPUNG"],w:2,h:1,cost:700,res:14,jobs:1,hrs:6,m:(a,t,o,n,e,s,r,l,i)=>{const c=tapak(a,t,i),u=clamp(s||2,2,3),d=u*LANTAI;box(.97*a,.08,.96*t,0,0,0,"#CFC6B8"),box(c.bw,d,c.bd,c.cx,0,c.zc,n);const[h,g]=ovX(c,.15);box(h,.35,c.bd+.3,g,d,c.zc,l);for(let a=0;a<u;a++)winRow(6,.86*c.bw,.9+a*LANTAI,c.zf+.03,1.2,.9,c.cx);box(c.bw,.15,.9,c.cx,LANTAI-.15,c.zf+.45,o),box(c.bw,.07,.07,c.cx,LANTAI+.85,c.zf+.86,"#E6E2D8"),door(c.cx,c.zf+.02,"#5A4636"),cyl(.7,1.2,c.cx+.3*c.bw,d+.35,c.zc-.4,"#4C6A96"),box(2.6,.7,.12,c.cx-.28*c.bw,d-1,c.zf+.06,"#E6E2D8"),gbox(2.3,.45,.14,c.cx-.28*c.bw,d-.88,c.zf+.08,"#F2CF8A")}},
  warung:{n:"Warung",kind:"pribadi",grp:"usaha",zones:["RUKO","RUKO_KECIL","KOTA","KAMPUNG","DESA"],w:1,h:1,cost:200,jobs:2,hrs:3,m:(a,t,o,n,e,s,r,l,i)=>{const c=tapak(a,t,i,.75),u=LANTAI;box(.96*a,.08,.96*t,0,0,0,"#CFC6B4"),box(c.bw,u,c.bd,c.cx,0,c.zc,n);const[d,h]=ovX(c,.4);roof(d,1,c.bd+1.4,h,u,c.zc+.4,"#8E3E34");for(let a=0;a<5;a++)box(c.bw/5,.16,1.7,c.cx-c.bw/2+c.bw*(a+.5)/5,2.5,c.zf+.85,a%2?"#E6E2D8":o);box(.86*c.bw,.95,.7,c.cx,0,c.zf+.4,"#8C6A48"),gbox(.7*c.bw,.5,.1,c.cx,1.4,c.zf-.1,"#F2CF8A");for(const a of[-1.1,0,1.1])cyl(.22,.5,c.cx+a,0,c.zf+1.15,"#A9463A");box(1,.9,.7,c.cx+.36*c.bw,0,c.zf+1.6,"#4C6A96")}},
  kafe:{n:"Kafe Kopi",kind:"pribadi",grp:"usaha",zones:["CBD","RUKO","RUKO_KECIL","KOTA"],w:1,h:1,cost:300,jobs:3,hrs:4,m:(a,t,o,n,e,s,r,l,i)=>{const c=tapak(a,t,i,.85);box(.96*a,.08,.96*t,0,0,0,"#CFC6B8"),box(c.bw,4.2,c.bd,c.cx,0,c.zc,n);const[u,d]=ovX(c,.2);box(u,.4,c.bd+.3,d,4.2,c.zc,"#3F6B62"),box(c.bw,.12,1.2,c.cx,3,c.zf+.6,"#3F6B62"),gbox(.55*c.bw,2.5,.1,c.cx-.15*c.bw,.5,c.zf+.03,"#F2CF8A"),door(c.cx+.32*c.bw,c.zf+.02,"#4E3C2E"),box(.6*c.bw,.6,.12,c.cx,3.3,c.zf+.07,"#4E3C2E"),gbox(.5*c.bw,.4,.12,c.cx,3.4,c.zf+.1,"#F2CF8A");for(const a of[-1.6,1.6])cyl(.4,.75,c.cx+a,0,c.zf+.75,"#6B5546"),cyl(.05,1.5,c.cx+a,.75,c.zf+.75,"#2B2B2B"),cone(.75,.45,c.cx+a,2.2,c.zf+.75,o)}},
  toko:{n:"Toko Kelontong",kind:"pribadi",grp:"usaha",zones:["CBD","RUKO","RUKO_KECIL","KOTA","KAMPUNG"],w:2,h:1,cost:450,jobs:4,hrs:6,m:(a,t,o,n,e,s,r,l,i)=>{const c=tapak(a,t,i),u=clamp(s||1,1,4),d=4.2+(u-1)*LANTAI;box(.97*a,.08,.96*t,0,0,0,"#CFC6B8"),box(c.bw,d,c.bd,c.cx,0,c.zc,n);const[h,g]=ovX(c,.15);box(h,.3,c.bd+.3,g,d,c.zc,"#C9C1B2"),box(c.bw,.9,.2,c.cx,3.3,c.zf+.02,o),gbox(.7*c.bw,.5,.1,c.cx,3.5,c.zf+.14,"#F2CF8A"),gbox(.75*c.bw,2.5,.1,c.cx,.5,c.zf+.02,"#C9D6E0");for(let a=1;a<u;a++)winRow(4,.8*c.bw,4.2+(a-1)*LANTAI+.9,c.zf+.03,1.4,1.1,c.cx);for(let a=0;a<6;a++)box(c.bw/6,.14,1,c.cx-c.bw/2+c.bw*(a+.5)/6,3,c.zf+.5,a%2?"#E6E2D8":o);box(1.2,.5,.6,c.cx-.35*c.bw,0,c.zf+.7,"#C2913A"),box(1.2,.5,.6,c.cx+.35*c.bw,0,c.zf+.7,"#4F7A55")}},
  bengkel:{n:"Bengkel",kind:"pribadi",grp:"usaha",zones:["RUKO","RUKO_KECIL","KAMPUNG"],w:2,h:1,cost:500,jobs:4,hrs:6,m:(a,t,o,n)=>{const e=.82*a,s=.62*t;box(.97*a,.08,.96*t,0,0,0,"#9BA0A6"),box(e,4.2,s,0,0,-.2,"#BFC7CC"),roof(1.05*e,1.1,1.15*s,0,4.2,-.2,"#6E7F8A");for(const a of[.22*-e,.22*e]){box(.36*e,3,.1,a,0,s/2-.13,"#5E666C");for(let t=0;t<6;t++)box(.36*e,.05,.12,a,.35+.45*t,s/2-.08,"#8A939A")}box(.5*e,.7,.15,0,3.3,s/2-.1,o);for(let a=0;a<3;a++)cyl(.45,.3,.47*e,.3*a,s/2+.9,"#2B2F33")}},
  sawah:{n:"Sawah",kind:"pribadi",grp:"usaha",zones:["DESA","KAMPUNG"],w:2,h:1,cost:120,jobs:2,hrs:2,m:(a,t,o,n,e,s,r,l)=>{box(.96*a,.1,.92*t,0,0,0,"#7EAF4F");for(let o=0;o<5;o++)box(.88*a,.3,.55,0,.1,.36*-t+o*t*.18,"#9DC25B"),box(.88*a,.06,.25,0,.1,.27*-t+o*t*.18,"#B8D9D4");box(1.6,1.2,1.6,.4*a,0,.25*t,"#C9A86A"),roof(2.1,1,2.1,.4*a,1.2,.25*t,l),cyl(.06,1.7,.3*-a,.2,0,"#5E4630"),box(1,.08,.08,.3*-a,1.5,0,"#5E4630"),sph(.22,.3*-a,2,0,"#C9A86A"),cone(.4,.3,.3*-a,2.15,0,"#C9A86A")}},
  kantor:{n:"Kantor",kind:"pribadi",grp:"usaha",zones:["CBD","RUKO"],w:2,h:2,cost:1200,jobs:12,req:"Pengusaha",hrs:12,m:(a,t,o,n,e,s)=>{const r=.56*a,l=.56*t,i=clamp(s||6,3,8),c=4.2+i*LANTAI;box(.96*a,.1,.96*t,0,0,0,"#CFC6B8"),box(1.3*r,4.2,1.3*l,0,0,0,"#DDD9CE"),gbox(1.2*r,2.6,.1,0,.5,.65*l+.01,"#C9D6E0"),door(0,.65*l+.02,"#2B2F33",1.8,2.4);for(let a=0;a<i;a++){const t=4.2+a*LANTAI;box(r,.5,l,0,t,0,"#DDD9CE"),G.push({g:"box",s:[r-.05,LANTAI-.5,l-.05],p:[0,t+.5+(LANTAI-.5)/2,0],c:"#C9D6E0"})}box(.6*r,1.4,.6*l,0,c,0,o),cyl(.1,2.5,.2*r,c+1.4,0,"#8A939A"),gsph(.2,.2*r,c+4,0,"#B4443A")}},
  taman:{n:"Taman",kind:"umum",grp:"umum",zones:["CBD","RUKO","RUKO_KECIL","KOTA","KAMPUNG","DESA"],w:1,h:1,cost:300,hrs:6,prop:1,d:"Menambah kepuasan rumah di sekitarnya.",m:(a,t)=>{box(.96*a,.12,.96*t,0,0,0,"#8FA462"),box(.96*a,.14,.9,0,0,0,"#C9C1B2"),box(.9,.14,.96*t,0,0,0,"#C9C1B2"),cyl(1.15,.45,0,.1,0,"#C9C1B2"),cyl(.85,.5,0,.1,0,"#7F93A6"),cyl(.12,1,0,.5,0,"#C9C1B2"),tree(.3*-a,.3*-t,.75),tree(.3*a,.3*t,.75),tree(.3*a,.3*-t,.6,"palm");for(const o of[-1,1])box(1.2,.35,.4,.3*-a,.3,.22*t*o,"#7A5A3A");bush(.33*-a,.33*t),lampPost(.15*a,.15*-t)}},
  lapangan:{n:"Tanah Lapang",kind:"umum",grp:"umum",zones:["RUKO","RUKO_KECIL","KOTA","KAMPUNG","DESA"],w:2,h:2,cost:600,hrs:8,prop:1,m:(a,t)=>{box(.96*a,.1,.96*t,0,0,0,"#8FA462"),box(.8*a,.12,.7*t,0,0,0,"#7F9455"),box(.8*a,.14,.12,0,0,0,"#E6E2D8"),cyl(1.6,.13,0,.01,0,"#E6E2D8"),cyl(1.45,.14,0,.01,0,"#7F9455");for(const t of[-1,1])box(.12,1.6,2.6,t*a*.4,0,0,"#E6E2D8"),box(.12,.12,2.6,t*a*.4,1.6,0,"#E6E2D8");tree(.4*-a,.4*-t,.8),tree(.4*a,.4*t,.8,"palm"),box(3,.5,1,0,0,.42*-t,"#4C6A96")}},
  sekolah:{n:"Sekolah",kind:"umum",grp:"umum",zones:["RUKO","RUKO_KECIL","KOTA","KAMPUNG","DESA"],w:2,h:2,cost:1500,jobs:6,jobProf:"Guru",hrs:24,prop:1,m:(a,t)=>{const o=.8*a,n=.36*t,e=.2*-t,s=2*LANTAI;box(.96*a,.12,.96*t,0,0,0,"#C9BFA6"),box(o,s,n,0,0,e,"#E2D6B8"),roof(1.06*o,2.6,1.35*n,0,s,e,"#9C4935");for(const a of[-1,1])box(n,LANTAI+.6,.36*t,a*(o/2-n/2),0,.08*t,"#E2D6B8"),roof(1.3*n,1.8,.4*t,a*(o/2-n/2),LANTAI+.6,.08*t,"#9C4935",Math.PI/2);winRow(6,.84*o,.9,e+n/2+.02,1.3,1),winRow(6,.84*o,LANTAI+.9,e+n/2+.02,1.3,1),door(0,e+n/2+.02,"#5A4636",1.6,2.3),flag(0,0,.32*t,7.5),box(3,.12,3,0,0,.32*t,"#C9BFA6")}},
  rs:{n:"Rumah Sakit",kind:"umum",grp:"umum",zones:["CBD","RUKO","RUKO_KECIL","KOTA","KAMPUNG"],w:2,h:2,cost:2e3,jobs:8,jobProf:"Dokter",hrs:36,prop:1,m:(a,t,o,n,e,s)=>{const r=.7*a,l=.48*t,i=.12*-t,c=clamp(s||3,3,5),u=4.2+(c-1)*LANTAI;box(.96*a,.12,.96*t,0,0,0,"#CFC6B8"),box(r,u,l,0,0,i,"#DDD9CE"),box(r+.15,.6,l+.15,0,4.2-.3,i,"#4C6A96");for(let a=0;a<c;a++)winRow(5,.86*r,a?4.2+(a-1)*LANTAI+.9:1.1,i+l/2+.02,a?1.3:2,1.1);box(.7,3,.24,0,u-4,i+l/2+.12,"#A9463A"),box(3,.7,.24,0,u-2.85,i+l/2+.12,"#A9463A"),gbox(.5,2.6,.1,0,u-3.8,i+l/2+.26,"#B4443A"),cyl(2,.2,0,u,i,"#5E666C"),box(.9,.05,.2,0,u+.21,i,"#E6E2D8"),box(.5*r,LANTAI,2,0,0,.3*t,"#DDD9CE"),box(2.4,1.3,1.3,.3*a,0,.38*t,"#E6E2D8"),box(2.4,.25,1.32,.3*a,.7,.38*t,"#A9463A")}},
  polisi:{n:"Kantor Polisi",kind:"umum",grp:"umum",zones:["CBD","RUKO","RUKO_KECIL","KOTA","KAMPUNG","DESA"],w:2,h:1,cost:1200,jobs:6,jobProf:"Polisi",hrs:24,prop:1,m:(a,t)=>{const o=.84*a,n=.6*t;box(.97*a,.1,.96*t,0,0,0,"#C9C1B2"),box(o,4.6,n,0,0,-.2,"#D8CBB2"),box(o+.3,.35,n+.3,0,4.6,-.2,"#2B3A67"),winRow(5,.86*o,1.9,n/2-.18,.9,.9),door(0,n/2-.18,"#2B3A67",1.4,2),gbox(.8,.35,.5,-.5,4.95,-.2,"#B4443A"),gbox(.8,.35,.5,.5,4.95,-.2,"#4C6A96"),box(.45*o,.6,.14,0,3.55,n/2-.12,"#E6E2D8"),box(2.3,1,1.1,.3*o,0,.38*t,"#E6E2D8"),box(2.3,.25,1.12,.3*o,.55,.38*t,"#2B3A67")}},
  penjara:{n:"Penjara",kind:"umum",grp:"umum",zones:["KAMPUNG","DESA","RUKO_KECIL"],w:2,h:1,cost:1e3,jobs:2,hrs:24,prop:1,m:(a,t)=>{const o=.9*a,n=.86*t;box(o,3,.5,0,0,n/2,"#8E979C"),box(o,3,.5,0,0,-n/2,"#8E979C"),box(.5,3,n,o/2,0,0,"#8E979C"),box(.5,3,n,-o/2,0,0,"#8E979C"),box(.5*o,3.8,.45*n,0,0,0,"#BFC7CC");for(let a=0;a<7;a++)box(.12,1.6,.1,.6*a-1.8,1,.225*n+.02,"#2B2B2B");cyl(.8,6,o/2-.5,0,-n/2+.5,"#8E979C"),box(2,1.2,2,o/2-.5,6,-n/2+.5,"#5E666C"),gsph(.25,o/2-.5,7.4,-n/2+.5,"#F2CF8A")}},
  pasar:{n:"Pasar Rakyat",kind:"umum",grp:"umum",zones:["CBD","RUKO","RUKO_KECIL"],w:2,h:2,cost:1e3,jobs:4,hrs:24,prop:1,m:(a,t)=>{box(.96*a,.12,.96*t,0,0,0,"#C6B898");const o=["#A9463A","#4F7A55","#C2913A","#4C6A96"];let n=0;for(const e of[.24*-a,.24*a])for(const a of[.24*-t,.24*t]){box(2.8,.9,2.8,e,0,a,"#8C6A48");for(const t of[-1.2,1.2])for(const o of[-1.2,1.2])box(.15,1.6,.15,e+t,.9,a+o,"#5A4636");pyr(3.8,1.3,3.8,e,2.5,a,o[n++%4]);for(let t=0;t<3;t++)sph(.3,e-.8+.8*t,1.05,a+.9,["#B8922E","#A9463A","#7FA850"][t]);gsph(.15,e,2.35,a,"#F2CF8A")}}},
  ibadah:{n:"Tempat Ibadah",kind:"umum",grp:"umum",zones:["RUKO","RUKO_KECIL","KOTA","KAMPUNG","DESA"],w:2,h:1,cost:800,hrs:18,prop:1,m:(a,t)=>{box(.96*a,.12,.92*t,0,0,0,"#CFC6B8"),box(.34*a,3.8,.6*t,.22*-a,0,0,"#E3DED2"),sph(.25*t,.22*-a,3.8,0,"#4F7A55"),box(.16,1,.16,.22*-a,3.8+.25*t,0,"#C2913A"),cyl(.5,7.5,.44*-a,0,.3*-t,"#E3DED2"),cone(.7,1.4,.44*-a,7.5,.3*-t,"#4F7A55"),box(.18*a,3.2,.4*t,.05*a,0,0,"#E3DED2"),roof(.2*a,1.6,.46*t,.05*a,3.2,0,"#8E3E34",Math.PI/2),box(.12,1.8,.12,.05*a,4.8,0,"#C2913A"),box(.8,.12,.12,.05*a,5.9,0,"#C2913A"),box(.2*a,2.4,.4*t,.34*a,0,0,"#C9A86A"),pyr(.3*a,1,.55*t,.34*a,2.4,0,"#8E3E34"),pyr(.22*a,.9,.4*t,.34*a,3.2,0,"#8E3E34"),winRow(3,.25*a,1.2,.3*t+.01)}},
  pln:{n:"Gardu PLN",kind:"umum",grp:"umum",zones:["KAMPUNG","DESA","KOTA","RUKO_KECIL"],w:1,h:1,cost:600,jobs:2,hrs:12,prop:1,m:(a,t)=>{box(.96*a,.12,.96*t,0,0,0,"#9E9A90");for(const a of[-.9,.9])for(const t of[-.9,.9])box(.18,10,.18,a,0,t,"#8A939A");for(let a=1;a<5;a++)box(2,.14,2,0,2.2*a,0,"#8A939A");box(4.4,.18,.18,0,9.4,0,"#8A939A");for(const a of[-2,2])gsph(.18,a,9.2,0,"#C9D6E0");box(2,1.6,1.4,.25*-a,0,.28*t,"#5E666C"),box(.8,.5,.06,.25*-a,.9,.28*t+.72,"#C2913A")}},
  stadion:{n:"Stadion",kind:"umum",grp:"umum",zones:["KOTA","KAMPUNG","RUKO","RUKO_KECIL"],w:4,h:2,cost:3500,jobs:10,hrs:48,prop:1,m:(a,t)=>{box(.96*a,.1,.92*t,0,0,0,"#C9C1B2"),box(.78*a,.15,.58*t,0,0,0,"#7F9455");for(let o=0;o<6;o++)box(.78*a/6,.16,.58*t,.39*-a+.78*a/12+o*a*.78/6,0,0,o%2?"#7F9455":"#8FA462");box(.15,.17,.58*t,0,0,0,"#E6E2D8");for(let o=0;o<3;o++)box(.86*a,1.2,1,0,1.1*o,.33*t+.6*o,["#A9463A","#8E3E34","#A9463A"][o]),box(.86*a,1.2,1,0,1.1*o,.33*-t-.6*o,["#4F7A55","#3F6B62","#4F7A55"][o]);box(1.6,3,.62*t,.45*a,0,0,"#E6E2D8"),box(1.6,3,.62*t,.45*-a,0,0,"#E6E2D8");for(const o of[-1,1])for(const n of[-1,1])cyl(.18,10,o*a*.46,0,n*t*.44,"#8A939A"),gbox(1.6,.9,.4,o*a*.46,10,n*t*.44,"#F2CF8A")}},
  istana:{n:"Istana Negara",kind:"umum",grp:"umum",zones:["CBD"],w:2,h:2,cost:4e3,jobs:6,hrs:72,prop:1,m:(a,t)=>{const o=.84*a,n=.4*t,e=.12*-t;box(.96*a,.12,.96*t,0,0,0,"#CFC6B8"),box(o,6,n,0,0,e,"#E6E2D8");for(let a=0;a<8;a++)cyl(.3,5,.42*-o+a*o*.12,0,e+n/2+.9,"#E3DED2");box(.98*o,.5,1.7,0,5,e+n/2+.9,"#E3DED2"),roof(.6*o,1.7,1.9,0,5.5,e+n/2+.9,"#E3DED2"),sph(2.6,0,6.6,e,"#C2913A"),cyl(.12,1,0,9,e,"#C2913A"),winRow(6,.86*o,1.3,e+n/2+.02,1.6,.7),winRow(6,.86*o,3.6,e+n/2+.02,1,.7),flag(0,9.9,e,3.2),box(.3*a,.13,.32*t,0,0,.33*t,"#CFC3AE");for(const o of[-1,1])bush(o*a*.3,.32*t,1.1),tree(o*a*.42,.42*t,.7,"palm")}},
  tugu:{n:"Alun-alun Tugu Kuda",kind:"umum",grp:"umum",zones:["CBD"],w:2,h:2,cost:900,hrs:12,prop:1,m:(a,t)=>{box(.96*a,.12,.96*t,0,0,0,"#CFC6B8"),cyl(.36*a,.2,0,.12,0,"#CFC3AE"),cyl(.3*a,.26,0,.12,0,"#8FA462"),box(2.8,1.5,2.8,0,.3,0,"#CFC3AE"),box(2.2,.3,2.2,0,1.8,0,"#C6B898"),box(1.1,1,2.6,0,2.9,0,"#B98C6E");for(const a of[-.35,.35])for(const t of[-.95,.95])box(.24,1,.24,a,2,t,"#B98C6E");box(.55,1.3,.7,0,3.6,1.25,"#B98C6E"),box(.45,.5,.9,0,4.7,1.6,"#B98C6E"),box(.15,.9,.15,0,3.5,-1.35,"#7A5A3A");for(const o of[-1,1])for(const n of[-1,1])tree(o*a*.4,n*t*.4,.8),lampPost(o*a*.25,n*t*.25);flag(.38*a,0,0,7)}},
  mulyo:{n:"Rumah Pak Mulyo",kind:"negara",grp:"none",zones:["CBD","RUKO","KOTA"],w:2,h:2,cost:0,m:(a,t)=>{const o=.62*a,n=.44*t,e=.1*-t;box(.96*a,.12,.96*t,0,0,0,"#C9BFA6"),box(o,4.8,n,0,0,e,"#E3DED2"),roof(1.22*o,2.8,1.35*n,0,4.8,e,"#9C4935");for(const a of[.3*-o,0,.3*o])cyl(.25,3,a,0,e+n/2+1,"#E6E2D8");box(.8*o,.3,2.2,0,3,e+n/2+1,"#9C4935"),winRow(4,.86*o,1.6,e+n/2+.02,1.1,.8),door(0,e+n/2+.02,"#5A4636",1.4,2.2),flag(.36*a,0,.3*t,8),tree(.36*-a,.3*t,.8),fence(.94*a,.94*t,.47*t,"#E6E2D8"),bush(.15*a,.38*t),bush(.15*-a,.38*t)}},
  posko:{n:"Posko Tukang",kind:"negara",grp:"none",zones:["CBD","RUKO","RUKO_KECIL","KOTA","KAMPUNG","DESA"],w:1,h:1,cost:0,m:(a,t)=>{box(.96*a,.1,.96*t,0,0,0,"#C6B898");for(const a of[-1.3,1.3])for(const t of[-1.3,1.3])cyl(.08,2.2,a,0,t,"#8A939A");roof(3.4,1.4,3.4,0,2.2,0,"#A8553B"),box(2.2,.8,1,0,0,0,"#8C6A48");for(const a of[-.8,.8])cyl(.25,.45,a,0,1,"#4C6A96");box(.9,.9,.9,.35*a,0,.3*-t,"#C2913A"),gsph(.18,0,2.1,0,"#F2CF8A")}},
  bank:{n:"Bank Negara",kind:"negara",grp:"none",zones:["CBD"],w:2,h:1,cost:0,jobs:4,m:(a,t,o,n,e,s,r,l,i)=>{const c=tapak(a,t,i,.8),u=4.2+LANTAI;box(.97*a,.12,.96*t,0,0,0,"#CFC6B8"),box(c.bw,u,c.bd,c.cx,0,c.zc,"#E2D6B8");for(let a=0;a<6;a++)cyl(.28,3.8,c.cx-.4*c.bw+a*c.bw*.16,0,c.zf+.9,"#E6E2D8");box(c.bw,.5,1.6,c.cx,3.8,c.zf+.8,"#E6E2D8"),roof(c.bw,1.3,1.7,c.cx,4.3,c.zf+.8,"#E6E2D8");const[d,h]=ovX(c,.15);box(d,.4,c.bd+.3,h,u,c.zc,"#C2913A"),winRow(5,.86*c.bw,4.2+.9,c.zf+.03,1.3,1,c.cx),gbox(2,.4,.1,c.cx,3.95,c.zf+1.66,"#F2CF8A"),door(c.cx,c.zf+.02,"#5A4636",1.4,2.4)}},
  barak:{n:"Barak TNI",kind:"negara",grp:"none",zones:["KAMPUNG","DESA","RUKO_KECIL"],w:2,h:2,cost:0,jobs:6,m:(a,t)=>{box(.96*a,.12,.96*t,0,0,0,"#8E9A78");for(const o of[.25*-t,.12*t])box(.6*a,2.6,.24*t,.12*-a,0,o,"#8C8F6A"),roof(.64*a,1.2,.3*t,.12*-a,2.6,o,"#6B7A4A"),winRow(5,.5*a,1,o+.12*t+.02,.7,.7);for(const o of[-.9,.9])for(const n of[-.9,.9])box(.2,6,.2,.34*a+o,0,.3*t+n,"#5E4630");box(2.4,1.6,2.4,.34*a,6,.3*t,"#8C8F6A"),pyr(3,1,3,.34*a,7.6,.3*t,"#6B7A4A"),gsph(.2,.34*a,7.2,.3*t+1.2,"#F2CF8A"),flag(.4*a,0,.36*-t,7)}},
  waduk:{n:"Bendungan & Sungai",kind:"negara",grp:"none",zones:["KAMPUNG","DESA","RUKO_KECIL"],w:2,h:2,cost:0,m:(a,t)=>{box(.96*a,.1,.96*t,0,0,0,"#8FA462"),box(.9*a,.3,.55*t,0,0,.15*-t,"#7F93A6"),box(.94*a,2.2,1.4,0,0,.16*t,"#C9C1B2"),box(.94*a,.3,1.8,0,2.2,.16*t,"#9E9A90");for(let o=0;o<4;o++)box(1,.9,.2,.3*-a+o*a*.2,.3,.16*t+.8,"#7F93A6");box(.9*a,.3,.22*t,0,0,.38*t,"#6B7E92"),tree(.38*-a,.38*-t,.8,"palm"),tree(.38*a,.38*-t,.8)}},
  apartemen:{n:"Apartemen Netizenia",kind:"negara",grp:"none",zones:["CBD"],w:2,h:2,cost:0,jobs:2,m:(a,t,o,n,e,s)=>{const r=.5*a,l=.5*t,i=clamp(s||9,5,9),c=i*LANTAI;box(.96*a,.12,.96*t,0,0,0,"#CFC6B8"),box(r,c,l,.18*-a,0,.18*-t,"#DDD0B4"),door(.18*-a,.18*-t+l/2+.02,"#2B2F33",1.6,2.3);for(let o=0;o<i;o++)winRow(4,.84*r,.9+o*LANTAI,.18*-t+l/2+.02,1.4,.9,.18*-a),o&&box(.9*r,.15,.8,.18*-a,o*LANTAI-.15,.18*-t+l/2+.4,"#C9BBA2");box(r+.4,.4,l+.4,.18*-a,c,.18*-t,"#8E3E34"),box(.34*a,.3,.3*t,.25*a,0,.25*t,"#E6E2D8"),box(.3*a,.32,.26*t,.25*a,0,.25*t,"#7F93A6");for(let o=0;o<3;o++)box(1.8,1.4,4.3,.06*a+2.4*o,0,.38*t,["#A9463A","#4C6A96","#E5E1D8"][o])}},
  pabrik:{n:"Pabrik & Bengkel",kind:"negara",grp:"none",zones:["KAMPUNG","DESA","RUKO_KECIL","RUKO"],w:2,h:2,cost:0,jobs:8,m:(a,t)=>{box(.96*a,.12,.96*t,0,0,0,"#9BA0A6"),box(.8*a,4,.5*t,0,0,.12*-t,"#BFC7CC");for(let o=0;o<4;o++)roof(.5*t,1.4,.2*a,.3*-a+o*a*.2,4,.12*-t,"#8A939A",Math.PI/2);for(const o of[.3*a,.18*a])cyl(.5,9,o,0,.36*-t,"#A8553B"),box(1.1,.3,1.1,o,8.4,.36*-t,"#E6E2D8");winRow(6,.7*a,1.6,.12*-t+.25*t+.02,1,.9),box(.3*a,2.8,.1,.2*-a,0,.12*-t+.25*t+.03,"#5E666C"),box(2.3,1,4.4,.25*a,0,.3*t,"#4C6A96"),box(2.3,.9,1.6,.25*a,1,.3*t+1.2,"#C9D6E0")}},
  pkl:{n:"Zona PKL",kind:"negara",grp:"none",zones:["RUKO","RUKO_KECIL"],w:2,h:1,cost:0,m:(a,t)=>{box(.96*a,.1,.9*t,0,0,0,"#CFC6B4");const o=["#A9463A","#C2913A","#4F7A55","#4C6A96"];for(let t=0;t<4;t++){const n=.36*-a+t*a*.24;box(1.5,1,.9,n,.35,0,"#8C6A48"),cyl(.3,.1,n-.5,0,.5,"#1E1C1A"),cyl(.3,.1,n+.5,0,.5,"#1E1C1A"),cyl(.05,1.6,n,1.35,0,"#2B2B2B"),cone(1.1,.5,n,2.9,0,o[t]),gsph(.12,n,2.8,0,"#F2CF8A")}}},
  ruko:{n:"Ruko",kind:"pribadi",grp:"usaha",zones:["CBD","RUKO","RUKO_KECIL"],w:1,h:1,cost:600,jobs:4,hrs:8,d:"Rumah toko 2–4 lantai di muka jalan utama.",m:(a,t,o,n,e,s,r,l,i)=>{s=clamp(s||3,2,4);const c=tapak(a,t,i),u=4.2+(s-1)*LANTAI,d=c.zf;box(c.bw,u,c.bd,c.cx,0,c.zc,n);const[h,g]=ovX(c,.05);box(h,.3,c.bd+.1,g,u,c.zc,"#8E979C"),box(1.4,1,1.2,c.cx-.25*c.bw,u+.3,c.zc-.4,"#4C6A96"),box(.86*c.bw,2.8,.1,c.cx,.3,d-.04,"#5E666C");for(let a=0;a<8;a++)box(.86*c.bw,.05,.12,c.cx,.5+.33*a,d,"#8A939A");gbox(.8*c.bw,1.2,.1,c.cx,.9,d+.02,"#F2CF8A"),box(.9*c.bw,.6,.14,c.cx,3.4,d+.06,o),gbox(.75*c.bw,.32,.1,c.cx,3.52,d+.16,"#F2CF8A"),box(c.bw,.14,1,c.cx,3.1,d+.5,o);for(let a=1;a<s;a++)winRow(2,.8*c.bw,4.2+(a-1)*LANTAI+.9,d+.03,1.3,1.1,c.cx);box(.3*c.bw,.12,.6,c.cx,0,d+.5,"#C9BFA6")}},
  kebun:{n:"Kebun",kind:"pribadi",grp:"usaha",zones:["DESA"],w:1,h:1,cost:90,jobs:1,hrs:2,d:"Kebun sayur & pisang di desa.",m:(a,t)=>{box(.96*a,.1,.94*t,0,0,0,"#7A5A3A");for(let o=0;o<4;o++)for(let n=0;n<4;n++)sph(.32,.33*-a+n*a*.22,.32,.3*-t+o*t*.2,o%2?"#5F7A3F":"#7E9452",.26);tree(.36*a,.34*t,.55,"palm"),tree(.38*-a,.36*-t,.5,"palm");for(let o=0;o<4;o++)cyl(.05,.9,.4*-a+o*a*.27,0,.45*t,"#8C6A48")}},
  terminal:{n:"Terminal Angkot",kind:"umum",grp:"umum",zones:["CBD"],w:4,h:2,cost:2500,jobs:8,hrs:36,prop:1,m:(a,t,o,n,e,s,r,l)=>{box(.96*a,.1,.96*t,0,0,0,"#9BA0A6");const i=.7*a,c=.42*t;for(const a of[-.42,-.14,.14,.42])for(const o of[-.4,.4])cyl(.14,4.2,a*i,0,o*c-.1*t,"#8A939A");box(i+1,.35,c+1,0,4.2,.1*-t,l),box(.4*i,3,.6*c,.25*-i,0,.1*-t,"#E2D6B8"),winRow(3,.36*i,1.3,.1*-t+.3*c+.02),door(.25*-i,.1*-t+.3*c+.02,"#5A4636",1.2,2);for(let o=0;o<6;o++)box(.14*a,.06,.3,.36*-a+o*a*.145,.1,.2*t,"#D9C56A");const u=["#3C6FA8","#3F8A5E","#C2913A"];for(let o=0;o<3;o++){const n=.3*-a+o*a*.3;box(2.2,2,4.6,n,0,.22*t,u[o]),box(2.24,.6,3.4,n,1.4,.2*t,"#6A7F95")}box(.5*a,.6,.14,0,4.6,.1*-t+c/2+.5,"#4C6A96"),gbox(.42*a,.34,.1,0,4.72,.1*-t+c/2+.58,"#F2CF8A"),lampPost(.44*a,.4*t),lampPost(.44*-a,.4*t)}},
  pangkalan:{n:"Pangkalan Ojek & Angkot",kind:"umum",grp:"umum",zones:["RUKO","RUKO_KECIL","KAMPUNG"],w:2,h:1,cost:400,jobs:2,hrs:8,prop:1,m:(a,t,o,n,e,s,r,l)=>{box(.96*a,.1,.92*t,0,0,0,"#CFC6B4");for(const t of[-1.4,1.4])for(const o of[-1,1])cyl(.08,2.6,.25*-a+t,0,o,"#8A939A");roof(3.6,1.1,2.8,.25*-a,2.6,0,l),box(2.6,.5,.8,.25*-a,.45,.3,"#8C6A48");for(let o=0;o<3;o++){const n=.1*a+1.1*o;box(.5,.6,1.9,n,.4,.1*t,"#2B2F33"),cyl(.36,.18,n,.02,.1*t+.7,"#1E1C1A"),cyl(.36,.18,n,.02,.1*t-.7,"#1E1C1A")}box(1.4,.5,.1,.25*-a,2.65,1.45,"#4F7A55"),gbox(1.2,.3,.08,.25*-a,2.75,1.52,"#F2CF8A")}},
  proyek_gedung:{n:"Proyek Gedung Negara",kind:"negara",grp:"none",zones:["CBD","RUKO"],w:2,h:2,cost:0,jobs:3,d:"Negara sedang membangun.",m:(a,t,o,n,e)=>{box(.96*a,.1,.96*t,0,0,0,"#C9C1B2");const s=.8*a,r=.7*t;box(s,.6,r,0,0,0,"#9E9A90");for(const a of[-.42,0,.42])for(const t of[-.4,.4])box(.5,6.5,.5,a*s,.6,t*r,"#9E9A90");box(s,.35,r,0,3.6,0,"#9E9A90"),box(.6*s,2.6,.3,.2*-s,.6,r/2-.2,"#956350");for(let a=0;a<6;a++)cyl(.04,7.4,.44*-s+a*s*.176,.6,r/2+.6,"#C9A86A");for(let a=2.2;a<7.5;a+=2.4)box(.9*s,.08,.08,0,a,r/2+.6,"#C9A86A");box(1.4,.9,1.4,.35*s,.95,.1*-r,"#956350"),cone(1.1,.9,.35*-s,.95,.1*-r,"#D3C293")}},
  proyek_rumah:{n:"Proyek Rumah Negara",kind:"negara",grp:"none",zones:["KAMPUNG","KOTA","DESA"],w:1,h:1,cost:0,jobs:2,d:"Negara sedang membangun.",m:(a,t)=>{box(.96*a,.08,.96*t,0,0,0,"#C9BFA6");const o=.66*a,n=.6*t;box(o,.4,n,0,0,-.2,"#9E9A90"),box(o,2.2,n,0,.4,-.2,"#956350");for(const a of[-.5,.5])for(const t of[-.5,.5])cyl(.05,3.6,a*o,.4,t*n-.2,"#8A939A");for(const a of[-.58,.58])for(const t of[-.5,.55])cyl(.05,4,a*o,0,t*n,"#C9A86A");for(let a=1.3;a<4;a+=1.2)box(1.2*o,.08,.08,0,a,.55*n,"#C9A86A"),box(1.2*o,.08,.08,0,a,.5*-n,"#C9A86A");box(1,.6,1,.33*a,0,.3*t,"#956350"),cone(.7,.6,.33*-a,0,.3*t,"#D3C293")}},
  lahan_material:{n:"Lahan Material",kind:"negara",grp:"none",zones:["RUKO","RUKO_KECIL","KOTA","KAMPUNG","DESA"],w:1,h:1,cost:0,d:"Tumpukan bahan bangunan negara.",m:(a,t)=>{box(.96*a,.08,.96*t,0,0,0,"#C9BFA6");for(const o of[-1,1])box(.9*a,1.8,.08,0,0,o*t*.44,"#8E979C"),box(.08,1.8,.9*t,o*a*.44,0,0,"#8E979C");for(let o=0;o<3;o++)box(1.2,.5+.3*o,1.1,.25*-a+.3*o,0,.2*-t,"#956350");cone(1.2,1,.22*a,0,.18*-t,"#D3C293"),cone(.9,.7,.1*a,0,.25*t,"#9BA0A6");for(let o=0;o<5;o++)cyl(.06,2.6,.3*-a+.2*o,.2,.3*t,"#5E666C");box(.08,1.6,.08,.3*a,0,.42*t,"#5E666C"),box(.08,1.6,.08,.3*a+1.2,0,.42*t,"#5E666C"),box(1.4,.9,.06,.3*a+.6,1.4,.42*t,"#E6E2D8"),box(1.2,.12,.07,.3*a+.6,1.95,.44*t,"#A9463A")}}
};


/**
 * Create a building model by type key from Netizenia Catalog.
 * @param {string} type - Building key (e.g. 'rumah', 'kantor', 'sekolah', 'rs', 'istana')
 * @param {Object} options - Custom options (zone, color, floors, plotWidth, plotDepth)
 * @returns {THREE.Group} Three.js Group ready to place on plot pad
 */
export function createNetizeniaBuilding(type, options = {}) {
  const def = NETIZENIA_BUILDINGS[type] || NETIZENIA_BUILDINGS['rumah'];
  P = [];
  G = [];
  
  const wUnits = def.w || 1;
  const hUnits = def.h || 1;
  const a = wUnits * T - 0.8;
  const t = hUnits * T - 0.8;
  
  const aksen = options.aksen || AKSEN[0];
  const wall = options.wall || WALLS[0];
  const extra = 0;
  const floors = options.floors || (wUnits > 1 ? 4 : 2);
  const zone = options.zone || "KOTA";
  const genteng = options.genteng || GENTENG[0];
  const context = {
    adj: options.adj || {},
    lw: wUnits,
    lh: hUnits,
    floors,
    zone,
    seed: options.seed || 42
  };
  
  // Invoke procedural building generator
  if (typeof def.m === 'function') {
    def.m(a, t, aksen, wall, extra, floors, zone, genteng, context);
  }
  
  // Scale defaults to 1.0 (True 1:1 scale: 7.2m footprint in 8m lot)
  const scale = options.scale !== undefined ? options.scale : 1.0;
  const group = buildGroupFromPrimitives(scale);
  group.userData.buildingType = type;
  group.userData.buildingName = def.n;
  group.userData.kind = def.kind;
  group.userData.group = def.grp;
  group.userData.dimensions = [wUnits, hUnits];
  
  return group;
}
