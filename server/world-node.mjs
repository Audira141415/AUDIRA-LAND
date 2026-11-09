// AUDIRA LAND · jalankan js/util.js + js/avatar.js + js/world.js di Node (vm), supaya server
// memakai rumus peta, pekerjaan, dan gaji yang sama persis dengan peramban.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

export function loadWorld(root) {
  const ctx = vm.createContext({});
  ctx.window = ctx;
  for (const f of ['util.js', 'avatar.js', 'world.js']) {
    vm.runInContext(readFileSync(join(root, 'js', f), 'utf8'), ctx, { filename: f });
  }
  const AL = ctx.AL;
  return {
    AL,
    // gaji & jabatan untuk warga dengan nomor urut seq
    career(username, seq, joined, now = Date.now()) {
      const res = { joined, job: AL.jobForSeq(seq), skill: AL.skillFor(AL.hash32(username)) };
      const c = AL.career(res, now);
      return { lvl: c.lvl, title: c.title, place: c.place.name, kind: c.place.kind, pay: c.pay, accrued: c.saldo, days: c.days };
    },
  };
}
