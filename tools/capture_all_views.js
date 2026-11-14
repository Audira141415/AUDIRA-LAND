const { spawn } = require('child_process');
const fs = require('fs');

async function captureView(viewName, outputFileName) {
    return new Promise((resolve, reject) => {
        const port = 9235 + Math.floor(Math.random() * 20);
        const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
            '--headless=new',
            '--no-sandbox',
            '--disable-gpu',
            '--window-size=1280,720',
            `--remote-debugging-port=${port}`,
            'http://localhost:8417/'
        ]);

        setTimeout(async () => {
            try {
                const resp = await fetch(`http://localhost:${port}/json`);
                const list = await resp.json();
                const page = list.find(p => p.url.includes('localhost:8417'));
                if (!page) {
                    chrome.kill();
                    return reject(new Error('Page not found'));
                }

                const ws = new WebSocket(page.webSocketDebuggerUrl);
                ws.onopen = () => {
                    setTimeout(() => {
                        // Switch view via Runtime.evaluate
                        ws.send(JSON.stringify({
                            id: 1,
                            method: 'Runtime.evaluate',
                            params: { expression: `window.game.camera.setPresetView('${viewName}')` }
                        }));

                        // Wait 1.5s for camera transition lerp and render
                        setTimeout(() => {
                            ws.send(JSON.stringify({ id: 10, method: 'Page.captureScreenshot' }));
                        }, 1500);
                    }, 2500);
                };

                ws.onmessage = (event) => {
                    const msg = JSON.parse(event.data);
                    if (msg.id === 10 && msg.result && msg.result.data) {
                        const outPath = `C:\\Users\\ASUS\\.gemini\\antigravity\\brain\\1e9f27f1-a3ae-4edf-ab8c-7330f77e6518\\${outputFileName}`;
                        fs.writeFileSync(outPath, Buffer.from(msg.result.data, 'base64'));
                        console.log(`Berhasil menangkap screenshot ${viewName} ke:`, outPath);
                        chrome.kill();
                        resolve(outPath);
                    }
                };

                ws.onerror = (err) => {
                    chrome.kill();
                    reject(err);
                };
            } catch (e) {
                chrome.kill();
                reject(e);
            }
        }, 1500);
    });
}

async function run() {
    await captureView('have', 'view_desa_have.png');
    await captureView('havenot', 'view_desa_havenot.png');
    console.log('Semua screenshot perspektif berhasil diambil!');
    process.exit(0);
}

run().catch(console.error);

