const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\ASUS\\.gemini\\antigravity\\brain\\1e9f27f1-a3ae-4edf-ab8c-7330f77e6518';

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu-watchdog',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-webgpu',
    '--window-size=1440,900',
    '--remote-debugging-port=9311',
    'http://localhost:8417/'
]);

setTimeout(async () => {
    try {
        const resp = await fetch('http://localhost:9311/json');
        const list = await resp.json();
        const page = list.find(p => p.url.includes('localhost:8417'));
        const ws = new WebSocket(page.webSocketDebuggerUrl);

        ws.onopen = () => {
            console.log('Connected to CDP');
            setTimeout(() => {
                // Evaluasi pengalihan ke malam hari
                ws.send(JSON.stringify({
                    id: 1,
                    method: 'Runtime.evaluate',
                    params: {
                        expression: `(() => {
                            if (!window.game) return { error: 'no game' };
                            
                            // 1. Klik tombol malam di HUD
                            const btnMalam = document.querySelector('.btn-time[data-time="malam"]');
                            if (btnMalam) btnMalam.click();
                            
                            // 2. Set langsung di lighting
                            window.game.lighting.setPreset('malam');
                            
                            // 3. Set kamera melihat gedung kota
                            window.game.camera.recenter(-30, 0);
                            window.game.camera.distance = 55;
                            window.game.camera.phi = 0.55;
                            window.game.camera.theta = 0.65;

                            return {
                                phase: window.game.lighting.currentPhaseName,
                                hour: window.game.lighting.currentHourWIB,
                                isNight: window.game.lighting.isNight(),
                                bgHex: window.game.scene.background ? window.game.scene.background.getHexString() : null
                            };
                        })()`,
                        returnByValue: true
                    }
                }));
            }, 4500);
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.id === 1) {
                console.log('[Eval Result]', msg.result);
                // Capture screenshot
                setTimeout(() => {
                    ws.send(JSON.stringify({ id: 2, method: 'Page.captureScreenshot', params: { format: 'png' } }));
                }, 1000);
            } else if (msg.id === 2 && msg.result && msg.result.data) {
                const outPath = path.join(ARTIFACT_DIR, 'night_lighting_screen.png');
                fs.writeFileSync(outPath, Buffer.from(msg.result.data, 'base64'));
                console.log('[Night Screenshot Saved]');
                chrome.kill();
                process.exit(0);
            }
        };
    } catch (e) {
        console.error(e);
        chrome.kill();
        process.exit(1);
    }
}, 1500);

