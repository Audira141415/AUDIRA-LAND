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
    '--remote-debugging-port=9299',
    'http://localhost:8417/'
]);

let step = 0;
let ws = null;
const pendingScreenshots = new Map();

function sendCDP(method, params = {}, id = undefined) {
    step++;
    const msgId = id || step;
    ws.send(JSON.stringify({ id: msgId, method, params }));
    return msgId;
}

function evaluate(expr, id = undefined) {
    return sendCDP('Runtime.evaluate', { expression: expr, returnByValue: true }, id);
}

function captureScreenshot(filename, nextAction) {
    const shotId = 4000 + step;
    pendingScreenshots.set(shotId, { filename, nextAction });
    sendCDP('Page.captureScreenshot', { format: 'png' }, shotId);
}

setTimeout(async () => {
    try {
        const resp = await fetch('http://localhost:9299/json');
        const list = await resp.json();
        const page = list.find(p => p.url.includes('localhost:8417'));
        if (!page) {
            console.error('Target page not found!');
            chrome.kill();
            process.exit(1);
        }

        ws = new WebSocket(page.webSocketDebuggerUrl);

        ws.onopen = () => {
            console.log('[CDP] Connected. Waiting 5s...');
            setTimeout(runSequence, 5000);
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);

            if (pendingScreenshots.has(msg.id) && msg.result && msg.result.data) {
                const { filename, nextAction } = pendingScreenshots.get(msg.id);
                pendingScreenshots.delete(msg.id);
                const fullPath = path.join(ARTIFACT_DIR, filename);
                fs.writeFileSync(fullPath, Buffer.from(msg.result.data, 'base64'));
                console.log(`[Screenshot] Saved: ${filename}`);

                if (typeof nextAction === 'function') {
                    setTimeout(nextAction, 1000);
                }
            }
        };

    } catch (err) {
        console.error(err);
        chrome.kill();
        process.exit(1);
    }
}, 1500);

function runSequence() {
    console.log('[Shot 1] Monument Banner Timur: KOTA DESA HAVE-NOT (Dilihat dari Jembatan)');
    // Posisi kamera di jembatan (X=0, Z=0) memandang tepat ke Timur (ke arah X=21.5)
    evaluate(`(() => {
        if (window.game && window.game.camera) {
            window.game.camera.recenter(21.5, 0);
            window.game.camera.distance = 24;
            window.game.camera.phi = 0.35;
            window.game.camera.theta = -1.57; // Tepat melihat muka depan dari arah Barat
        }
        return true;
    })()`);

    setTimeout(() => {
        captureScreenshot('monument_banner_havenot_front.png', () => {
            console.log('[Shot 2] Monument Banner Barat: KOTA DESA HAVE (Dilihat dari Jembatan)');
            // Posisi kamera di jembatan memandang tepat ke Barat (ke arah X=-21.5)
            evaluate(`(() => {
                if (window.game && window.game.camera) {
                    window.game.camera.recenter(-21.5, 0);
                    window.game.camera.distance = 24;
                    window.game.camera.phi = 0.35;
                    window.game.camera.theta = 1.57; // Tepat melihat muka depan dari arah Timur
                }
                return true;
            })()`);

            setTimeout(() => {
                captureScreenshot('monument_banner_have_front.png', () => {
                    console.log('[Shot 3] Mode Malam WIB: Jendela & Lampu Menyala');
                    evaluate(`(() => {
                        if (window.game && window.game.lighting) {
                            window.game.lighting.setPreset('malam');
                            // Paksa update pencahayaan gedung
                            if (window.game.buildingLoader) {
                                window.game.buildingLoader.updateLighting(true);
                            }
                            if (window.updateCatalogLighting) {
                                window.updateCatalogLighting(true);
                            }
                        }
                        if (window.game && window.game.camera) {
                            window.game.camera.recenter(0, 0);
                            window.game.camera.distance = 60;
                            window.game.camera.phi = 0.55;
                            window.game.camera.theta = 0.45;
                        }
                        return true;
                    })()`);

                    setTimeout(() => {
                        captureScreenshot('night_lighting_screen.png', () => {
                            console.log('[All Captured!]');
                            chrome.kill();
                            process.exit(0);
                        });
                    }, 1500);
                });
            }, 1500);
        });
    }, 1500);
}

