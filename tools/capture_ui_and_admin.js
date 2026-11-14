const { spawn } = require('child_process');
const fs = require('fs');

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--no-sandbox',
    '--window-size=1280,720',
    '--remote-debugging-port=9245',
    'http://localhost:8417/'
]);

setTimeout(async () => {
    try {
        const resp = await fetch('http://localhost:9245/json');
        const list = await resp.json();
        const page = list.find(p => p.url.includes('localhost:8417'));
        if (!page) {
            console.error('Page target tidak ditemukan!');
            chrome.kill();
            process.exit(1);
        }

        const ws = new WebSocket(page.webSocketDebuggerUrl);
        ws.onopen = () => {
            console.log('Terkoneksi ke CDP. Menunggu 3.5 detik...');
            setTimeout(() => {
                // Screenshot 1: Clean UI awal (Mode Tamu / Warga)
                ws.send(JSON.stringify({ id: 10, method: 'Page.captureScreenshot' }));
            }, 3500);
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);

            if (msg.id === 10 && msg.result && msg.result.data) {
                const outPath1 = 'C:\\Users\\ASUS\\.gemini\\antigravity\\brain\\1e9f27f1-a3ae-4edf-ab8c-7330f77e6518\\clean_ui_screen.png';
                fs.writeFileSync(outPath1, Buffer.from(msg.result.data, 'base64'));
                console.log('1. Saved clean_ui_screen.png');

                // Klik tombol [👑 Jadi Admin]
                ws.send(JSON.stringify({
                    id: 11,
                    method: 'Runtime.evaluate',
                    params: {
                        expression: `(() => {
                            const btn = document.getElementById('btn-quick-toggle-role');
                            if (btn) {
                                btn.click();
                                return true;
                            }
                            return false;
                        })()`
                    }
                }));

                setTimeout(() => {
                    // Screenshot 1b: Header dengan Role Super Admin aktif & Tombol Panel Admin muncul
                    ws.send(JSON.stringify({ id: 12, method: 'Page.captureScreenshot' }));
                }, 500);
            }

            if (msg.id === 12 && msg.result && msg.result.data) {
                const outPath1b = 'C:\\Users\\ASUS\\.gemini\\antigravity\\brain\\1e9f27f1-a3ae-4edf-ab8c-7330f77e6518\\super_admin_header_screen.png';
                fs.writeFileSync(outPath1b, Buffer.from(msg.result.data, 'base64'));
                console.log('1b. Saved super_admin_header_screen.png');

                // Buka Panel Admin dengan klik tombol [⚙️ Panel Admin]
                ws.send(JSON.stringify({
                    id: 21,
                    method: 'Runtime.evaluate',
                    params: {
                        expression: `(() => {
                            const btnAdmin = document.getElementById('btn-open-admin-panel');
                            if (btnAdmin) {
                                btnAdmin.click();
                                return true;
                            }
                            return false;
                        })()`
                    }
                }));

                setTimeout(() => {
                    // Screenshot 2: Admin Dashboard Modal
                    ws.send(JSON.stringify({ id: 20, method: 'Page.captureScreenshot' }));
                }, 600);
            }

            if (msg.id === 20 && msg.result && msg.result.data) {
                const outPath2 = 'C:\\Users\\ASUS\\.gemini\\antigravity\\brain\\1e9f27f1-a3ae-4edf-ab8c-7330f77e6518\\super_admin_dashboard_screen.png';
                fs.writeFileSync(outPath2, Buffer.from(msg.result.data, 'base64'));
                console.log('2. Saved super_admin_dashboard_screen.png');

                // Tutup modal dan buka kartu kavling untuk melihat Aksi Super Admin (Gusur / Selesaikan Instan)
                ws.send(JSON.stringify({
                    id: 31,
                    method: 'Runtime.evaluate',
                    params: {
                        expression: `(() => {
                            window.game?.adminModal?.hide();
                            const bldEntry = Array.from(window.game.buildingLoader.loadedBuildings.values())[0];
                            if (bldEntry) {
                                const b = bldEntry.data;
                                const fakePlot = {
                                    district: { name: 'Alun-Alun Merdeka', key: b.district_key || 'k12' },
                                    tileI: b.grid_i,
                                    tileJ: b.grid_j
                                };
                                window.game.hud.showPlotCard(fakePlot, b);
                                return true;
                            }
                            return false;
                        })()`
                    }
                }));

                setTimeout(() => {
                    // Screenshot 3: Plot Card with Super Admin Controls
                    ws.send(JSON.stringify({ id: 30, method: 'Page.captureScreenshot' }));
                }, 600);
            }

            if (msg.id === 30 && msg.result && msg.result.data) {
                const outPath3 = 'C:\\Users\\ASUS\\.gemini\\antigravity\\brain\\1e9f27f1-a3ae-4edf-ab8c-7330f77e6518\\admin_plot_card_screen.png';
                fs.writeFileSync(outPath3, Buffer.from(msg.result.data, 'base64'));
                console.log('3. Saved admin_plot_card_screen.png');
                chrome.kill();
                process.exit(0);
            }
        };

        ws.onerror = (err) => {
            console.error('WebSocket error:', err);
            chrome.kill();
            process.exit(1);
        };
    } catch (e) {
        console.error('Error saat capture:', e);
        chrome.kill();
        process.exit(1);
    }
}, 2500);
