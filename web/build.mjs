/**
 * AUDIRA-LAND - build rilis web.
 *
 *   npm run build        bundel src/main.js -> build/ + index.release.html
 *   npm run size         sama, lalu cetak ukuran gzip saja
 *
 * Langkah:
 *  1. esbuild menggabung src/main.js (ESM, code-splitting untuk import() dinamis) ke build/.
 *  2. terser meminifikasi tiap file keluaran (aman: tanpa opsi unsafe_*).
 *  3. index.release.html dibuat dari index.html: <script type="module"> diarahkan ke build/main.js.
 *
 * three.js r128 tetap global `THREE` dari public/vendor/three.min.js (tidak di-bundle).
 * Supabase dimuat dari CDN lewat import() URL, jadi ditandai external.
 * Mode dev tidak berubah: index.html tetap memuat ./src/main.js mentah.
 */
import { build } from 'esbuild';
import { minify } from 'terser';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'build');
const BUDGET_GZIP = 160 * 1024;

fs.rmSync(OUT, { recursive: true, force: true });

const result = await build({
    entryPoints: { main: path.join(ROOT, 'src/main.js') },
    bundle: true,
    splitting: true,
    format: 'esm',
    target: 'es2020',
    outdir: OUT,
    chunkNames: 'chunk-[hash]',
    external: ['https://*'],
    legalComments: 'none',
    charset: 'utf8',
    write: true,
    logLevel: 'warning',
    metafile: true,
});

// Muatan awal = build/main.js + semua chunk yang di-import statis olehnya (bukan import() dinamis).
const outputs = result.metafile.outputs;
const initial = new Set();
(function walk(file) {
    if (initial.has(file)) return;
    initial.add(file);
    for (const imp of outputs[file].imports || []) {
        if (imp.kind === 'import-statement' && outputs[imp.path]) walk(imp.path);
    }
})(Object.keys(outputs).find((f) => path.basename(f) === 'main.js'));

let total = 0;
let entryGzip = 0;
const rows = [];
for (const file of Object.keys(outputs)) {
    const abs = path.resolve(ROOT, file);
    const code = fs.readFileSync(abs, 'utf8');
    const min = await minify(code, {
        module: true,
        ecma: 2020,
        // Rilis: console.log/info/debug dibuang (console.warn/error tetap untuk diagnosa di HP)
        compress: { passes: 3, toplevel: true, pure_funcs: ['console.log', 'console.info', 'console.debug'] },
        mangle: { toplevel: true },
        format: { comments: false },
    });
    fs.writeFileSync(abs, min.code);
    const gz = gzipSync(min.code, { level: 9 }).length;
    total += gz;
    if (initial.has(file)) entryGzip += gz;
    rows.push([path.relative(ROOT, abs).replace(/\\/g, '/') + (initial.has(file) ? '' : ' (lazy)'), min.code.length, gz]);
}

// index.release.html: sama dengan index.html, hanya skrip modulnya diganti ke bundel (cache-bust dengan hash isi).
const mainCode = fs.readFileSync(path.join(OUT, 'main.js'));
const hash = createHash('sha256').update(mainCode).digest('hex').slice(0, 10);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const re = /<script type="module" src="\.\/src\/main\.js[^"]*"><\/script>/;
if (!re.test(html)) throw new Error('index.html: tag <script type="module" src="./src/main.js"> tidak ditemukan');
fs.writeFileSync(
    path.join(ROOT, 'index.release.html'),
    html.replace(re, `<script type="module" src="./build/main.js?v=${hash}"></script>`)
);

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
for (const [f, raw, gz] of rows) console.log(`${f.padEnd(28)} ${kb(raw).padStart(10)}  gzip ${kb(gz).padStart(9)}`);
console.log(`muatan JS awal gzip (main + chunk statis): ${kb(entryGzip)} / anggaran ${kb(BUDGET_GZIP)}`);
console.log(`total semua chunk gzip (termasuk lazy):    ${kb(total)}`);
if (entryGzip > BUDGET_GZIP) {
    console.error('GAGAL: bundel awal melebihi anggaran 160 KB gzip.');
    process.exit(1);
}
