const { spawn } = require('child_process');

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--remote-debugging-port=9246', 'http://localhost:8417/'
]);

setTimeout(async () => {
    try {
        const resp = await fetch('http://localhost:9246/json');
        const list = await resp.json();
        const page = list.find(p => p.url.includes('localhost:8417'));
        const ws = new WebSocket(page.webSocketDebuggerUrl);

        ws.onopen = () => {
            setTimeout(() => {
                const evalCode = `
                (() => {
                    const names = {};
                    window.game.buildingLoader.buildingsGroup.traverse(c => {
                        if (c.isMesh || c.isLine) {
                            const name = c.name || (c.geometry ? c.geometry.type : 'unknown');
                            const matName = c.material ? (c.material.name || c.material.type) : 'no-mat';
                            const key = name + ' | ' + matName;
                            names[key] = (names[key] || 0) + 1;
                        }
                    });
                    return names;
                })()
                `;
                ws.send(JSON.stringify({
                    id: 1, method: 'Runtime.evaluate', params: { expression: evalCode, returnByValue: true }
                }));
            }, 3000);
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.id === 1 && msg.result && msg.result.result) {
                console.log('BUILDINGS DETAIL:');
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

