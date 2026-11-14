/* global THREE */
/**
 * AUDIRA-LAND: Laut selatan + pantai pasir + dermaga pancing, dan kolam pancing (tambak) di samping kebun buah.
 * Dimuat lazy dari main.js (chunk terpisah, tidak menambah bundel awal 160 KB).
 *
 *  - Laut: bidang air y = SEA_Y dari garis air z -444 ke cakrawala selatan (di bawah tanah taman hiburan/gunung
 *    yang menimpanya, jadi tidak tampak di sana). Pantai pasir datar z -296..-444 lalu landai ke air.
 *  - Dermaga kayu menjorok ke laut di x = PIER_X, pemancing di kedua sisinya + perahu jukung di pasir.
 *  - Tambak pancing: rect POND (di dalam rect kebun rural_scenery.js, petak di sini tidak ditanami pohon),
 *    pematang tanah setinggi undakan tertinggi + 0,25 m, air di dalamnya, saung + pemancing di pematang.
 *  - Pantai dibelah sungai (X -16..16): resor Desa Have di barat (kit Polyfork "Coast and Boardwalk":
 *    promenade, kios, pondok, grid payung, dermaga boardwalk, pagar privat) dan kampung nelayan Desa Have-Not
 *    di timur (gubuk, perahu, para-para ikan asin, jaring). Model Polyfork CC BY 4.0, kredit di
 *    docs/CREDITS_POLYFORK.md; dimuat lazy di sini (preloadPolyfork), lalu ikut dilebur bakeStatic.
 * Semua bagian padat dilebur bakeStatic; air laut, air tambak, pemancing = 3 draw call tambahan.
 * Zero-Submerging: semua alas di atas permukaan pendukungnya (+0,02); tiang dermaga berdiri di dasar laut.
 */
// Dependensi dioper dari main.js (deps) agar modul bersama tidak dipecah esbuild ke chunk statis baru
let bakeStatic, makeWaterMaterial, Anglers, preloadPolyfork, pfGeo, pfMaterial;

const SEA_Y = -0.25;
// Pasir mulai di tepi kota (z -296) melewati lahan taman bermain Have-Not (sampai z -420) ke garis air z -444.
// Permukaan pasir y -0.02: di bawah lantai taman bermain/kota sehingga lantai itu tetap di atas pasir.
const SAND_Y = -0.02;
const SAND = { x0: -285, x1: 365, z0: -296, zFlat: -444, zEnd: -468 };
const PIER_X = 120, PIER_Z0 = -438, PIER_Z1 = -506, DECK_Y = 0.75;
const GROUND = SAND_Y + 0.02;                 // alas model di pasir (micro-lift)
// Resor Have (barat sungai): promenade di selatan slab stadion (berakhir z -330), dermaga boardwalk di pierX
const RESORT = { x0: -284, x1: -22, promZ: -340, pierX: -150, pierZ1: -480, deckTop: DECK_Y };
const CB_DECK_H = 1.96;                       // tinggi boardwalk-deck-run (alas tiang -> lantai)
// Kit Polyfork Coast and Boardwalk yang dipakai pantai selatan (tanpa karakter)
const CB = {
    palm: 'palm-tree-a307da', deck: 'boardwalk-deck-run-c1f678', railing: 'boardwalk-railing-run-4851f1',
    shack: 'fisherman-shack-ea9b2b', boathouse: 'boathouse-cf20e6',
    fishBoat: 'small-fishing-boat-4ac0e3', rowboat: 'rowboat-c42d85', netRack: 'drying-net-rack-93ec3b',
    outrigger: 'vaka-ama-outrigger-canoe-2fc79a',
    paving: 'promenade-paving-tile-5656ce', lamp: 'seafront-lamp-post-28bada', bench: 'back-to-back-promenade-8c153b',
    sign: 'seafront-wayfinding-post-67fc84', shower: 'beach-shower-post-719ac6',
    arcade: 'amusement-arcade-front-e1caee', cafe: 'beach-cafe-kiosk-9e8f6d', iceCream: 'ice-cream-kiosk-on-40a568',
    toilet: 'seafront-toilet-block-c3f643', bandstand: 'promenade-bandstand-1a71b5', hut: 'beach-hut-fc7649',
    cubicle: 'changing-cubicle-row-5bac7f', tower: 'lifeguard-tower-183c37', shed: 'boat-shed-74c94f',
    parasol: 'beach-parasol-fd4530', lounger: 'sun-lounger-2b2603', deckChair: 'striped-deck-chair-70b506',
    towel: 'beach-towel-adb6c0', windbreak: 'beach-windbreak-090d8c', castle: 'sandcastle-ddc562',
    bucket: 'beach-bucket-dc52dd', ball: 'beach-ball-4b2a9b', flag: 'beach-flag-pole-2bf334',
    buoy: 'lifebuoy-on-a-post-57421b', board: 'rescue-and-paddle-board-79a2a0', dinghy: 'rowing-dinghy-022673',
    kayak: 'sea-kayak-97b592', pots: 'lobster-pot-stack-d870f0', net: 'net-pile-0bd489', bollard: 'mooring-bollard-2d4bc9',
    drift: 'driftwood-log-89a68f', seaweed: 'seaweed-drift-line-6566c3', shells: 'shell-scatter-6d36b7',
    rockPool: 'rock-pool-937f01', shingle: 'shingle-tile-fa005e', tidePost: 'tide-post-11a866',
    duneTile: 'marram-dune-tile-56cdf8', tuft: 'marram-grass-tuft-8c7a99', holly: 'sea-holly-clump-ce3bc6',
    tamarisk: 'tamarisk-bush-ba4337', fence: 'dune-fence-run-120153', walkover: 'dune-walkover-afa2c0'
};
const POND = { x0: 326, x1: 350, z0: 136, z1: 170 };
const C = { pasir: 0xE6D3A3, pasirHave: 0xF3E6C4, pasirHaveNot: 0xCDB98C, bambu: 0xB89A5E, ikan: 0xB8C2C8, pagar: 0xF4F1EA, pasirBasah: 0xC9B386, kayu: 0x8A6440, kayuTua: 0x5E4129, tanah: 0x7A6446,
    rumput: 0x6A9A45, atap: 0x6B4F2E, perahu: [0xC0392B, 0x2E86C1, 0x27AE60, 0xF1C40F] };

