const { spawn } = require('child_process');
const fs = require('fs');

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--no-sandbox',
    '--window-size=1280,720',
    '--remote-debugging-port=9235',
    'http://localhost:8417/'
]);

setTimeout(async () => {
    try {
        const resp = await fetch('http://localhost:9235/json');
        const list = await resp.json();
        const page = list.find(p => p.url.includes('localhost:8417'));
        if (!page) {
            console.error('Page target tidak ditemukan!');
            chrome.kill();
            process.exit(1);
        }

        const ws = new WebSocket(page.webSocketDebuggerUrl);
        ws.onopen = () => {
            console.log('Terkoneksi ke CDP WebSocket. Menunggu 4 detik untuk initial render...');
            setTimeout(() => {
                // Evaluasi telemetri
                ws.send(JSON.stringify({
                    id: 1,
                    method: 'Runtime.evaluate',
                    params: {
                        expression: 'JSON.stringify({ fps: window.game?.renderer?.fps, drawCalls: window.game?.renderer?.drawCalls, triangles: window.game?.renderer?.triangles, buildingsCount: window.game?.buildingLoader?.loadedBuildings?.size })'
                    }
                }));

                // Capture Screenshot
                ws.send(JSON.stringify({ id: 10, method: 'Page.captureScreenshot' }));
            }, 4000);
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.id === 1 && msg.result && msg.result.result) {
                console.log('TELEMETRY STATS:', msg.result.result.value);
            }
            if (msg.id === 10 && msg.result && msg.result.data) {
                const outPath = 'C:\\Users\\ASUS\\.gemini\\antigravity\\brain\\1e9f27f1-a3ae-4edf-ab8c-7330f77e6518\\optimized_perf_screen.png';
                fs.writeFileSync(outPath, Buffer.from(msg.result.data, 'base64'));
                console.log('SUCCESSFULLY CAPTURED OPTIMIZED SCREENSHOT TO:', outPath);
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
