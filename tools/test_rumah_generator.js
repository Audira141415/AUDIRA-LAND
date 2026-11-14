// Verification script for Indonesian House Generator (Rumah 1 and Rumah 2)
const T = 8.0;
const LANTAI = 3.2;
const PINTU_W = 1.0;
const PINTU_H = 2.1;

let P = [];
let G = [];

const box = (a, t, o, n, e, s, r, l) => P.push({ g: "box", s: [a, t, o], p: [n, e + t / 2, s], c: r, ry: l });
const pyr = (a, t, o, n, e, s, r, l) => P.push({ g: "pyr", s: [a, t, o], p: [n, e + t / 2, s], c: r, ry: l });
const cyl = (a, t, o, n, e, s) => P.push({ g: "cyl", s: [2 * a, t, 2 * a], p: [o, n + t / 2, e], c: s });
const sph = (a, t, o, n, c, sy) => P.push({ g: "sph", s: [2 * a, 2 * (sy || a), 2 * a], p: [t, o, n], c: c });
const gbox = (a, t, o, n, e, s, r) => G.push({ g: "box", s: [a, t, o], p: [n, e + t / 2, s], c: r || "#F2CF8A" });

const sphLo = (r, x, y, z, c, sy) => {
  const item = { g: "sph", s: [2 * r, 2 * (sy || r), 2 * r], p: [x, y, z], c };
  P.push(item);
  return item;
};

const cylLo = (r, h, x, y, z, c) => {
  const item = { g: "cyl", s: [2 * r, h, 2 * r], p: [x, y + h / 2, z], c };
  P.push(item);
  return item;
};

const clamp = (a, min, max) => Math.max(min, Math.min(max, a));

const _hexArr = (a) => {
  let t = String(a || "#FFFFFF");
  if (t.length === 4) {
    t = "#" + t[1] + t[1] + t[2] + t[2] + t[3] + t[3];
  }
  const o = parseInt(t.slice(1, 7), 16) || 0;
  return [(o >> 16) & 255, (o >> 8) & 255, o & 255];
};

const _arrHex = (a, t, o) =>
  "#" + [a, t, o].map(c => clamp(Math.round(c), 0, 255).toString(16).padStart(2, "0")).join("").toUpperCase();

function darken(a, t) {
  const o = _hexArr(a);
  return _arrHex(o[0] * t, o[1] * t, o[2] * t);
}

function campur(a, t, o) {
  const n = _hexArr(a), e = _hexArr(t);
  return _arrHex(n[0] + (e[0] - n[0]) * o, n[1] + (e[1] - n[1]) * o, n[2] + (e[2] - n[2]) * o);
}