export class Fishing {
    constructor(scene, scenery, deps) {
        ({ bakeStatic, makeWaterMaterial, Anglers, preloadPolyfork, pfGeo, pfMaterial } = deps);
        this.group = new THREE.Group();
        this.group.name = 'fishing';
        this.box = new THREE.BoxGeometry(1, 1, 1);
        this.cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
        this.mats = new Map();
        const spots = [];

        // Laut (air beriak animasi bersama makeWaterMaterial): tidak bergantung model, langsung tampil
        const sea = new THREE.Mesh(new THREE.PlaneGeometry(2800, 1200).rotateX(-Math.PI / 2),
            makeWaterMaterial({ color: 0x2C7DA6, repeatU: 60, repeatV: 26, flow: 0.02, drift: 0.01 }));
        sea.position.set(40, SEA_Y, SAND.zFlat - 600);
        sea.receiveShadow = true;
        sea.name = 'sea_water';
        scene.add(sea);

        // Model kit dimuat dulu agar ikut satu leburan; gagal/terlambat -> pantai prosedural saja
        const load = preloadPolyfork ? preloadPolyfork(Object.values(CB), 8000).catch(() => 0) : Promise.resolve(0);
        this.ready = load.then(() => {
            this.buildBeach();
            this.buildPier(spots);
            this.buildBoats();
            this.buildPond(scenery, spots);
            this.buildCoastKit();

            this.group.add(bakeStatic(this.group, { chunkSize: 0 }));
            scene.add(this.group);
            scene.add(this.pondWater);
            this.anglers = new Anglers(scene, spots);
        });
    }

    mat(hex) {
        if (!this.mats.has(hex)) this.mats.set(hex, new THREE.MeshLambertMaterial({ color: hex }));
        return this.mats.get(hex);
    }

    /** Kotak dengan dasar di y0 (bukan pusat). */
    block(hex, sx, sy, sz, x, y0, z, ry = 0, geo = this.box) {
        const m = new THREE.Mesh(geo, this.mat(hex));
        m.scale.set(sx, sy, sz);
        m.position.set(x, y0 + sy / 2, z);
        m.rotation.y = ry;
        m.castShadow = sy > 0.3;
        m.receiveShadow = true;
        this.group.add(m);
        return m;
    }

