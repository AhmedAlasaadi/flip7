'use strict';
// Flip 7 online — Node version: HTTP static server + WebSocket game server.
// (The Cloudflare version lives in worker/index.js; both share room.js and engine.js.)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { dispatch, validCode } = require('./room');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

const rooms = new Map();
const opts = {
  stepMs: process.env.STEP_MS ? Number(process.env.STEP_MS) : undefined,
  awayMs: process.env.AWAY_MS ? Number(process.env.AWAY_MS) : undefined,
  onEmpty: room => rooms.delete(room.code),
};

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', (ws, req) => {
  const code = (new URL(req.url, 'http://x').searchParams.get('room') || '').toUpperCase();
  if (!validCode(code)) return ws.close();
  const reg = { get: () => rooms.get(code) || null, set: room => rooms.set(code, room), opts };
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    dispatch(ws, m, code, reg);
  });
  ws.on('close', () => { if (ws.room) ws.room.drop(ws); });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    try { ws.ping(); } catch (e) {}
  }
  const now = Date.now();
  for (const room of rooms.values()) if (!room.anyConnected() && now - room.touched > 10 * 60 * 1000) room.destroy();
}, 25000);

server.listen(PORT, () => console.log(`Flip 7 server listening on :${PORT}`));
