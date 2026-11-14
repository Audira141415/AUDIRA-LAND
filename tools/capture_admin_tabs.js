const { spawn } = require('child_process');
const fs = require('fs');

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--no-sandbox',
    '--window-size=1280,720',
    '--remote-debugging-port=9250',
    'http://localhost:8417/'
]);

setTimeout(async () => {
    try {
        const resp = await fetch('http://localhost:9250/json');
        const list = await resp.json();
        const page = list.find(p => p.url.includes('localhost:8417'));
        if (!page) {
            chrome.kill();
            process.exit(1);
        }

        const ws = new WebSocket(page.webSocketDebuggerUrl);
        ws.onopen = () => {
            setTimeout(() => {
                // Set Super Admin and show Tab 'citizens'
                ws.send(JSON.stringify({
                    id: 1,
                    method: 'Runtime.evaluate',
                    params: {
                        expression: `(() => {
                            window.playerState.setRole('super_admin');
                            window.game.adminModal.show('citizens');
                            return true;
                        })()`
                    }
                }));

                setTimeout(() => {
                    ws.send(JSON.stringify({ id: 10, method: 'Page.captureScreenshot' }));
                }, 400);
            }, 3000);
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);

            if (msg.id === 10 && msg.result && msg.result.data) {
                fs.writeFileSync('C:\\Users\\ASUS\\.gemini\\antigravity\\brain\\1e9f27f1-a3ae-4edf-ab8c-7330f77e6518\\admin_tab_citizens.png', Buffer.from(msg.result.data, 'base64'));
                console.log('Saved admin_tab_citizens.png');

                // Switch to Tab 'city'
                ws.send(JSON.stringify({
                    id: 2,
                    method: 'Runtime.evaluate',
                    params: {
                        expression: `window.game.adminModal.show('city');`
                    }
                }));

                setTimeout(() => {
                    ws.send(JSON.stringify({ id: 20, method: 'Page.captureScreenshot' }));
                }, 400);
            }

            if (msg.id === 20 && msg.result && msg.result.data) {
                fs.writeFileSync('C:\\Users\\ASUS\\.gemini\\antigravity\\brain\\1e9f27f1-a3ae-4edf-ab8c-7330f77e6518\\admin_tab_city.png', Buffer.from(msg.result.data, 'base64'));
                console.log('Saved admin_tab_city.png');

                // Switch to Tab 'broadcast'
                ws.send(JSON.stringify({
                    id: 3,
                    method: 'Runtime.evaluate',
                    params: {
                        expression: `window.game.adminModal.show('broadcast');`
                    }
                }));

                setTimeout(() => {
                    ws.send(JSON.stringify({ id: 30, method: 'Page.captureScreenshot' }));
                }, 400);
            }

            if (msg.id === 30 && msg.result && msg.result.data) {
                fs.writeFileSync('C:\\Users\\ASUS\\.gemini\\antigravity\\brain\\1e9f27f1-a3ae-4edf-ab8c-7330f77e6518\\admin_tab_broadcast.png', Buffer.from(msg.result.data, 'base64'));
                console.log('Saved admin_tab_broadcast.png');
                chrome.kill();
                process.exit(0);
            }
        };
    } catch (e) {
        chrome.kill();
        process.exit(1);
    }
}, 2000);

