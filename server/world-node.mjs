// AUDIRA LAND · jalankan js/util.js + js/avatar.js + js/world.js di Node (vm), supaya server
// memakai rumus peta, pekerjaan, dan gaji yang sama persis dengan peramban.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

export function loadWorld(root) {
  const ctx = vm.createContext({});
  ctx.window = ctx;
  for (const f of ['util.js', 'avatar.js', 'world.js']) {
    vm.runInContext(readFileSync(join(root, 'js', f), 'utf8'), ctx, { filename: f });
  }
  const AL = ctx.AL;
  return {
    AL,
    // sidik jari semua hal yang menentukan rumah, kerja, jabatan, dan gaji warga ke-1..n.
    // Berubah = mengubah peta/rumus akan menggeser rumah & saldo warga yang sudah ada.
    fingerprint(n = 20000) {
      const h = createHash('sha256');
      for (let seq = 1; seq <= n; seq++) {
        const home = AL.homeForSeq(seq), l = home >= 0 ? AL.lots[home] : null, pl = AL.places[AL.jobForSeq(seq)];
        h.update(`${seq}|${l ? `${l.x},${l.y},${l.type}` : '-'}|${pl.kind},${pl.name}\n`);
      }
      for (let j = 0; j < AL.places.length; j++) {
        for (const days of [0, 1, 10, 100, 1000]) {
          const c = AL.career({ joined: 0, job: j, skill: 1 }, days * 86400000);
          h.update(`${j}|${days}|${c.lvl}|${c.title}|${c.pay.toFixed(4)}\n`);
        }
      }
      return h.digest('hex');
    },
    // gaji & jabatan untuk warga dengan nomor urut seq
    career(username, seq, joined, now = Date.now()) {
      const res = { joined, job: AL.jobForSeq(seq), skill: AL.skillFor(AL.hash32(username)) };
      const c = AL.career(res, now);
      return { lvl: c.lvl, title: c.title, place: c.place.name, kind: c.place.kind, pay: c.pay, accrued: c.saldo, days: c.days };
    },
  };
}
