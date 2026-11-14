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
    '--remote-debugging-port=9288',
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
    const shotId = 3000 + step;
    pendingScreenshots.set(shotId, { filename, nextAction });
    sendCDP('Page.captureScreenshot', { format: 'png' }, shotId);
}

setTimeout(async () => {
    try {
        const resp = await fetch('http://localhost:9288/json');
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
        console.error('[Error]', err);
        chrome.kill();
        process.exit(1);
    }
}, 1500);

function runSequence() {
    console.log('[Shot 1] Banner Monumental Raksasa Depan Kamera (Tampak Jelas & Tajam)');
    // Arahkan kamera langsung ke muka depan Banner Raksasa Desa Have-Not di X=21.5, Z=0
    evaluate(`(() => {
        if (window.game && window.game.camera) {
            window.game.camera.recenter(21.5, 0);
            window.game.camera.distance = 28;
            window.game.camera.phi = 0.28;
            window.game.camera.theta = 1.57; // Tepat menghadap muka banner dari barat
        }
        return true;
    })()`);

    setTimeout(() => {
        captureScreenshot('monumental_banners_screen.png', () => {
            console.log('[Shot 2] Suasana Desa Have-Not Asri & Pekarangan Berkebun (Tanpa Crane)');
            // Kamera ke tengah kawasan pemukiman Desa Have-Not
            evaluate(`(() => {
                if (window.game && window.game.camera) {
                    window.game.camera.recenter(40, 8);
                    window.game.camera.distance = 36;
                    window.game.camera.phi = 0.55;
                    window.game.camera.theta = 0.65;
                }
                return true;
            })()`);

            setTimeout(() => {
                captureScreenshot('rural_havenot_village_screen.png', () => {
                    console.log('[Shot 3] Mode Malam: Lampu Jendela & Lentera Menyala');
                    evaluate(`(() => {
                        const btnNight = document.querySelector('.btn-time[data-time="malam"]');
                        if (btnNight) btnNight.click();
                        if (window.game && window.game.lighting) {
                            window.game.lighting.setPreset('malam');
                        }
                        if (window.game && window.game.camera) {
                            window.game.camera.recenter(-15, 0);
                            window.game.camera.distance = 45;
                        }
                        return true;
                    })()`);

                    setTimeout(() => {
                        captureScreenshot('night_lighting_screen.png', () => {
                            console.log('[Shot 4] Buka Modal Registrasi Instagram');
                            evaluate(`(() => {
                                const btnDay = document.querySelector('.btn-time[data-time="siang"]');
                                if (btnDay) btnDay.click();
                                if (window.game && window.game.authModal) {
                                    window.game.authModal.show('instagram');
                                }
                                return true;
                            })()`);

                            setTimeout(() => {
                                captureScreenshot('instagram_registration_modal_screen.png', () => {
                                    console.log('[Shot 5] Input Username IG & Terbitkan E-KTP');
                                    evaluate(`(async () => {
                                        const input = document.getElementById('input-ig-username');
                                        if (input) input.value = 'agus_dwi_rianto';
                                        const btnSubmit = document.getElementById('btn-submit-ig-register');
                                        if (btnSubmit) btnSubmit.click();
                                        return true;
                                    })()`);

                                    setTimeout(() => {
                                        captureScreenshot('instagram_digital_ktp_screen.png', () => {
                                            console.log('[Shot 6] Kamera Menuju Rumah Pekarangan Warga Instagram');
                                            evaluate(`(() => {
                                                const btnGo = document.getElementById('btn-goto-my-home');
                                                if (btnGo) btnGo.click();
                                                return true;
                                            })()`);

                                            setTimeout(() => {
                                                captureScreenshot('instagram_new_home_screen.png', () => {
                                                    console.log('[All Captured Successfully!]');
                                                    chrome.kill();
                                                    process.exit(0);
                                                });
                                            }, 2000);
                                        });
                                    }, 2000);
                                });
                            }, 1500);
                        });
                    }, 2000);
                });
            }, 1500);
        });
    }, 1500);
}