    /** Model kit Polyfork (dasar y=0, depan +Z) dengan alas di y. null bila model tidak termuat. */
    place(id, x, z, { ry = 0, y = GROUND, s = 1, cast = true } = {}) {
        const g = pfGeo && pfGeo(id);
        if (!g) return null;
        const m = new THREE.Mesh(g, pfMaterial());
        m.position.set(x, y, z);
        m.rotation.y = ry;
        m.scale.setScalar(s);
        m.castShadow = cast;
        m.receiveShadow = true;
        this.group.add(m);
        return m;
    }

    /**
     * Pantai selatan dibelah sungai (X -16..16):
     *  - BARAT (X -284..-22): resor Desa Have dari kit Coast and Boardwalk. Promenade 12 m z -334..-346 (selatan slab
     *    stadion, berakhir z -330), deret kios + pondok, grid payung, dermaga boardwalk di RESORT.pierX,
     *    pagar putih "pantai privat" di tepi barat sungai.
     *  - TIMUR (X 22..362): kampung nelayan Desa Have-Not. Gubuk dua baris tak rata di selatan taman bermain
     *    (X 14..94, Z -365..-296), perahu ditarik ke pasir, para-para ikan asin, jaring, bubu.
     * Laut di -Z, jadi model menghadap laut pakai ry = PI; menghadap promenade (utara) pakai ry = 0.
     */
    buildCoastKit() {
        let seed = 7;
        const rnd = () => ((seed = Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5 | 0) >>> 0) / 4294967296;
        const S = Math.PI;
        const LOW = { cast: false };   // props < ~1,3 m: tanpa bayangan (pass bayangan HP tetap ringan)
        this.buildResort(rnd, S, LOW);
        this.buildFishingVillage(rnd, S, LOW);
    }

    buildResort(rnd, S, LOW) {
        const R = RESORT, onProm = GROUND + 0.05 * 3 + 0.02;   // paving 0,05 m x skala 3
        // Promenade paving 8 m + lampu & palem berselang + jalur paving ke dermaga
        for (let x = R.x0 + 6; x < R.x1 - 2; x += 12) this.place(CB.paving, x, R.promZ, { s: 3, cast: false });
        for (let x = R.x0 + 6, k = 0; x < R.x1 - 2; x += 32, k++) {
            this.place(CB.lamp, x, R.promZ - 3.4, { y: onProm });
            if (x + 16 < R.x1 - 2) this.place(CB.palm, x + 16, R.promZ + 6.5, { s: 1.15 });
            if (k % 2 === 1) this.place(CB.bench, x, R.promZ + 3.2, { y: onProm, cast: false });
        }
        const pathZ0 = R.promZ - 6, pathZ1 = SAND.zFlat;
        this.block(C.kayu, 3, 0.08, pathZ0 - pathZ1, R.pierX, GROUND, (pathZ0 + pathZ1) / 2).castShadow = false;
        this.place(CB.sign, R.pierX + 2.6, R.promZ - 7.5, { ry: S });
        this.place(CB.shower, R.pierX - 3, R.promZ - 9);

        // Deret kios menghadap promenade, lalu pondok pantai rapi
        this.place(CB.toilet, -268, -351);
        this.place(CB.cubicle, -256, -350);
        this.place(CB.cafe, -240, -351);
        this.place(CB.iceCream, -228, -350, { ry: Math.PI / 2 });
        this.place(CB.arcade, -214, -351);
        this.place(CB.bandstand, -196, -355);
        for (let x = -172; x <= -40; x += 12) if (Math.abs(x - R.pierX) > 5) this.place(CB.hut, x, -352);

        // Grid payung + 2 kursi jemur, rapi berbaris (resor), menghadap laut
        for (let x = -262, k = 0; x <= -40; x += 30, k++) {
            if (Math.abs(x - R.pierX) < 8) continue;
            for (const [j, z] of [[0, -386], [1, -404]]) {
                this.place(CB.parasol, x, z);
                this.place(CB.lounger, x + ((k + j) % 2 ? 1.3 : -1.3), z - 0.4, { ry: S, cast: false });
            }
        }
        for (const [x, z, r] of [[-210, -420, 0.3], [-204, -421, -0.2], [-62, -420, 0.4]]) this.place(CB.deckChair, x, z, { ry: S + r, cast: false });
        for (const [x, z, r] of [[-250, -421, 0.2], [-120, -422, -0.3]]) this.place(CB.towel, x, z, { ry: r, cast: false });
        this.place(CB.windbreak, -246, -425, { ry: S });
        this.place(CB.castle, -118, -428, LOW);
        this.place(CB.bucket, -116.6, -428.3, LOW);
        this.place(CB.ball, -122, -426, LOW);

        // Keselamatan + olahraga air
        this.place(CB.tower, -100, -424, { ry: S });
        this.place(CB.board, -95.8, -422, { ry: 0.1, cast: false });
        this.place(CB.board, -94.6, -422.4, { ry: -0.1, cast: false });
        this.place(CB.kayak, -84, -434, { ry: S - 0.2 });
        this.place(CB.flag, -106, -421);
        this.place(CB.flag, -236, -440);
        for (const x of [-200, -40]) this.place(CB.buoy, x, -440, { ry: S });

        // Dermaga boardwalk: deck run 4 m bertiang; alas di dasar laut sehingga lantai ±R.deckTop
        const deckY = R.deckTop - CB_DECK_H;
        for (let z = SAND.zFlat - 4; z >= R.pierZ1; z -= 4) this.place(CB.deck, R.pierX, z, { y: deckY });
        for (const dx of [-4, 4]) this.place(CB.deck, R.pierX + dx, R.pierZ1, { y: deckY });
        for (let z = SAND.zFlat - 4; z > R.pierZ1 + 2; z -= 4) {
            for (const dx of [-2.05, 2.05]) this.place(CB.railing, R.pierX + dx, z, { y: R.deckTop + 0.02, ry: Math.PI / 2, cast: false });
        }
        this.place(CB.buoy, R.pierX + 5.6, R.pierZ1 - 1.4, { y: R.deckTop + 0.02, ry: S });

        // Pagar putih "pantai privat" di tepi barat sungai
        const fx = R.x1 + 1, fz0 = R.promZ - 4, fz1 = SAND.zFlat + 4;
        for (let z = fz0; z >= fz1; z -= 2) this.block(C.pagar, 0.1, 1.1, 0.1, fx, GROUND, z).castShadow = false;
        for (const y of [0.35, 0.85]) this.block(C.pagar, 0.06, 0.1, fz0 - fz1, fx, GROUND + y, (fz0 + fz1) / 2).castShadow = false;
    }