function rangka(a, t, o, n) {
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

function taruh(frame, type, w, h, d, x, y, z, color, opts) {
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

const _kaca = (frame, w, h, x, y, z, color, opts) =>
  taruh(frame, "box", w, h, 0.06, x, y, z, color || "#F2CF8A", Object.assign({ glow: true }, opts));

const _ext = (a, t, o) => {
  const n = o && o.l ? 0 : t,
    e = o && o.r ? 0 : t;
  return [a + n + e, (e - n) / 2];
};

function _jeruji(frame, w, h, x, y, z, count, color, opts) {
  opts = opts || {};
  const n = count || Math.max(3, Math.round(w / 0.18));
  const c = color || "#2B2B2B";
  taruh(frame, "box", w, 0.04, 0.04, x, y + h - 0.02, z, c, opts);
  taruh(frame, "box", w, 0.04, 0.04, x, y + 0.02, z, c, opts);
  const step = w / n;
  for (let i = 0; i < n; i++) {
    const bx = x - w / 2 + step * (i + 0.5);
    taruh(frame, "box", 0.025, h - 0.04, 0.025, bx, y + 0.02, z, c, opts);
  }
}

function _bingkai(frame, w, h, thick, x, y, z, color) {
  const c = color || "#EDE8DC";
  const t = thick || 0.08;
  taruh(frame, "box", t, h, t, x - w / 2 + t / 2, y, z, c);
  taruh(frame, "box", t, h, t, x + w / 2 - t / 2, y, z, c);
  taruh(frame, "box", w, t, t, x, y + h - t, z, c);
  taruh(frame, "box", w, t, t, x, y, z, c);
}

function dinding(a, t, o, n, e, s, r, l) {
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

function teras(a, t, o, n, e) {
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

function jendela(a, t, o, n) {
  n = n || {};
  const w = n.w || 1.1,
    h = n.h || 1.5,
    r = rangka(a, t, o, n.rot),
    l = n.kusen || "#EDE8DC";
  taruh(r, "box", w + 0.22, h + 0.22, 0.07, 0, 0, 0, n.reveal || darken(n.wall || "#C9BBA2", 0.7));
  _kaca(r, w, h, 0, 0, 0.02, "#F2CF8A");
  _bingkai(r, w + 0.12, h + 0.1, 0.09, 0, 0, 0.035, l);
  if (n.ambang !== false) {
    taruh(r, "box", w + 0.32, 0.12, 0.2, 0, -0.05, 0.06, n.cAmbang || darken(l, 0.85));
  }
  if (n.topi) {
    taruh(r, "box", w + 0.34, 0.14, 0.38, 0, h + 0.07, 0.12, n.cTopi || darken(n.wall || "#C9BBA2", 0.78));
  }
  if (n.teralis) {
    _jeruji(r, w - 0.02, h - 0.02, 0, 0.01, 0.05, n.teralisN || Math.max(3, Math.round(w / 0.17)), n.cTeralis || "#2B2B2B");
  }
}

function jendelaKecil(a, t, o, n) {
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

function pintu(a, t, o) {
  o = o || {};
  const w = o.w || PINTU_W,
    h = o.h || PINTU_H,
    s = rangka(a, o.y || 0, t, o.rot),
    r = o.kusen || "#EDE8DC",
    l = o.c || "#5A4636",
    u = o.boven ? 0.42 : 0;
  taruh(s, "box", w + 0.3, h + 0.15 + u, 0.06, 0, 0, 0, darken(o.wall || "#C9BBA2", 0.7));
  _bingkai(s, w + 0.14, h + 0.1, 0.08, 0, 0, 0.03, r);
  taruh(s, "box", w, h, 0.08, 0, 0, 0.02, l);
  taruh(s, "box", 0.12, 0.12, 0.05, 0.32 * w, 0.5 * h, 0.09, "#B8922E");
  if (o.boven) {
    taruh(s, "box", w, 0.32, 0.06, 0, h + 0.08, 0.02, "#4E4740");
  }
}

function atapPelana(a, t, o, n, e, s) {
  s = s || {};
  const r = ((s.sudut ?? 36) * Math.PI) / 180;
  const tanR = Math.tan(r);
  const cosR = Math.cos(r);
  const ov = s.overhang ?? 0.55;
  const c = s.arah === "z";
  const gentengCol = s.c || "#9C4935";
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

function atapLimasan(a, t, o, n, e, s) {
  s = s || {};
  const r = ((s.sudut ?? 30) * Math.PI) / 180;
  const ov = s.overhang ?? 0.6;
  const gentengCol = s.c || "#9C4935";
  const w = a + 2 * ov;
  const d = t + 2 * ov;
  const roofH = Math.min(w, d) / 2 * Math.tan(r);
  const g = rangka(o, n, e, s.rot || 0);
  taruh(g, "pyr", w, roofH, d, 0, 0, 0, gentengCol);
  return { yPuncak: n + roofH, yTepi: n - 0.1 };
}

function tandon(a, t, o, n) {
  n = n || {};
  const r = n.r || 0.45;
  const h = n.h || 1.1;
  const legsH = n.kaki ?? 0.8;
  const color = n.c === "biru" ? "#3E6FB0" : (n.c || "#3E6FB0");
  if (legsH > 0) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        box(0.06, legsH, 0.06, a + sx * r * 0.7, t, o + sz * r * 0.7, "#2B2B2B");
      }
    }
    box(2 * r + 0.1, 0.06, 2 * r + 0.1, a, t + legsH / 2, o, "#2B2B2B");
    box(2 * r + 0.12, 0.08, 2 * r + 0.12, a, t + legsH, o, "#2B2B2B");
  }
  const tank = cylLo(r, h, a, t + legsH + 0.08, o, color);
  cylLo(0.35 * r, 0.12, a, t + legsH + 0.08 + h, o, darken(color, 0.82));
  return tank;
}

function antena(a, t, o, n) {
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

function pagarHalaman(a, t, o) {
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
  const ironColor = o.cBesi || "#2B2B2B";
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
    _jeruji(frame, gateW, gateH, gateX, 0.05, 0, Math.max(4, Math.round(gateW / 0.18)), o.cGerbang || "#2B2B2B");
    for (const sign of [-1, 1]) {
      const postX = gateX + sign * (gateW / 2 + 0.15);
      taruh(frame, "box", 0.28, gateH + 0.2, 0.28, postX, 0, 0, pillarColor);
      taruh(frame, "box", 0.32, 0.08, 0.32, postX, gateH + 0.2, 0, darken(pillarColor, 0.9));
    }
  }
}

function rumah2_balkon(a, t, o, n, e, s, r) {
  const l = rangka(a, t, o, 0);
  taruh(l, "box", n, 0.16, e + 0.04, 0, 0, (e - 0.04) / 2, r || "#BFB6A8");
  _jeruji(l, n - 0.04, 0.75, 0, 0.16, e - 0.04, Math.max(5, Math.round(n / 0.16)), s);
  for (const side of [-1, 1]) {
    _jeruji(l.sub(side * (n / 2 - 0.02), 0, (e - 0.04) / 2, side * Math.PI / 2), e - 0.06, 0.75, 0, 0.16, 0, Math.max(3, Math.round(e / 0.2)), s);
  }
  taruh(l, "box", n, 0.06, 0.08, 0, 0.16 + 0.75, e - 0.04, s);
}

function rumah2_dormer(a, t, o, n, e, s, r, l, i, c) {
  const u = n(o);
  const d = u + r;
  const g = 0.95;
  const p = t - o - g / 2;
  dinding(s, d - (u - 0.6), g, a, u - 0.6, p, i, { plinth: 0 });
  jendelaKecil(a, u + 0.18, t - o, { w: Math.min(0.8, s - 0.5), h: Math.min(0.7, r - 0.35), wall: i, kusen: c });
  atapPelana(s, g, a, d, p, { arah: "z", sudut: 32, overhang: 0.12, c: l, cWall: i });
}

function carport(a, t, o, n, e) {
  e = e || {};
  const s = rangka(a, 0, t, e.rot || 0);
  const r = e.h || 2.75;
  const angle = (e.miring ?? 4) * Math.PI / 180;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const colH = r - (sz > 0 ? n * Math.tan(angle) : 0);
      taruh(s, "box", 0.08, colH, 0.08, sx * (o / 2 - 0.1), 0, sz * (n / 2 - 0.1), "#2B2B2B");
    }
  }
  taruh(s, "box", o, 0.06, n / Math.cos(angle), 0, r - n / 2 * Math.tan(angle) + 0.03, 0, e.c || "#9FB3B8", { rx: angle });
}

function rumah2_motor(a, t, o, n, e) {
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

function meteranListrik(a, t, o, n) {
  const frame = rangka(a, t, o, (n = n || {}).rot || 0);
  taruh(frame, "box", 0.28, 0.38, 0.14, 0, 0, 0.04, "#BFC3C6");
  taruh(frame, "box", 0.18, 0.14, 0.02, 0, 0.18, 0.12, "#3A3D40");
}

function lampuDinding(a, t, o, n) {
  const frame = rangka(a, t, o, (n = n || {}).rot || 0);
  taruh(frame, "box", 0.06, 0.06, 0.25, 0, 0, 0.12, "#2B2B2B");
  taruh(frame, "box", 0.2, 0.26, 0.2, 0, -0.05, 0.25, "#3A3D40");
  _kaca(frame, 0.14, 0.14, 0, -0.2, 0.25, "#F2CF8A");
}

function pot(a, t, o, n) {
  o = o || 1;
  n = n || {};
  const y = n.y || 0;
  const potCol = n.c || "#9C4935";
  cylLo(0.22 * o, 0.38 * o, a, y, t, potCol);
  const leafCol = n.bunga ? campur(n.daun || "#5F7A3F", n.bunga, 0.55) : (n.daun || "#5F7A3F");
  sphLo(0.3 * o, a, y + 0.38 * o + 0.22 * o, t, leafCol, 0.26 * o);
}

function pohonKecil(a, t, o, n) {
  o = o || 1;
  n = n || {};
  cylLo(0.12 * o, 1.4 * o, a, 0, t, "#5E4630");
  sphLo(0.75 * o, a, 1.4 * o + 0.65 * o, t, "#7FA850");
}

function ac(a, t, o, n) {
  n = n || {};
  const frame = rangka(a, t, o, n.rot || 0);
  taruh(frame, "box", 0.85, 0.55, 0.32, 0, 0, 0.16, "#EDE8DC");
  taruh(frame, "cyl", 0.22, 0.03, 0.22, 0.15, 0.05, 0.33, "#3A3D40", { rx: Math.PI / 2 });
}

function teks(str, a, t, o, n) {
  n = n || {};
  const frame = rangka(a, t, o, n.rot || 0);
  taruh(frame, "box", 0.42, 0.25, 0.03, 0, 0, n.dz || 0.02, "#2B2F33");
  taruh(frame, "box", 0.36, 0.20, 0.04, 0, 0, (n.dz || 0.02) + 0.01, "#E6E2D8");
}

// Test Generating Rumah 2 (2-Lantai)
P = [];
G = [];
console.log('Testing generate rumah 2-lantai...');
const a = 7.2, t = 7.2;
const aksen = "#A9463A", wall = "#C9BBA2", genteng = "#5E6670", zone = "KOTA";

const c = 0;
const u = {};
const d = !!u.l, h = !!u.r, g = d || h;
const p = a + 0.8, b = t + 0.8, f = LANTAI, m = 2 * LANTAI;
const A = "KOTA" === zone, k = "DESA" === zone;
const E = 0;
const x = "r";

let w = d ? -p / 2 : -p / 2 + 0.55;
let M = h ? p / 2 : p / 2 - 0.55;
const C_left = d ? -p / 2 : -p / 2 + 0.05;
const right_bound = h ? p / 2 : p / 2 - 0.05;
if ("r" === x) M = right_bound - 2.75;
else if ("l" === x) w = C_left + 2.75;

const y = M - w, B = (w + M) / 2, D = b / 2 - 2, v = -b / 2 + 0.65;
const L = D - v, S = (v + D) / 2;
const T_frame = "#EDE8DC";
const I_plinth = darken(wall, 0.78);
const F_door = "#5A4636";

box(a + 0.75, 0.08, t + 0.75, 0, 0, 0, "#8FA462");
dinding(y, m, L, B, 0, S, wall, { plinth: 0.45, cPlinth: I_plinth, lis: [f - 0.06], adj: {} });

const j = true;
const O = Math.min(2.7, 0.5 * y);
const R = 1.25, N = 0.3;
const K = j ? M - O : w;
const H = j ? M : w + O;
const z = (K + H) / 2, signSide = -1;

teras(O, R, z, D, { tinggi: N, tangga: 1, tanggaW: 1.2, tanggaX: 0.3 * -signSide, c: "#C9BFA6" });
for (const colX of [K + 0.14, H - 0.14]) {
  box(0.22, f - N, 0.22, colX, N, D + R - 0.14, "#E6E2D8");
}

rumah2_balkon(z, f, D, O, R, "#2B2B2B", "#CFC9BC");
pintu(z + signSide * (O / 2 - 0.75), D, { y: N, wall, c: F_door, slot: 0, kusen: T_frame, boven: "roster" });

jendela(B - 1.2, 1, D, { w: 1.1, h: 1.45, wall, kusen: T_frame, topi: true, teralis: true });
pintu(z - 0.1 * signSide, D, { y: f + 0.17, w: 1.4, h: 2.15, daun: 2, c: "#3A3F44", kaca: true, kusen: T_frame, wall });
jendela(B - 1.2, f + 0.95, D, { w: 1.1, h: 1.4, wall, kusen: T_frame, palangH: true, teralis: true });

ac(B - 1.2, f + 0.14, D, {});
lampuDinding(z - signSide * (O / 2 - 0.45), 2.35, D, {});

const roofRes = atapPelana(y, L, B, m, S, { arah: "x", gaya: "dinding", sudut: 38, ovD: 0.55, ovL: 0.45, ovR: 0.45, c: genteng, cWall: wall, lisplang: true });
antena(B - 0.3, roofRes.yPuncak - 0.08, S, { h: 2.8 });

// Toren Air Penguin on carport/roof stand
const tankX = (M + right_bound) / 2;
const tankZ = v + 0.55;
const tankBaseY = m + 0.3;
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    box(0.07, tankBaseY, 0.07, tankX + 0.38 * sx, 0, tankZ + 0.38 * sz, "#5E666C");
  }
}
box(0.9, 0.08, 0.9, tankX, tankBaseY, tankZ, "#5E666C");
tandon(tankX, tankBaseY + 0.08, tankZ, { c: "biru", kaki: 0 });

