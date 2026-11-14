const { spawn } = require('child_process');

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1280,720',
    '--remote-debugging-port=9238',
    'http://localhost:8417/'
]);

setTimeout(async () => {
    try {
        const resp = await fetch('http://localhost:9238/json');
        const list = await resp.json();
        const page = list.find(p => p.url.includes('localhost:8417'));
        const ws = new WebSocket(page.webSocketDebuggerUrl);

        ws.onopen = () => {
            setTimeout(() => {
                const evalCode = `
                (() => {
                    const counts = {};
                    window.game.scene.traverse(node => {
                        if (node.isMesh || node.isLine || node.isPoints) {
                            let p = node.parent;
                            let name = (p && p.name) ? p.name : (node.name || 'unnamed');
                            while (p && p.parent && p.parent !== window.game.scene) {
                                p = p.parent;
                                if (p.name) name = p.name;
                            }
                            counts[name] = (counts[name] || 0) + 1;
                        }
                    });
                    return { counts, totalRenderCalls: window.game.renderer.drawCalls };
                })()
                `;
                ws.send(JSON.stringify({
                    id: 1,
                    method: 'Runtime.evaluate',
                    params: { expression: evalCode, returnByValue: true }
                }));
            }, 3000);
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.id === 1 && msg.result && msg.result.result) {
                console.log('DRAW CALL AUDIT BREAKDOWN:');
                console.log(JSON.stringify(msg.result.result.value, null, 2));
                chrome.kill();
                process.exit(0);
            }
        };
    } catch (e) {
        console.error(e);
        chrome.kill();
        process.exit(1);
    }
}, 2500);