    buildFishingVillage(rnd, S, LOW) {
        // Gubuk nelayan dua baris tak rata, menghadap laut (rotasi & posisi sedikit miring)
        const rowA = [[34, CB.shack], [70, CB.boathouse], [104, CB.shack], [150, CB.shack], [188, CB.boathouse],
            [232, CB.shed], [272, CB.boathouse], [318, CB.shack]];
        const rowB = [[52, CB.shack], [134, CB.boathouse], [210, CB.shack], [252, CB.shack], [298, CB.shack]];
        for (const [x, id] of rowA) this.place(id, x + rnd() * 4 - 2, -384 - rnd() * 5, { ry: S + (rnd() - 0.5) * 0.5 });
        for (const [x, id] of rowB) this.place(id, x + rnd() * 4 - 2, -404 - rnd() * 4, { ry: S + (rnd() - 0.5) * 0.6 });

        // Perahu ditarik ke pasir (jukung prosedural ada di buildBoats)
        for (const [x, r] of [[214, 0.2], [304, 0.3]]) this.place(CB.fishBoat, x, -432, { ry: S + r });
        for (const [x, r] of [[36, 0.4], [140, -0.3], [330, 0.2]]) this.place(CB.rowboat, x, -431, { ry: S + r, cast: false });
        this.place(CB.dinghy, 286, -434, { ry: S + 0.3 });
        this.place(CB.outrigger, 232, -437, { ry: Math.PI / 2 + 0.1 });

        // Jaring, bubu, rak jaring, bollard di ujung dermaga nelayan
        for (const [x, z] of [[46, -416], [118, -416], [224, -418], [312, -417]]) this.place(CB.netRack, x, z, { ry: rnd() * 0.6 - 0.3 });
        for (const [x, z, r] of [[88, -425, 0.4], [170, -424, -0.5], [266, -423, 0.2]]) this.place(CB.net, x, z, { ry: r, cast: false });
        for (const [x, z] of [[70, -425], [71, -424.2], [196, -421], [324, -422]]) this.place(CB.pots, x, z, { ry: rnd() * 6, cast: false });
        for (const x of [PIER_X - 4, PIER_X + 4]) this.place(CB.bollard, x, PIER_Z1 + 5, { y: DECK_Y + 0.02, cast: false });

        // Para-para jemur ikan asin (prosedural, dilebur bersama): rangka bambu + deret ikan perak
        for (const [x, z, ry] of [[60, -395], [96, -398], [168, -394], [244, -396], [284, -393], [330, -398]].map(p => [...p, rnd() * 0.4 - 0.2])) {
            const c = Math.cos(ry), s = Math.sin(ry), at = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
            for (const [dx, dz] of [[-1.4, -0.5], [1.4, -0.5], [-1.4, 0.5], [1.4, 0.5]]) {
                const [px, pz] = at(dx, dz);
                this.block(C.bambu, 0.08, 0.8, 0.08, px, GROUND, pz, ry);
            }
            this.block(C.bambu, 3, 0.05, 1.2, x, GROUND + 0.8, z, ry);
            for (let k = 0; k < 6; k++) {
                const [fx, fz] = at(-1.15 + k * 0.46, 0);
                this.block(C.ikan, 0.14, 0.04, 0.5, fx, GROUND + 0.85, fz, ry);
            }
        }

        // Garis pasang, semak, rumput liar
        for (const [x, r] of [[58, 0.4], [140, -1.1], [300, 2.2]]) this.place(CB.drift, x, -439, { ry: r, cast: false });
        for (const x of [40, 110, 176, 240, 320]) this.place(CB.seaweed, x + rnd() * 6, -442.5, { ry: rnd() * 0.4, cast: false });
        for (const x of [70, 200, 262]) this.place(CB.shells, x, -436 + rnd() * 4, { ry: rnd() * 6, cast: false });
        for (const [x, z] of [[108, -372], [262, -374], [348, -376]]) this.place(CB.tamarisk, x, z, { ry: rnd() * 6 });
        for (let k = 0; k < 4; k++) this.place(CB.tuft, 100 + rnd() * 260, -360 - rnd() * 60, { ry: rnd() * 6, s: 0.8 + rnd() * 0.6, cast: false });

        // Ujung timur: batu sirap + kolam batu
        for (const [x, z] of [[344, -438], [354, -439]]) this.place(CB.shingle, x, z, { ry: rnd() * 6, cast: false });
        this.place(CB.rockPool, 348, -437.5, { y: GROUND + 0.08 });
    }