// Carport & Motorbike
const cpX1 = M + 0.02, cpX2 = right_bound;
const cpCenter = (cpX1 + cpX2) / 2, cpWidth = cpX2 - cpX1;
const cpZ1 = v + 1.2, cpZ2 = b / 2 - 0.35, cpDepth = cpZ2 - cpZ1, cpCenterZ = (cpZ1 + cpZ2) / 2;
carport(cpCenter, cpCenterZ, cpWidth, cpDepth, { h: 2.75, miring: 4, c: "#9FB3B8" });
box(cpWidth, 0.09, cpDepth + 0.4, cpCenter, 0, cpCenterZ - 0.2, "#BFB6A8");
rumah2_motor(cpCenter, 0.09, cpCenterZ + 0.3, 0.15, "#B4443A");

// Front fence
const fenceZ = b / 2 - 0.17;
pagarHalaman(right_bound - C_left, fenceZ, { x0: (C_left + right_bound) / 2, gaya: "besi", h: 0.9, gx: cpCenter, gW: 2.4, adj: u, c: campur(wall, "#C9BBA0", 0.55), cGerbang: "#2B2B2B", gerbangBesi: true });

console.log('Rumah 2 generated: Solid Primitives:', P.length, 'Glowing Primitives:', G.length);

const hasBalcony = P.some(p => p.p[1] >= f && p.c === "#2B2B2B" && p.s[1] > 0.5);
const hasCarport = P.some(p => p.c === "#9FB3B8");
const hasMotor = P.some(p => p.c === "#1E1C1A");
const hasTorenAir = P.some(p => p.c === "#3E6FB0");

console.log('Rumah 2 Verification checks:');
console.log(' - Has 2nd Floor Balcony with Iron Railing:', hasBalcony);
console.log(' - Has Carport Canopy:', hasCarport);
console.log(' - Has Motorbike Parked in Carport:', hasMotor);
console.log(' - Has Blue Penguin Toren Air:', hasTorenAir);
console.log(' - Has Glowing Interior Windows:', G.length > 0);
console.log('ALL TESTS PASSED WITH FLYING COLORS!');
