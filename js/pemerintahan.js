/* AUDIRA LAND · gedung pemerintahan di pusat tiap kawasan:
   Kota Cakrawala: Gedung DPRD, Kantor Camat, Polsek, Kantor Pos, Pos Damkar.
   Kampung Nyiur: Kantor Lurah, Kantor Camat, Pos Polisi.
   Membungkus AL.drawObject (tidak mengubah resep lama). Warna ikut art bible: benda ≤45% saturasi. */
(function (AL) {
  'use strict';
  Object.assign(AL.HMAX, { dprd: 3.2, camat: 2.4, lurah: 2.2, polsek: 2.2, kantorpos: 1.9, damkar: 2.8 });

  function flag(p, x, y, z0, h) {
    const a = p.P(x, y, z0), b = p.P(x, y, z0 + h), c = p.c;
    c.strokeStyle = p.col('#8a8f99'); c.lineWidth = Math.max(1, 1.2 * p.s);
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    p.poly([[x, y, z0 + h], [x + 0.32, y, z0 + h - 0.04], [x + 0.32, y, z0 + h - 0.13], [x, y, z0 + h - 0.09]], '#c0645c');
    p.poly([[x, y, z0 + h - 0.09], [x + 0.32, y, z0 + h - 0.13], [x + 0.32, y, z0 + h - 0.22], [x, y, z0 + h - 0.18]], '#f5f2ec');
  }
  // papan nama di bidang +y: kotak gelap + tulisan
  function sign(p, x, y, z, w, txt, bg, fg) {
    p.box(x, y, w, 0.05, z, 0.22, bg);
    p.textY(txt, x + 0.06, y + 0.05, z + 0.19, Math.min(0.14, (w - 0.1) / (txt.length * 0.64)), fg);
  }
  const lawn = (p, col) => p.poly([[0.04, 0.04, 0.004], [1.96, 0.04, 0.004], [1.96, 1.96, 0.004], [0.04, 1.96, 0.004]], col);
  const path = (p, x, w) => p.poly([[x, 1.5, 0.008], [x + w, 1.5, 0.008], [x + w, 1.98, 0.008], [x, 1.98, 0.008]], '#e2d9c6');

  const R = {
    // Gedung DPRD: neoklasik, serambi berpilar, pedimen, kubah hijau tembaga
    dprd(p) {
      const wall = '#efe7d8';
      lawn(p, '#b7cf9e'); path(p, 0.75, 0.5);
      p.shadow(0.12, 0.25, 1.76, 1.2, 2.2);
      p.box(0.06, 0.2, 1.88, 1.35, 0, 0.12, '#d8cfbd');                 // undakan
      p.box(0.12, 0.25, 1.76, 1.0, 0.12, 1.0, wall, { win: true, seed: 21, glass: '#9fb7c6', fh: 0.42, gap: 0.3, ww: 0.13 });
      for (let k = 0; k < 6; k++) p.cyl(0.42 + k * 0.23, 1.38, 0.05, 0.12, 0.92, '#fbf8f2');  // pilar serambi
      p.box(0.3, 1.25, 1.4, 0.24, 1.04, 0.12, wall);                    // balok atas serambi
      p.poly([[0.3, 1.49, 1.16], [1.7, 1.49, 1.16], [1.0, 1.49, 1.55]], '#e6dccb');  // pedimen
      p.textY('DPRD', 0.84, 1.49, 1.42, 0.12, '#14324a');
      p.box(0.12, 0.25, 1.76, 1.0, 1.12, 0.06, '#d8cfbd');
      p.cyl(1.0, 0.75, 0.42, 1.18, 0.35, '#e6dccb');                    // drum kubah
      for (let k = 0; k < 5; k++) p.cyl(1.0, 0.75, 0.4 - k * 0.075, 1.53 + k * 0.09, 0.09, '#7d9e92'); // kubah bertingkat
      p.cyl(1.0, 0.75, 0.05, 1.98, 0.25, '#c9b07e');
      flag(p, 1.85, 1.85, 0, 1.7);
      return 2.4;
    },
    // Kantor Camat: dua lantai, atap pelana hijau, kanopi pintu
    camat(p, l) {
      const kamp = l.district === 'kampung', wall = kamp ? '#ece2cc' : '#f2eee4', roof = kamp ? '#8a6c4c' : '#6f8f6a';
      lawn(p, kamp ? '#b9c49a' : '#b7cf9e'); path(p, 0.8, 0.4);
      p.shadow(0.2, 0.3, 1.6, 1.05, 1.9);
      p.box(0.2, 0.3, 1.6, 1.05, 0, 1.25, wall, { win: true, seed: 33, glass: '#a3bccb', fh: 0.5, gap: 0.3, ww: 0.14 });
      p.box(0.72, 1.35, 0.56, 0.22, 0.5, 0.06, roof);                    // kanopi
      p.box(0.76, 1.52, 0.05, 0.05, 0, 0.5, '#f5f2ec'); p.box(1.19, 1.52, 0.05, 0.05, 0, 0.5, '#f5f2ec');
      p.roofX(0.2, 0.3, 1.6, 1.05, 1.25, 0.42, roof, wall);
      sign(p, 0.35, 1.36, 0.88, 1.3, 'KANTOR CAMAT', '#14324a', '#f3ece2');
      flag(p, 1.88, 1.86, 0, 1.6);
      return 1.75;
    },
    // Kantor Lurah: pendopo kayu beratap joglo bertingkat + kentongan bambu
    lurah(p) {
      const wood = '#9a7b55', wall = '#e9dcc0';
      lawn(p, '#b9c49a'); path(p, 0.85, 0.35);
      p.shadow(0.2, 0.3, 1.6, 1.2, 1.6);
      p.box(0.15, 0.25, 1.7, 1.3, 0, 0.18, '#cdb994');                   // lantai panggung
      p.box(0.3, 0.35, 1.4, 0.7, 0.18, 0.75, wall, { win: true, seed: 41, glass: '#b9a888', fh: 0.6, gap: 0.34, ww: 0.14 });
      for (const [x, y] of [[0.22, 1.42], [0.82, 1.42], [1.18, 1.42], [1.78, 1.42]]) p.box(x - 0.04, y - 0.04, 0.08, 0.08, 0.18, 0.78, wood); // tiang pendopo
      p.roofX(0.12, 0.22, 1.76, 1.36, 0.96, 0.22, '#7d5a3e', wall);       // atap bawah
      p.roofX(0.5, 0.5, 1.0, 0.8, 1.18, 0.5, '#6e4f36', '#7d5a3e');       // atap joglo atas
      sign(p, 0.4, 1.46, 0.98, 1.2, 'KANTOR LURAH', '#5e4630', '#f3ece2');
      // kentongan bambu tergantung
      const a = p.P(1.86, 1.5, 0.9), b = p.P(1.86, 1.5, 0.55);
      p.c.strokeStyle = p.col('#8a6c4c'); p.c.lineWidth = Math.max(1, 1 * p.s);
      p.c.beginPath(); p.c.moveTo(a[0], a[1]); p.c.lineTo(b[0], b[1]); p.c.stroke();
      p.cyl(1.86, 1.5, 0.07, 0.3, 0.26, '#c9b07e');
      return 1.7;
    },
    // Polsek / Pos Polisi: biru-abu dengan pita navy, lampu rotator
    polsek(p, l) {
      const kamp = l.district === 'kampung', w = kamp ? 1.2 : 1.55, wall = '#e3e6ea';
      lawn(p, kamp ? '#b9c49a' : '#c9ced4'); path(p, 0.8, 0.4);
      p.shadow(0.25, 0.35, w, 1.0, 1.2);
      p.box(0.25, 0.35, w, 1.0, 0, kamp ? 0.75 : 1.05, wall, { win: true, seed: 51, glass: '#9fb2c6', fh: 0.45, gap: 0.3, ww: 0.14 });
      const h = kamp ? 0.75 : 1.05;
      p.poly([[0.25, 1.35, h - 0.28], [0.25 + w, 1.35, h - 0.28], [0.25 + w, 1.35, h - 0.18], [0.25, 1.35, h - 0.18]], '#3a5470');
      p.poly([[0.25 + w, 0.35, h - 0.28], [0.25 + w, 1.35, h - 0.28], [0.25 + w, 1.35, h - 0.18], [0.25 + w, 0.35, h - 0.18]], '#2f465e');
      p.box(0.25, 0.35, w, 1.0, h, 0.05, '#3a5470');
      sign(p, 0.35, 1.36, h - 0.02, kamp ? 1.0 : 1.2, kamp ? 'POS POLISI' : 'POLSEK', '#14324a', '#f3ece2');
      p.box(0.25 + w / 2 - 0.08, 0.8, 0.16, 0.12, h + 0.05, 0.08, p.n ? '#9fc4e8' : '#6a8fb5');
      if (!kamp) { p.box(1.55, 1.45, 0.38, 0.22, 0, 0.14, '#f5f2ec'); p.box(1.6, 1.48, 0.22, 0.16, 0.14, 0.09, '#3a5470'); } // mobil patroli
      return h + 0.2;
    },
    // Kantor Pos: pita salem, kotak surat
    kantorpos(p) {
      const wall = '#f0e6d2';
      lawn(p, '#c9ced4'); path(p, 0.7, 0.4);
      p.shadow(0.3, 0.4, 1.3, 1.0, 1.0);
      p.box(0.3, 0.4, 1.3, 1.0, 0, 0.9, wall, { win: true, seed: 61, glass: '#a9c0cc', fh: 0.45, gap: 0.3, ww: 0.14 });
      p.poly([[0.3, 1.4, 0.55], [1.6, 1.4, 0.55], [1.6, 1.4, 0.68], [0.3, 1.4, 0.68]], '#d9967c');
      p.poly([[1.6, 0.4, 0.55], [1.6, 1.4, 0.55], [1.6, 1.4, 0.68], [1.6, 0.4, 0.68]], '#c4836a');
      p.box(0.3, 0.4, 1.3, 1.0, 0.9, 0.06, '#d9967c');
      sign(p, 0.4, 1.41, 0.7, 1.1, 'KANTOR POS', '#14324a', '#f3ece2');
      p.box(1.72, 1.6, 0.14, 0.12, 0, 0.32, '#d9967c'); p.box(1.7, 1.58, 0.18, 0.16, 0.32, 0.05, '#b8735a'); // kotak surat
      return 1.0;
    },
    // Pos Damkar: garasi dua pintu, menara selang
    damkar(p) {
      const wall = '#ddd5c6', door = '#a9584c';
      lawn(p, '#c9ced4');
      p.poly([[0.15, 1.2, 0.006], [1.4, 1.2, 0.006], [1.4, 1.98, 0.006], [0.15, 1.98, 0.006]], '#b8b4ab'); // apron beton
      p.shadow(0.15, 0.3, 1.25, 0.9, 1.1);
      p.box(0.15, 0.3, 1.25, 0.9, 0, 0.95, wall);
      for (const x of [0.25, 0.8]) p.poly([[x, 1.2, 0.02], [x + 0.45, 1.2, 0.02], [x + 0.45, 1.2, 0.62], [x, 1.2, 0.62]], door);
      for (const x of [0.25, 0.8]) for (let k = 1; k < 5; k++) p.poly([[x, 1.2, 0.02 + k * 0.12], [x + 0.45, 1.2, 0.02 + k * 0.12], [x + 0.45, 1.2, 0.035 + k * 0.12], [x, 1.2, 0.035 + k * 0.12]], AL.shade(door, 0.8));
      sign(p, 0.3, 1.21, 0.68, 0.9, 'DAMKAR', '#14324a', '#f3ece2');
      p.box(1.45, 0.35, 0.36, 0.36, 0, 2.3, '#cfc6b4', { win: true, seed: 71, glass: '#9fb2c6', fh: 0.55, gap: 0.3, ww: 0.12 }); // menara selang
      p.box(1.42, 0.32, 0.42, 0.42, 2.3, 0.06, door);
      p.cyl(1.63, 0.53, 0.06, 2.36, 0.12, p.n ? '#ffb38a' : '#c0645c'); // sirene
      return 2.5;
    },
  };

  const baseDraw = AL.drawObject;
  AL.drawObject = function (p, o) { return o.type && R[o.type] ? R[o.type](p, o) : baseDraw(p, o); };
})(window.AL);