    buildBeach() {
        const w = SAND.x1 - SAND.x0, cx = (SAND.x0 + SAND.x1) / 2;
        // Pasir kering datar (atas y SAND_Y): barat sungai resor Have (terang), timur kampung Have-Not (kusam)
        const d = SAND.z0 - SAND.zFlat, mz = (SAND.z0 + SAND.zFlat) / 2;
        this.block(C.pasirHave, -SAND.x0, 0.4, d, SAND.x0 / 2, SAND_Y - 0.4, mz);
        this.block(C.pasirHaveNot, SAND.x1, 0.4, d, SAND.x1 / 2, SAND_Y - 0.4, mz);
        // Pasir basah landai menurun ke bawah permukaan laut
        const len = SAND.zFlat - SAND.zEnd, drop = SAND_Y - (SEA_Y - 0.3);
        const slope = new THREE.Mesh(new THREE.PlaneGeometry(w, Math.hypot(len, drop)), this.mat(C.pasirBasah));
        slope.rotation.x = -Math.PI / 2 - Math.atan2(drop, len);
        slope.position.set(cx, (SAND_Y + SEA_Y - 0.3) / 2, (SAND.zFlat + SAND.zEnd) / 2);
        slope.receiveShadow = true;
        this.group.add(slope);
    }

    buildPier(spots) {
        const len = PIER_Z0 - PIER_Z1, cz = (PIER_Z0 + PIER_Z1) / 2;
        this.block(C.kayu, 3, 0.18, len, PIER_X, DECK_Y - 0.18, cz);
        // Ujung dermaga lebih lebar (tempat duduk para pemancing)
        this.block(C.kayu, 9, 0.18, 6, PIER_X, DECK_Y - 0.18, PIER_Z1 + 3);
        for (let z = PIER_Z0 - 2; z >= PIER_Z1; z -= 4) {
            for (const dx of [-1.4, 1.4]) this.block(C.kayuTua, 0.28, DECK_Y + 1.2, 0.28, PIER_X + dx, -1.2, z, 0, this.cyl);
        }
        // Pagar rendah sisi dermaga
        for (const dx of [-1.45, 1.45]) this.block(C.kayuTua, 0.1, 0.5, len - 8, PIER_X + dx, DECK_Y, cz + 4);
        // Pemancing: duduk di tepi dermaga menghadap laut
        for (let z = PIER_Z0 - 16; z > PIER_Z1 + 6; z -= 9) {
            spots.push({ x: PIER_X - 1.6, y: DECK_Y, z, yaw: -Math.PI / 2, waterY: SEA_Y });
            spots.push({ x: PIER_X + 1.6, y: DECK_Y, z: z - 4, yaw: Math.PI / 2, waterY: SEA_Y });
        }
        for (const dx of [-3.5, 0, 3.5]) spots.push({ x: PIER_X + dx, y: DECK_Y, z: PIER_Z1 + 0.6, yaw: Math.PI, waterY: SEA_Y });
        // Pemancing di bibir pantai: hanya kampung nelayan (timur sungai)
        for (const x of [44, 100, 196, 266, 344]) spots.push({ x, y: SAND_Y, z: SAND.zFlat - 1, yaw: Math.PI, waterY: SEA_Y });
    }

