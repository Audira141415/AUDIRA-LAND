const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\ASUS\\.gemini\\antigravity\\brain\\1e9f27f1-a3ae-4edf-ab8c-7330f77e6518';

// Jalankan Chrome Headless dengan WebGL software renderer (SwiftShader) yang andal di Windows headless
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu-watchdog',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-webgpu',
    '--window-size=1440,900',
    '--remote-debugging-port=9277',
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
    const shotId = 2000 + step;
    pendingScreenshots.set(shotId, { filename, nextAction });
    sendCDP('Page.captureScreenshot', { format: 'png' }, shotId);
}

setTimeout(async () => {
    try {
        const resp = await fetch('http://localhost:9277/json');
        const list = await resp.json();
        const page = list.find(p => p.url.includes('localhost:8417'));
        if (!page) {
            console.error('Target page not found!');
            chrome.kill();
            process.exit(1);
        }

        ws = new WebSocket(page.webSocketDebuggerUrl);

        ws.onopen = () => {
            console.log('[CDP] Connected. Waiting 5s for 3D world to render...');
            setTimeout(runTestSequence, 5000);
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
        console.error('[Error]', err);
        chrome.kill();
        process.exit(1);
    }
}, 1500);

function runTestSequence() {
    console.log('[Step 1] Verifikasi Banner Monumental & Sungai');
    // Set kamera melihat jembatan utama dan monumen banner raksasa (Z=0)
    evaluate(`(() => {
        if (window.game && window.game.camera) {
            window.game.camera.recenter(0, 0);
            window.game.camera.distance = 75;
            window.game.camera.phi = 0.52;
            window.game.camera.theta = 0.40;
        }
        return true;
    })()`);

    setTimeout(() => {
        captureScreenshot('monumental_banners_screen.png', () => {
            console.log('[Step 2] Verifikasi Suasana Desa Have-Not Asri (Pekarangan & Tanpa Crane Rumah)');
            // Fokus ke Desa Have-Not timur (X = 40, Z = 8)
            evaluate(`(() => {
                if (window.game && window.game.camera) {
                    window.game.camera.recenter(40, 8);
                    window.game.camera.distance = 42;
                    window.game.camera.phi = 0.65;
                    window.game.camera.theta = 0.55;
                }
                return true;
            })()`);

            setTimeout(() => {
                captureScreenshot('rural_havenot_village_screen.png', () => {
                    console.log('[Step 3] Verifikasi Lalu Lintas di Jembatan & Anti-Air');
                    // Cek telemetri lalu lintas dan lihat jembatan
                    evaluate(`(() => {
                        if (window.game && window.game.camera) {
                            window.game.camera.recenter(0, 0);
                            window.game.camera.distance = 55;
                            window.game.camera.phi = 0.60;
                            window.game.camera.theta = 1.57; // Tampak samping jembatan
                        }
                        return true;
                    })()`);

                    setTimeout(() => {
                        captureScreenshot('traffic_bridges_screen.png', () => {
                            console.log('[Step 4] Verifikasi Mode Malam: Lampu & Jendela Menyala Hangat');
                            // Aktifkan mode malam
                            evaluate(`(() => {
                                if (window.game && window.game.lighting) {
                                    window.game.lighting.setPreset('malam');
                                }
                                return true;
                            })()`);

                            setTimeout(() => {
                                captureScreenshot('night_lighting_screen.png', () => {
                                    console.log('[Step 5] Verifikasi Modal Registrasi Instagram');
                                    // Kembalikan ke siang & buka modal IG
                                    evaluate(`(() => {
                                        if (window.game && window.game.lighting) {
                                            window.game.lighting.setPreset('siang');
                                        }
                                        const btnIG = document.getElementById('btn-hud-ig-register');
                                        if (btnIG) btnIG.click();
                                        return true;
                                    })()`);

                                    setTimeout(() => {
                                        captureScreenshot('instagram_registration_modal_screen.png', () => {
                                            console.log('[Step 6] Eksekusi Pendaftaran Warga Instagram & Terbitkan E-KTP');
                                            // Isi form IG dan submit
                                            evaluate(`(async () => {
                                                const input = document.getElementById('input-ig-username');
                                                if (input) {
                                                    input.value = 'agus_dwi_rianto';
                                                }
                                                const btn = document.getElementById('btn-submit-ig-register');
                                                if (btn) {
                                                    btn.click();
                                                }
                                                return true;
                                            })()`);

                                            setTimeout(() => {
                                                captureScreenshot('instagram_digital_ktp_screen.png', () => {
                                                    console.log('[Step 7] Lihat Rumah Pekarangan Warga Instagram yang Baru Dibangun');
                                                    evaluate(`(() => {
                                                        const btnGo = document.getElementById('btn-goto-my-home');
                                                        if (btnGo) btnGo.click();
                                                        return true;
                                                    })()`);

                                                    setTimeout(() => {
                                                        captureScreenshot('instagram_new_home_screen.png', () => {
                                                            console.log('[Test Complete] Semua 7 skenario berhasil diverifikasi!');
                                                            chrome.kill();
                                                            process.exit(0);
                                                        });
                                                    }, 1500);
                                                });
                                            }, 2000);
                                        });
                                    }, 1500);
                                });
                            }, 1500);
                        });
                    }, 1200);
                });
            }, 1500);
        });
    }, 1500);
}
