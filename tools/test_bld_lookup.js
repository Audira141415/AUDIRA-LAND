const { spawn } = require('child_process');

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--no-sandbox',
    '--remote-debugging-port=9250', 'http://localhost:8417/'
]);

setTimeout(async () => {
    try {
        const resp = await fetch('http://localhost:9250/json');
        const list = await resp.json();
        const page = list.find(p => p.url.includes('localhost:8417'));
        const ws = new WebSocket(page.webSocketDebuggerUrl);

        ws.onopen = () => {
            setTimeout(() => {
                const evalCode = `
                (() => {
                    const bld = window.game.buildingLoader.getBuildingAt('k12', 105, 107);
                    return {
                        buildingFound: !!bld,
                        buildingTitle: bld ? bld.title : null,
                        buildingType: bld ? bld.type : null,
                        totalLoadedBuildings: window.game.buildingLoader.loadedBuildings.size
                    };
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
                console.log('BUILDING LOOKUP RESULT:');
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
}, 2000);