    /** Perahu jukung nelayan ditarik ke pasir: lambung + cadik bambu. */
    buildBoats() {
        [[60, -432, 0.3], [78, -435, -0.2], [160, -431, 0.15], [182, -434, -0.35]].forEach(([x, z, ry], i) => {
            this.block(C.perahu[i], 1.3, 0.7, 7, x, SAND_Y + 0.02, z, ry);
            this.block(0xF4F1EA, 1.1, 0.12, 6.4, x, SAND_Y + 0.72, z, ry);
            for (const s of [-1, 1]) {
                const ox = Math.cos(ry) * s * 2.6, oz = -Math.sin(ry) * s * 2.6;
                this.block(C.kayuTua, 0.18, 0.18, 6, x + ox, SAND_Y + 0.02, z + oz, ry);
                this.block(C.kayuTua, 5.4, 0.1, 0.12, x, SAND_Y + 0.57, z + 1.6, ry);
            }
        });
    }

    /** Tambak pancing: pematang setinggi undakan tertinggi + 0,25 m, air 0,25 m di bawah pematang. */
    buildPond(scenery, spots) {
        const P = POND, w = P.x1 - P.x0, d = P.z1 - P.z0, cx = (P.x0 + P.x1) / 2, cz = (P.z0 + P.z1) / 2;
        const H = (scenery && scenery.terraceTop ? scenery.terraceTop(P.x1) : 3) + 0.25, t = 2;
        this.block(C.tanah, w - t, H - 0.7, d - t, cx, 0, cz);                          // dasar kolam
        this.block(C.rumput, w, H, t, cx, 0, P.z0 + t / 2);                             // pematang selatan
        this.block(C.rumput, w, H, t, cx, 0, P.z1 - t / 2);                             // utara
        this.block(C.rumput, t, H, d - 2 * t, P.x0 + t / 2, 0, cz);                     // barat
        this.block(C.rumput, t, H, d - 2 * t, P.x1 - t / 2, 0, cz);                     // timur
        const water = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * t, d - 2 * t).rotateX(-Math.PI / 2),
            makeWaterMaterial({ color: 0x3E7F66, repeatU: 3, repeatV: 4, flow: 0.01 }));
        water.position.set(cx, H - 0.25, cz);
        water.name = 'pond_water';
        this.pondWater = water;
        // Saung bambu di pematang barat
        const sx = P.x0 - 2.5, sz = cz;
        this.block(C.tanah, 5, H, 5, sx, 0, sz);
        for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.block(C.kayuTua, 0.16, 2.4, 0.16, sx + a * 1.9, H, sz + b * 1.9, 0, this.cyl);
        this.block(C.kayu, 4.2, 0.14, 4.2, sx, H + 0.5, sz);
        this.block(C.atap, 6, 1.2, 6, sx, H + 2.4, sz, Math.PI / 4, new THREE.ConeGeometry(0.72, 1, 4));
        // Pemancing di pematang menghadap ke tengah kolam
        for (let k = 0; k < 4; k++) {
            spots.push({ x: P.x0 + 4 + k * 5.5, y: H, z: P.z0 + 1, yaw: 0, waterY: H - 0.25 });
            spots.push({ x: P.x0 + 6 + k * 5, y: H, z: P.z1 - 1, yaw: Math.PI, waterY: H - 0.25 });
        }
        spots.push({ x: P.x1 - 1, y: H, z: cz - 6, yaw: -Math.PI / 2, waterY: H - 0.25 });
        spots.push({ x: P.x1 - 1, y: H, z: cz + 6, yaw: -Math.PI / 2, waterY: H - 0.25 });
    }
}
