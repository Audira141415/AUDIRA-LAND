// AUDIRA LAND · WebSocket minimal (RFC 6455) tanpa dependensi.
// Hanya frame teks utuh (tanpa fragmentasi), payload kecil, ping/pong, close.
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_BUFFERED = 1 << 20; // klien lambat: putus kalau antrean kirim > 1 MB

export function acceptUpgrade(req, socket, { maxPayload = 4096 } = {}) {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket' || req.headers['sec-websocket-version'] !== '13') {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return null;
  }
  const accept = createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  return new WsConn(socket, maxPayload);
}

export class WsConn extends EventEmitter {
  constructor(socket, max) {
    super();
    this.s = socket; this.max = max; this.buf = Buffer.alloc(0);
    this.open = true; this.alive = true; this._done = false;
    socket.on('data', d => this._data(d));
    socket.on('close', () => this._closed());
    socket.on('error', () => this._closed());
  }
  _data(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (this.open) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; if (b.readUInt32BE(2)) return this.close(1009); len = b.readUInt32BE(6); off = 10; }
      if (!masked) return this.close(1002);        // klien wajib menyamarkan frame
      if (len > this.max) return this.close(1009);
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      const payload = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);
      if (!fin || op === 0) return this.close(1003);
      if (op === 1) this.emit('message', payload.toString('utf8'));
      else if (op === 8) return this.close(1000);
      else if (op === 9) this._frame(10, payload);
      else if (op === 10) this.alive = true;
      else return this.close(1003);
    }
  }
  _frame(op, payload) {
    if (!this.open || this.s.destroyed) return;
    if (this.s.writableLength > MAX_BUFFERED) { this.s.destroy(); return this._closed(); }
    const len = payload.length;
    let h;
    if (len < 126) h = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(len, 2); }
    else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeUInt32BE(0, 2); h.writeUInt32BE(len, 6); }
    this.s.write(Buffer.concat([h, payload]));
  }
  send(str) { this._frame(1, Buffer.from(str, 'utf8')); }
  ping() { this._frame(9, Buffer.alloc(0)); }
  close(code = 1000) {
    if (!this.open) return;
    const p = Buffer.alloc(2); p.writeUInt16BE(code);
    this._frame(8, p);
    this.open = false;
    this.s.end();
    setTimeout(() => this.s.destroy(), 1000).unref();
    this._closed();
  }
  _closed() {
    if (this._done) return;
    this._done = true; this.open = false;
    this.emit('close');
  }
}
