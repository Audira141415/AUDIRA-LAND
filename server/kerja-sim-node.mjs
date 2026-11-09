// AUDIRA LAND · jalankan js/util.js + js/kerja-sim.js di Node (vm), supaya server memutar ulang
// ronde mini-game kerja dengan kode yang sama persis dengan peramban.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

export function loadKerjaSim(root) {
  const ctx = vm.createContext({});
  ctx.window = ctx;
  for (const f of ['util.js', 'kerja-sim.js']) vm.runInContext(readFileSync(join(root, 'js', f), 'utf8'), ctx, { filename: f });
  return ctx.AL.kerjaSim;
}
