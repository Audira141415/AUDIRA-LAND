/* AUDIRA LAND · world: pulau, jalan, kavling, landmark, pelabuhan, pohon, warga.
   Semua deterministik dari SEED: semua perangkat melihat kota yang sama tanpa kirim data per petak. */
(function (AL) {
  'use strict';
  // pulau lebar: barat = Kampung Nyiur (bambu & anyaman daun kelapa), timur = Kota Cakrawala (modern), dibelah sungai
  const W = 112, H = 64, SEED = 1109;
  const T = { DEEP: 0, SHALLOW: 1, SAND: 2, GRASS: 3, ROAD: 4, LOT: 5, DOCK: 6 };
  AL.W = W; AL.H = H; AL.T = T; AL.SEED = SEED;

  const idx = (x, y) => y * W + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  AL.idx = idx; AL.inb = inb;

  const tiles = new Uint8Array(W * H);
  const elev = new Float32Array(W * H);
  const lotAt = new Int16Array(W * H).fill(-1);
  AL.tiles = tiles; AL.elev = elev; AL.lotAt = lotAt;
  AL.tileAt = (x, y) => (inb(x, y) ? tiles[idx(x, y)] : T.DEEP);

  // ---------- 1. TERRAIN: pulau dari noise + jatuhan radial ----------
  const cx = W / 2, cy = H / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - cx) / (W / 2), dy = (y + 0.5 - cy) / (H / 2);
    const d = Math.hypot(dx, dy);
    const n = AL.fbm(x / 13, y / 13, SEED);
    const e = 1 - d * 1.08 + (n - 0.5) * 0.6;
    const i = idx(x, y);
    elev[i] = e;
    tiles[i] = e < 0.05 ? T.DEEP : e < 0.17 ? T.SHALLOW : e < 0.25 ? T.SAND : T.GRASS;
  }

  // ---------- 1b. DUA KAWASAN & SUNGAI ----------
  const riverX = y => 50 + Math.sin(y / 6) * 2.2;
  AL.riverX = riverX;
  AL.district = (x, y) => (x < riverX(y) ? 'kampung' : 'kota');
  AL.DISTRICT = { kampung: 'Kampung Nyiur', kota: 'Kota Cakrawala' };
  const CENTER = { kampung: { x: 26, y: 32 }, kota: { x: 80, y: 32 } };
  AL.CENTER = CENTER;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (tiles[i] >= T.SAND && Math.abs(x + 0.5 - riverX(y)) < 1.6) tiles[i] = T.SHALLOW;
  }

  // ---------- 2. JALAN: grid tiap 5 petak, hanya di daratan, lalu buang yang tidak tersambung ----------
  const RE = 5, RO = 2; // jalan di x%5==2 / y%5==2
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if ((x % RE === RO || y % RE === RO) && tiles[i] === T.GRASS && elev[i] >= 0.3) tiles[i] = T.ROAD;
  }
  // jembatan di tiga jalan barat-timur yang melintasi sungai
  const bridges = new Set();
  AL.bridges = bridges;
  for (const y of [22, 32, 42]) {
    const rx = riverX(y);
    let ok = true;
    for (let x = Math.floor(rx - 3); x <= Math.ceil(rx + 3); x++) if (tiles[idx(x, y)] === T.DEEP) ok = false;
    if (!ok) continue;
    for (let x = Math.floor(rx - 3); x <= Math.ceil(rx + 3); x++) {
      const i = idx(x, y);
      if (tiles[i] === T.SHALLOW) { tiles[i] = T.ROAD; bridges.add(i); }
      else if (tiles[i] === T.SAND || tiles[i] === T.GRASS) tiles[i] = T.ROAD;
    }
  }
  (function prune() {
    let start = -1, best = 1e9;
    for (let i = 0; i < W * H; i++) if (tiles[i] === T.ROAD) {
      const d = Math.hypot((i % W) - CENTER.kota.x, ((i / W) | 0) - CENTER.kota.y);
      if (d < best) { best = d; start = i; }
    }
    const seen = new Uint8Array(W * H), q = [start];
    seen[start] = 1;
    while (q.length) {
      const c = q.pop(), x = c % W, y = (c / W) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (!inb(nx, ny)) continue;
        const n = idx(nx, ny);
        if (!seen[n] && tiles[n] === T.ROAD) { seen[n] = 1; q.push(n); }
      }
    }
    for (let i = 0; i < W * H; i++) if (tiles[i] === T.ROAD && !seen[i]) tiles[i] = T.GRASS;
  })();

  // ---------- 3. NAMA JALAN: utara-selatan = ikan, barat-timur = pohon pantai ----------
  const FISH = ['Kakap', 'Tongkol', 'Kerapu', 'Bandeng', 'Tenggiri', 'Baronang', 'Cakalang', 'Layang', 'Belanak', 'Kembung', 'Teri', 'Lemuru', 'Selar'];
  const TREE = ['Kelapa', 'Pandan', 'Ketapang', 'Bakau', 'Cemara', 'Waru', 'Nipah', 'Sukun', 'Kenari', 'Lontar', 'Asam', 'Mangga', 'Jambu'];
  AL.streetCol = x => 'Jl. ' + FISH[Math.floor((x - RO) / RE) % FISH.length];
  AL.streetRow = y => 'Jl. ' + TREE[Math.floor((y - RO) / RE) % TREE.length];

  // ---------- 4. KAVLING: tiap blok 4×4 berisi 2×2 kavling 2×2 ----------
  const lots = [];
  AL.lots = lots;
  const isT = (x, y, t) => inb(x, y) && tiles[idx(x, y)] === t;
  for (let by = RO + 1; by + 3 < H; by += RE) for (let bx = RO + 1; bx + 3 < W; bx += RE) {
    for (const [ox, oy] of [[0, 0], [2, 0], [0, 2], [2, 2]]) {
      const lx = bx + ox, ly = by + oy;
      if (!(isT(lx, ly, T.GRASS) && isT(lx + 1, ly, T.GRASS) && isT(lx, ly + 1, T.GRASS) && isT(lx + 1, ly + 1, T.GRASS))) continue;
      // pintu: utamakan jalan di depan (+y), lalu kanan, kiri, belakang
      const cand = [[lx, ly + 2], [lx + 1, ly + 2], [lx + 2, ly], [lx + 2, ly + 1], [lx - 1, ly], [lx - 1, ly + 1], [lx, ly - 1], [lx + 1, ly - 1]];
      const door = cand.find(([x, y]) => isT(x, y, T.ROAD));
      if (!door) continue;
      const district = AL.district(lx + 1, ly + 1), c0 = CENTER[district];
      const r = Math.hypot(lx + 1 - c0.x, ly + 1 - c0.y);
      const left = (lx - 1) % RE === RO;
      const lot = {
        id: 'lot' + lots.length, i: lots.length, x: lx, y: ly, r, district,
        zone: r < 8 ? 0 : r < 16 ? 1 : 2,
        seed: AL.hash32('lot:' + lx + ':' + ly),
        door, type: '', name: '',
        street: AL.streetCol(left ? lx - 1 : lx + 2),
        num: (ly - RO) + (left ? 1 : 2),
        residents: [], workers: [], hTop: 1.2,
      };
      lots.push(lot);
      for (const [tx, ty] of [[lx, ly], [lx + 1, ly], [lx, ly + 1], [lx + 1, ly + 1]]) {
        tiles[idx(tx, ty)] = T.LOT;
        lotAt[idx(tx, ty)] = lot.i;
      }
    }
  }

  // ---------- 5. JENIS BANGUNAN & LANDMARK ----------
  function rollType(district, zone, u) {
    if (district === 'kampung') {
      if (zone === 0) return u < 0.55 ? 'gubuk' : u < 0.8 ? 'warung' : u < 0.9 ? 'kebun' : 'field';
      return u < 0.58 ? 'gubuk' : u < 0.68 ? 'warung' : u < 0.84 ? 'field' : 'kebun';
    }
    if (zone === 0) return u < 0.5 ? 'office' : u < 0.62 ? 'mall' : u < 0.85 ? 'shop' : 'park';
    if (zone === 1) return u < 0.42 ? 'villa' : u < 0.57 ? 'rusun' : u < 0.67 ? 'office' : u < 0.87 ? 'shop' : 'park';
    return u < 0.72 ? 'villa' : u < 0.86 ? 'park' : 'shop';
  }
  lots.forEach(l => { l.type = rollType(l.district, l.zone, AL.ihash(l.x, l.y, SEED + 7)); });

  const used = new Set();
  function assign(lot, type, name) { if (!lot) return; lot.type = type; lot.name = name; used.add(lot.i); }
  const kotaR = lots.filter(l => l.district === 'kota').sort((a, b) => a.r - b.r);
  const kampR = lots.filter(l => l.district === 'kampung').sort((a, b) => a.r - b.r);
  assign(kotaR[0], 'balai', 'Balai Kota AUDIRA');
  assign(kotaR[2], 'menara', 'Menara AUDIRA');
  assign(kampR[0], 'pasar', 'Pasar Rakyat Nyiur');
  // landmark kedua di tiap kawasan: cincin tengah, tidak berdempetan
  const ring = list => list.filter(l => l.r >= 8 && l.r < 16 && !used.has(l.i))
    .sort((a, b) => AL.ihash(a.x, a.y, SEED + 21) - AL.ihash(b.x, b.y, SEED + 21));
  assign(ring(kotaR)[0], 'sekolah', 'Sekolah Karang');
  assign(ring(kampR)[0], 'puskesmas', 'Puskesmas Bahari');
  // pusat pemerintahan: kantor-kantor di dekat pusat tiap kawasan (sudah berdiri sejak awal)
  const near = list => list.find(l => !used.has(l.i));
  assign(near(kotaR), 'dprd', 'Gedung DPRD AUDIRA');
  assign(near(kotaR), 'camat', 'Kantor Camat Cakrawala');
  assign(near(kotaR), 'polsek', 'Polsek Cakrawala');
  assign(near(kotaR), 'kantorpos', 'Kantor Pos Cakrawala');
  assign(near(kotaR), 'damkar', 'Pos Damkar Cakrawala');
  assign(near(kampR), 'lurah', 'Kantor Lurah Nyiur');
  assign(near(kampR), 'camat', 'Kantor Camat Nyiur');
  assign(near(kampR), 'polsek', 'Pos Polisi Nyiur');
  AL.GOV = ['balai', 'menara', 'dprd', 'camat', 'lurah', 'polsek', 'kantorpos', 'damkar'];

  const LABEL = {
    house: 'Rumah', rusun: 'Apartemen', office: 'Menara kantor', shop: 'Butik', park: 'Taman', field: 'Sawah',
    balai: 'Balai Kota', menara: 'Menara', pasar: 'Pasar', sekolah: 'Sekolah', puskesmas: 'Puskesmas',
    villa: 'Villa', mall: 'Mal', gubuk: 'Rumah bambu', warung: 'Warung', kebun: 'Kebun kelapa',
    dprd: 'Gedung DPRD', camat: 'Kantor Camat', lurah: 'Kantor Lurah', polsek: 'Kantor Polisi', kantorpos: 'Kantor Pos', damkar: 'Pemadam Kebakaran',
  };
  AL.LABEL = LABEL;
  const SHOPS = ['Butik Cakrawala', 'Kopi Kaca', 'Galeri Seni Pulau', 'Toko Gawai', 'Patiseri Senja', 'Klinik Gigi', 'Studio Yoga', 'Apotek Karang', 'Salon Ombak', 'Toko Selancar'];
  const WARUNG = ['Warung Bu Tini', 'Warung Kopi Nyiur', 'Bakso Pak Kumis', 'Es Kelapa Muda', 'Warung Ikan Bakar', 'Kios Pulsa Mas Didi', 'Tambal Ban Pak Udin', 'Warung Nasi Uduk', 'Kedai Jamu Mbok Sri', 'Warung Gorengan'];
  const OFFICES = ['Bank Pulau', 'Wisma Samudra', 'Menara Studio Kreatif', 'Gedung Nelayan Sejahtera', 'Kantor Pajak', 'Graha Listrik', 'Pusat Data Pulau', 'Koperasi Laut'];
  const MALLS = ['Mal Cakrawala', 'Plaza Samudra', 'Galeria Teluk'];
  lots.forEach(l => {
    if (l.name) return;
    const r = AL.rng(l.seed + 5);
    if (l.type === 'shop') l.name = AL.pick(SHOPS, r());
    else if (l.type === 'warung') l.name = AL.pick(WARUNG, r());
    else if (l.type === 'office') l.name = AL.pick(OFFICES, r());
    else if (l.type === 'mall') l.name = AL.pick(MALLS, r());
    else if (l.type === 'rusun') l.name = 'Apartemen ' + AL.pick(TREE, r());
    else if (l.type === 'villa') l.name = 'Villa ' + AL.pick(TREE, r());
    else if (l.type === 'park') l.name = 'Taman ' + AL.pick(TREE, r());
    else if (l.type === 'kebun') l.name = 'Kebun Kelapa ' + AL.pick(FISH, r());
    else if (l.type === 'field') l.name = 'Sawah ' + AL.pick(FISH, r());
    else if (l.type === 'gubuk') l.name = 'Rumah Bambu';
    else l.name = 'Rumah Warga';
  });

  // ---------- 6. PELABUHAN: dermaga dari ujung selatan jalan utara-selatan dekat pusat ----------
  let dock = null;
  for (let x = RO; x < W; x += RE) {
    if (x < riverX(H - 1) + 4 || x > riverX(H - 1) + 22) continue; // pelabuhan feri di tepi selatan Kota Cakrawala
    let ymax = -1;
    for (let y = 0; y < H; y++) if (tiles[idx(x, y)] === T.ROAD) ymax = y;
    if (ymax < 0) continue;
    if (!dock || ymax > dock.y0 - 1) dock = { x, y0: ymax + 1 };
  }
  if (dock) {
    let water = 0, y = dock.y0;
    while (inb(dock.x, y) && water < 4) {
      const t = tiles[idx(dock.x, y)];
      if (t === T.DEEP || t === T.SHALLOW) water++;
      tiles[idx(dock.x, y)] = T.DOCK;
      y++;
    }
    dock.yEnd = y - 1;
  }
  AL.dock = dock;

  // ---------- 7. MERCUSUAR & POHON ----------
  const statics = []; // objek non-kavling (pohon, mercusuar)
  AL.statics = statics;
  let light = null, bestL = -1e9;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (tiles[idx(x, y)] !== T.SAND) continue;
    const nearWater = [[1, 0], [0, -1], [1, -1]].some(([a, b]) => tiles[idx(x + a, y + b)] <= T.SHALLOW);
    if (nearWater && x - y > bestL) { bestL = x - y; light = { x, y }; }
  }
  if (light) statics.push({ id: 'mercusuar', kind: 'mercusuar', x: light.x, y: light.y, name: 'Mercusuar Tanjung' });
  AL.lighthouse = light;

  // kampung: perahu jukung di pantai, pos ronda di sudut persimpangan
  const taken = new Set();
  const rondas = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (AL.district(x, y) !== 'kampung') continue;
    const t = tiles[idx(x, y)], h = AL.ihash(x, y, SEED + 41);
    const wet = (a, b) => tiles[idx(a, b)] <= T.SHALLOW;
    if (t === T.SAND && h < 0.2 && (wet(x + 1, y) || wet(x - 1, y) || wet(x, y + 1) || wet(x, y - 1))) {
      statics.push({ id: `jukung:${x},${y}`, kind: 'jukung', x, y, ax: wet(x + 1, y) || wet(x - 1, y) ? 'y' : 'x' });
      taken.add(x + ',' + y);
    } else if (t === T.GRASS && (tiles[idx(x + 1, y)] === T.ROAD || tiles[idx(x, y + 1)] === T.ROAD) && h < 0.5
      && rondas.every(r => Math.abs(r.x - x) + Math.abs(r.y - y) > 9)) {
      const o = { id: 'ronda', kind: 'ronda', x, y };
      rondas.push(o); statics.push(o); taken.add(x + ',' + y);
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = tiles[idx(x, y)];
    if (light && x === light.x && y === light.y) continue;
    if (taken.has(x + ',' + y)) continue;
    if (dock && Math.abs(x - dock.x) <= 1 && y >= dock.y0 - 1) continue;
    const h = AL.ihash(x, y, SEED + 13);
    if (t === T.GRASS) {
      const f = AL.noise(x / 6, y / 6, SEED + 9);
      // kampung: banyak pohon kelapa (nyiur)
      if (AL.district(x, y) === 'kampung' && h < 0.13) statics.push({ id: 'palm' + (Math.floor(h * 997) % 2), kind: 'palm', x, y });
      else if (f > 0.64 || h < 0.06) statics.push({ id: 'tree' + (Math.floor(h * 997) % 3), kind: 'tree', x, y });
    } else if (t === T.SAND && h < 0.09) {
      statics.push({ id: 'palm' + (Math.floor(h * 997) % 2), kind: 'palm', x, y });
    }
  }

  // ---------- 8. TEMPAT TINGGAL & TEMPAT KERJA ----------
  const CAP = { house: 5, rusun: 34, villa: 3, gubuk: 5 };
  const JOBS = { office: 30, menara: 60, shop: 5, pasar: 24, sekolah: 16, puskesmas: 12, balai: 20, field: 3, park: 1, mall: 50, warung: 3, kebun: 2,
    dprd: 20, camat: 14, lurah: 10, polsek: 12, kantorpos: 8, damkar: 10 };
  const places = [];
  AL.places = places;
  lots.forEach(l => { if (JOBS[l.type]) { l.place = places.length; places.push({ kind: l.type, lot: l.i, name: l.name, jobs: JOBS[l.type] }); } });
  if (dock) places.push({ kind: 'pelabuhan', lot: -1, name: 'Pelabuhan AUDIRA', jobs: 18, x: dock.x, y: dock.y0 });

  function shuffled(arr, seed) {
    const r = AL.rng(seed);
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  // Kota tumbuh dari pusat tiap kawasan: kavling rumah terdekat ke pusat terisi duluan (sedikit acak),
  // satu kavling penuh dulu baru pindah ke kavling berikutnya.
  const jitter = (l, s) => AL.ihash(l.x, l.y, SEED + s) * 6;
  // Kampung & kota bergantian sebanding kapasitasnya, supaya keduanya tumbuh bersamaan.
  const perD = { kampung: [], kota: [] };
  lots.filter(l => CAP[l.type]).sort((a, b) => (a.r + jitter(a, 3)) - (b.r + jitter(b, 3)))
    .forEach(l => { for (let k = 0; k < CAP[l.type]; k++) perD[l.district].push(l.i); });
  const homeSlots = [], used2 = { kampung: 0, kota: 0 };
  while (homeSlots.length < perD.kampung.length + perD.kota.length) {
    const fk = perD.kampung.length ? used2.kampung / perD.kampung.length : 2;
    const fc = perD.kota.length ? used2.kota / perD.kota.length : 2;
    const D = fk <= fc ? 'kampung' : 'kota';
    homeSlots.push(perD[D][used2[D]++]);
  }

  // Pekerjaan sesuai kawasan rumah: warga kampung bekerja di kampung (sawah, kebun, warung, pasar, puskesmas),
  // warga kota di kota (kantor, mal, butik, sekolah, balai, menara, pelabuhan).
  // Tempat kerja dekat pusat diisi duluan, maks 4 orang per tempat di putaran pertama supaya kota tidak berdempet.
  const placeDistrict = p => (p.lot >= 0 ? lots[p.lot].district : AL.district(p.x, p.y));
  const placeR = p => (p.lot >= 0 ? lots[p.lot].r + jitter(lots[p.lot], 4) : 0);
  const jobLists = { kampung: [], kota: [] };
  for (const D of Object.keys(jobLists)) {
    const ps = places.map((p, pi) => ({ p, pi })).filter(o => placeDistrict(o.p) === D).sort((a, b) => placeR(a.p) - placeR(b.p));
    ps.forEach(o => { for (let k = 0; k < Math.min(4, o.p.jobs); k++) jobLists[D].push(o.pi); });
    ps.forEach(o => { for (let k = 4; k < o.p.jobs; k++) jobLists[D].push(o.pi); });
  }
  const jobAll = shuffled(jobLists.kampung.concat(jobLists.kota), SEED + 4); // cadangan: warga tanpa rumah
  const rankInDistrict = [], count = { kampung: 0, kota: 0 };
  homeSlots.forEach(li => { rankInDistrict.push(count[lots[li].district]++); });
  function jobFor(k) {
    if (k < homeSlots.length) {
      const L = jobLists[lots[homeSlots[k]].district];
      if (L.length) return L[rankInDistrict[k] % L.length];
    }
    return jobAll[k % jobAll.length];
  }

  // Semua kavling mulai sebagai tanah kosong berpapan peruntukan. Bangunan berdiri saat warga pertama
  // tinggal atau bekerja di sana. Balai Kota & Menara AUDIRA sudah berdiri sejak awal.
  lots.forEach(l => { l.fixed = AL.GOV.includes(l.type); l.built = l.fixed; });
  AL.isBuilt = l => !!(l.built || l.sponsor);

  // ---------- 9. WARGA ----------
  // Rumah & kerja ditentukan oleh nomor urut (seq) dari server: seq ke-n selalu dapat slot rumah ke-n.
  // Jadi semua perangkat melihat warga di rumah yang sama tanpa menyimpan alamat di server.
  const residents = [];
  AL.residents = residents;
  AL.byName = new Map();
  AL.bySeq = new Map();
  AL.addResident = function (u, joined, seq) {
    const known = AL.bySeq.get(seq);
    if (known) return known;
    const i = residents.length, k = seq - 1;
    const seed = AL.hash32(u);
    const res = {
      i, u, seq, joined, seed,
      home: k < homeSlots.length ? homeSlots[k] : -1,
      job: jobFor(k),
      look: AL.mkLook(seed),
      skill: 0.92 + AL.rng(seed + 1)() * 0.16,
    };
    res.isNew = true;
    residents.push(res);
    AL.byName.set(u.toLowerCase(), res);
    AL.bySeq.set(seq, res);
    if (res.home >= 0) { const l = lots[res.home]; l.residents.push(i); l.built = true; }
    const pl = places[res.job];
    if (pl && pl.lot >= 0) { const l = lots[pl.lot]; l.workers.push(i); l.built = true; }
    return res;
  };
  AL.homeCapacity = homeSlots.length;
  // dipakai server (js/world.js dijalankan di Node) untuk menghitung gaji tanpa data per warga
  AL.jobForSeq = seq => jobFor(seq - 1);
  AL.homeForSeq = seq => (seq - 1 < homeSlots.length ? homeSlots[seq - 1] : -1);
  AL.skillFor = seed => 0.92 + AL.rng(seed + 1)() * 0.16;

  // ---------- 9b. MODE DEMO (tanpa server): nama contoh dibuat di perangkat ----------
  const SA = ['ra', 'di', 'an', 'sa', 'tri', 'bu', 'na', 'ri', 'ka', 'lu', 'ma', 'ya', 'fe', 'gi', 'ze', 'ar', 'in', 'do', 'wi', 'ta', 'ne', 'yu', 'fa', 'al', 'de', 'li'];
  const SB = ['ka', 'ni', 'yo', 'ra', 'sti', 'la', 'ma', 'tu', 'ri', 'nda', 'sa', 'fi', 'na', 'ta', 'dy', 'yu', 'ko', 'rin'];
  const SUF = ['', '', '', '_', '.', '_id', '.official', 'xx', 'zz', '.jkt', '.sby', '_art', '.dev', '_99', '.mlg', '.bdg'];
  AL.demoName = function (i) {
    const r = AL.rng(AL.hash32('warga#' + i));
    let s = AL.pick(SA, r()) + AL.pick(SB, r()) + (r() < 0.5 ? AL.pick(SB, r()) : '');
    if (r() < 0.3) s += (r() < 0.5 ? '_' : '.') + AL.pick(SA, r()) + AL.pick(SB, r());
    s += AL.pick(SUF, r());
    if (r() < 0.35) s += Math.floor(r() * 99);
    while (AL.byName.has(s)) s += (i % 10);
    return s;
  };
  AL.initDemo = function () {
    const EPOCH = Date.UTC(2026, 8, 1), END = Date.now() - 3600e3;
    const N = Math.floor(homeSlots.length * 0.72);
    for (let i = 0; i < N; i++) AL.addResident(AL.demoName(i), EPOCH + (END - EPOCH) * Math.pow((i + 1) / N, 0.6), i + 1).isNew = false;
  };

  // ---------- 10. JABATAN & GAJI ----------
  const TITLES = {
    office: ['Staf Magang', 'Staf', 'Staf Senior', 'Kepala Tim', 'Manajer', 'Direktur'],
    menara: ['Admin', 'Analis', 'Analis Senior', 'Lead', 'VP', 'Komisaris'],
    shop: ['Kasir Magang', 'Kasir', 'Pramuniaga', 'Kepala Toko', 'Pemilik Toko', 'Juragan'],
    pasar: ['Kuli Angkut', 'Pedagang', 'Pedagang Tetap', 'Ketua Blok', 'Mandor Pasar', 'Kepala Pasar'],
    sekolah: ['Guru Bantu', 'Guru', 'Guru Senior', 'Wakasek', 'Kepala Sekolah', 'Pengawas'],
    puskesmas: ['Relawan', 'Perawat', 'Bidan', 'Dokter', 'Dokter Senior', 'Kepala Puskesmas'],
    balai: ['Juru Ketik', 'Staf Kota', 'Sekretaris', 'Kabag', 'Asisten Wali Kota', 'Wakil Wali Kota'],
    field: ['Buruh Tani', 'Petani', 'Petani Mapan', 'Ketua Kelompok Tani', 'Juragan Sawah', 'Raja Panen'],
    park: ['Tukang Kebun', 'Penjaga Taman', 'Perawat Taman', 'Kepala Taman', 'Arsitek Lanskap', 'Kurator Taman'],
    pelabuhan: ['Kuli Pelabuhan', 'Petugas Tiket', 'Syahbandar Muda', 'Nakhoda', 'Kapten Senior', 'Syahbandar'],
    mall: ['Pramuniaga Mal', 'Kasir Mal', 'Supervisor Lantai', 'Manajer Toko', 'Manajer Mal', 'Pemilik Mal'],
    warung: ['Pelayan Warung', 'Juru Masak', 'Pengelola Warung', 'Pemilik Warung', 'Juragan Warung', 'Raja Kuliner'],
    kebun: ['Pemetik Kelapa', 'Petani Kelapa', 'Mandor Kebun', 'Pemilik Kebun', 'Juragan Kopra', 'Raja Kopra'],
    dprd: ['Staf Sekretariat', 'Staf Ahli', 'Kepala Bagian', 'Sekretaris Dewan', 'Wakil Ketua DPRD', 'Ketua DPRD'],
    camat: ['Staf Kecamatan', 'Kasi Pelayanan', 'Kasi Pemerintahan', 'Sekretaris Camat', 'Wakil Camat', 'Camat'],
    lurah: ['Staf Kelurahan', 'Kaur Umum', 'Kasi Kesra', 'Sekretaris Lurah', 'Wakil Lurah', 'Lurah'],
    polsek: ['Bhayangkara', 'Brigadir', 'Bripka', 'Aiptu', 'Ipda', 'Kapolsek'],
    kantorpos: ['Petugas Loket', 'Pengantar Pos', 'Kepala Loket', 'Supervisor Pos', 'Wakil Kepala Kantor', 'Kepala Kantor Pos'],
    damkar: ['Petugas Damkar', 'Regu Pemadam', 'Kepala Regu', 'Komandan Peleton', 'Wakil Kepala Damkar', 'Kepala Damkar'],
  };
  const PAY = { office: 120, menara: 160, shop: 70, pasar: 60, sekolah: 90, puskesmas: 110, balai: 100, field: 55, park: 50, pelabuhan: 75, mall: 130, warung: 45, kebun: 50,
    dprd: 150, camat: 120, lurah: 95, polsek: 115, kantorpos: 85, damkar: 100 };
  AL.career = function (res, now) {
    const days = Math.max(0, (now - res.joined) / 86400000);
    const lvl = Math.min(30, 1 + Math.floor(Math.sqrt(days * 1.6)));
    const pl = places[res.job];
    const rank = Math.min(5, Math.floor((lvl - 1) / 5)); // naik jabatan tiap 5 level
    const pay = PAY[pl.kind] * (1 + (lvl - 1) * 0.06) * res.skill; // koin per hari
    const saldo = pay * days;
    return { days, lvl, title: TITLES[pl.kind][rank], place: pl, pay, saldo };
  };
})(window.AL);
