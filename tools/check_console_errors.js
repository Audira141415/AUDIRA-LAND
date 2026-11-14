const { spawn } = require('child_process');

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-webgpu',
    '--enable-webgl',
    '--remote-debugging-port=9266',
    'http://localhost:8417/'
]);

setTimeout(async () => {
    try {
        const resp = await fetch('http://localhost:9266/json');
        const list = await resp.json();
        const page = list.find(p => p.url.includes('localhost:8417'));
        if (!page) {
            console.error('Page target not found!');
            chrome.kill();
            process.exit(1);
        }

        const ws = new WebSocket(page.webSocketDebuggerUrl);
        ws.onopen = () => {
            console.log('Connected to CDP');
            ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
            ws.send(JSON.stringify({ id: 2, method: 'Console.enable' }));
            ws.send(JSON.stringify({ id: 3, method: 'Log.enable' }));

            setTimeout(() => {
                ws.send(JSON.stringify({
                    id: 4,
                    method: 'Runtime.evaluate',
                    params: {
                        expression: `(() => {
                            return {
                                hasCanvas: !!document.getElementById('canvas-3d'),
                                gameExists: !!window.game,
                                buildingsCount: window.game && window.game.buildingLoader ? window.game.buildingLoader.loadedBuildings.size : 0,
                                errorMsg: window.__lastError || null
                            };
                        })()`,
                        returnByValue: true
                    }
                }));
            }, 3000);
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.method === 'Runtime.consoleAPICalled') {
                console.log('[Browser Console]', msg.params.type, msg.params.args.map(a => a.value || a.description));
            } else if (msg.method === 'Runtime.exceptionThrown') {
                console.error('[Browser Exception]', msg.params.exceptionDetails);
            } else if (msg.id === 4) {
                console.log('[Eval Result]', msg.result);
                chrome.kill();
                process.exit(0);
            }
        };
    } catch (err) {
        console.error(err);
        chrome.kill();
        process.exit(1);
    }
}, 1500);

