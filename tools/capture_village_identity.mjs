// Tangkap layar 390x844 (headless Chrome, CDP) per preset kamera + hitung draw call (updateDetailLOD dulu).
// Pakai: node tools/capture_village_identity.mjs <outDir> [port] [preset[:x,z,dist,elev,az][@HH]] ...
// Waktu: @fajar | @siang (default) | @senja | @malam
// Contoh: node tools/capture_village_identity.mjs shots 8081 have havenot river street:60,0,14,18@malam
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [outDir = 'shots', port = '8081', ...specs] = process.argv.slice(2);
const presets = specs.length ? specs : ['isometric', 'topdown', 'street', 'far', 'have', 'havenot', 'river'];
mkdirSync(outDir, { recursive: true });
const dbg = 9300 + Math.floor(Math.random() * 400);
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=390,844', `--remote-debugging-port=${dbg}`, `--user-data-dir=${join(outDir, '.chrome-' + dbg)}`,
    `http://localhost:${port}/`
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0;
const pending = new Map();
const errors = [];
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
    return r.result.result.value;
};

try {
    let page;
    for (let k = 0; k < 40 && !page; k++) {
        await sleep(500);
        try { page = (await (await fetch(`http://localhost:${dbg}/json`)).json()).find(p => p.type === 'page'); } catch { }
    }
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    ws.onmessage = e => {
        const m = JSON.parse(e.data);
        if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
        if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
    };
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    for (let k = 0; k < 150; k++) { await sleep(1000); if (await evaluate('!!(window.game && window.game.renderer)')) break; }
    await sleep(4000);
    const result = {};
    for (const spec of presets) {
        const [head, hour] = spec.split('@');
        const [name, args] = head.split(':');
        const o = args ? args.split(',').map(Number) : null;
        let url;
        const calls = await evaluate(`(async () => {
            const g = window.game; const { updateDetailLOD } = await import('/src/core/static_batcher.js');
            g.lighting.setPreset('${hour || 'siang'}');
            g.camera.recenter(0, 0); g.camera.setPresetView('${name}');
            ${o ? `g.camera.targetDesired.set(${o[0]}, 0, ${o[1]}); g.camera.distanceDesired = ${o[2]}; g.camera.elevationDesired = ${o[3]} * Math.PI / 180; ${o[4] != null && !isNaN(o[4]) ? `g.camera.azimuthDesired = ${o[4]} * Math.PI / 180;` : ''}` : ''}
            for (let k = 0; k < 200; k++) g.camera.update(0.1);
            for (let k = 0; k < 60; k++) { g.lighting.update(0.1, g.camera.target, g.camera.distance); if (g.weather) g.weather.update(0.016, g.camera.target, g.camera.distance); }
            if (g.ambience && g.ambience.update) g.ambience.update(0.1, g.camera.target);
            if (g.pedestrians) for (let k = 0; k < 3; k++) g.pedestrians.update(0.016);
            g.scene.updateMatrixWorld(true);
            updateDetailLOD(g.scene, g.camera.camera, 150);
            g.renderer.render(g.scene, g.camera.camera);
            // toDataURL di tugas yang sama dengan render (buffer WebGL dibersihkan setelah komposit)
            return [g.renderer.renderer.info.render.calls, g.renderer.renderer.domElement.toDataURL('image/jpeg', 0.82)];
        })()`).then(([c, u]) => { url = u; return c; });
        const file = join(outDir, `${spec.replace(/[:,@.]/g, '_')}.jpg`);
        writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
        result[spec] = calls;
    }
    console.log(JSON.stringify({ drawCalls: result, errors }, null, 1));
} catch (e) {
    console.error('GAGAL:', e.message);
} finally {
    chrome.kill();
    process.exit(0);
}
