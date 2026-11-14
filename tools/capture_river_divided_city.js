const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9222;
const TARGET_URL = "http://localhost:8417/";
const OUTPUT_PNG = "C:\\Users\\ASUS\\.gemini\\antigravity\\brain\\1e9f27f1-a3ae-4edf-ab8c-7330f77e6518\\river_divided_city.png";

async function main() {
    console.log("Menjalankan Chrome headless...");
    const chrome = spawn(CHROME_PATH, [
        '--headless=new',
        `--remote-debugging-port=${PORT}`,
        '--window-size=1280,720',
        '--disable-gpu',
        '--no-sandbox',
        TARGET_URL
    ]);

    // Tunggu Chrome siap
    await new Promise(r => setTimeout(r, 2000));

    // Dapatkan webSocketDebuggerUrl
    const list = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${PORT}/json`, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });

    console.log("Daftar target:", list.map(t => t.url));
    const pageTarget = list.find(t => t.type === 'page');
    if (!pageTarget) {
        console.error("Tidak ada page target ditemukan!");
        chrome.kill();
        return;
    }

    const wsUrl = pageTarget.webSocketDebuggerUrl;
    console.log("WebSocket URL:", wsUrl);

    // Gunakan modul 'ws' jika ada, atau gunakan node https/ws bawaan atau script python
    chrome.kill();
}

main().catch(console.error);

