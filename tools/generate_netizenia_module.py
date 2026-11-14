import os
import json
import re

SCRAPED_DIR = os.path.join(os.path.dirname(__file__), "scraped_netizenia")
buildings_json_path = os.path.join(SCRAPED_DIR, "all_extracted_buildings.json")
web_models_dir = os.path.join(os.path.dirname(__file__), "..", "web", "src", "models")
os.makedirs(web_models_dir, exist_ok=True)

with open(buildings_json_path, "r", encoding="utf-8") as f:
    buildings = json.load(f)

print(f"Loaded {len(buildings)} buildings. Assembling netizenia_catalog.js...")

output_js = os.path.join(web_models_dir, "netizenia_catalog.js")

header = """/**
 * AUDIRA-LAND - Scraped & Enhanced Complete Netizenia Architecture Catalog
 * Extracted from https://republiknetizenia.pages.dev/v2/
 * Contains 36 complete building types, procedural geometry generators,
 * Warm Ink Nusantara color tokens, and Zero-Submerging Surface Policy alignment.
 */

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

// Three.js Shared Geometries & Material Cache
let GEOMETRIES = null;

function getGeometries() {
  if (GEOMETRIES) return GEOMETRIES;
  GEOMETRIES = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
    cone: new THREE.ConeGeometry(0.5, 1, 10),
    sph: new THREE.SphereGeometry(0.5, 12, 8),
    pyr: (() => {
      const geo = new THREE.ConeGeometry(0.5, 1, 4, 1);
      if (typeof geo.rotateY === 'function') {
        geo.rotateY(Math.PI / 4);
        geo.scale(Math.SQRT2, 1, Math.SQRT2);
      }
      return geo;
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
      color: new THREE.Color(colorStr)
    }));
  }
  return materialCache.get(key);
}

const glowCache = new Map();
function getGlowMat(colorStr) {
  if (!glowCache.has(colorStr)) {
    glowCache.set(colorStr, new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorStr),
      toneMapped: false
    }));
  }
  return glowCache.get(colorStr);
}

/**
 * Builds a 3D Three.js Group from primitive arrays P and G
 * with plot-relative scale and Zero-Submerging Surface guarantee.
 */
export function buildGroupFromPrimitives(scale = 0.38888) {
  const group = new THREE.Group();
  const geos = getGeometries();
  
  // Solid primitives
  for (const item of P) {
    const geo = geos[item.g] || geos.box;
    const mat = getLambertMat(item.c || "#FFFFFF");
    const mesh = new THREE.Mesh(geo, mat);
    
    mesh.scale.set(item.s[0] * scale, item.s[1] * scale, item.s[2] * scale);
    mesh.position.set(item.p[0] * scale, item.p[1] * scale, item.p[2] * scale);
    if (item.ry) mesh.rotation.y = item.ry;
    if (item.rx) mesh.rotation.x = item.rx;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  
  // Glowing / Glass primitives
  for (const item of G) {
    const geo = geos[item.g] || geos.box;
    const mat = getGlowMat(item.c || LAMPU);
    const mesh = new THREE.Mesh(geo, mat);
    
    mesh.scale.set(item.s[0] * scale, item.s[1] * scale, item.s[2] * scale);
    mesh.position.set(item.p[0] * scale, item.p[1] * scale, item.p[2] * scale);
    group.add(mesh);
  }
  
  return group;
}
"""

bld_entries = []
for k, block in buildings.items():
    bld_entries.append(f"  {block}")

buildings_dict = "export const NETIZENIA_BUILDINGS = {\n" + ",\n".join(bld_entries) + "\n};\n"

factory_func = """
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
  
  // Calculate appropriate scale: standard single plot is 2.8m, Netizenia 1-lot is 7.2m
  const scale = options.scale || (2.8 / 7.2);
  const group = buildGroupFromPrimitives(scale);
  group.userData.buildingType = type;
  group.userData.buildingName = def.n;
  group.userData.kind = def.kind;
  group.userData.group = def.grp;
  group.userData.dimensions = [wUnits, hUnits];
  
  return group;
}
"""

with open(output_js, "w", encoding="utf-8") as f:
    f.write(header + "\n" + buildings_dict + "\n" + factory_func)

print(f"Successfully generated {output_js} ({os.path.getsize(output_js)} bytes)!")

