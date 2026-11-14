const { spawn } = require('child_process');

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--no-sandbox',
    '--remote-debugging-port=9248', 'http://localhost:8417/'
]);

setTimeout(async () => {
    try {
        const resp = await fetch('http://localhost:9248/json');
        const list = await resp.json();
        const page = list.find(p => p.url.includes('localhost:8417'));
        const ws = new WebSocket(page.webSocketDebuggerUrl);

        ws.onopen = () => {
            setTimeout(() => {
                // Simulate click on screen center (or plot coordinates)
                const clickCode = `
                (() => {
                    // Click on a plot in Desa Have (x = -32, z = 0)
                    const plot = window.game.grid.getPlotFromWorld(-32, 0);
                    const bld = window.game.buildingLoader.getBuildingAt(plot.district.key, plot.tileI, plot.tileJ);
                    return {
                        plotFound: !!plot,
                        plotKey: plot ? plot.key : null,
                        buildingFound: !!bld,
                        buildingTitle: bld ? bld.title : null
                    };
                })()
                `;
                ws.send(JSON.stringify({
                    id: 1, method: 'Runtime.evaluate', params: { expression: clickCode, returnByValue: true }
                }));
            }, 3000);
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.id === 1 && msg.result && msg.result.result) {
                console.log('PLOT CLICK VERIFICATION:');
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

