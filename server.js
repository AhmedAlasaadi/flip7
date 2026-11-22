'use strict';
// Flip 7 online — HTTP static server + WebSocket game server. All game state
// lives on the server; clients only send intents (hit / stay / target).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Game } = require('./engine');

const PORT = process.env.PORT || 3000;
const STEP_MS = Number(process.env.STEP_MS || 950);      // pause between automatic card flips
const AWAY_MS = Number(process.env.AWAY_MS || 20000);    // disconnected player is auto-played after this
const MAX_PLAYERS = 12;
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
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const rid = n => crypto.randomBytes(n).toString('hex');
function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += ALPHA[crypto.randomInt(ALPHA.length)];
    if (!rooms.has(c)) return c;
  }
}
const cleanName = s => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Player';

function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

function broadcast(room) {
  const base = {
    t: 'state',
    room: {
      code: room.code, hostId: room.hostId, target: room.target,
      players: room.players.map(p => ({ id: p.id, name: p.name, ready: p.ready, connected: p.connected })),
    },
    game: room.game ? room.game.view() : null,
  };
  for (const p of room.players) send(p.ws, { ...base, you: p.id });
  room.touched = Date.now();
}

function pump(room) {
  if (room.stepTimer) return;
  const tick = () => {
    room.stepTimer = null;
    if (!room.game) return;
    const r = room.game.step();
    broadcast(room);
    if (r === 'more') room.stepTimer = setTimeout(tick, STEP_MS);
    else watchAway(room);
  };
  tick();
}

// If the game is waiting on someone who is disconnected, play for them after a grace period.
function watchAway(room) {
  clearTimeout(room.awayTimer);
  room.awayTimer = null;
  const g = room.game;
  if (!g) return;
  const pid = g.current();
  if (!pid) return;
  const pl = room.players.find(p => p.id === pid);
  if (pl && pl.connected) return;
  room.awayTimer = setTimeout(() => {
    room.awayTimer = null;
    if (!room.game || room.game.current() !== pid) return;
    const still = room.players.find(p => p.id === pid);
    if (still && still.connected) return;
    if (g.phase === 'turn') g.stay(pid);
    else if (g.phase === 'choose') {
      const v = g.view().chooser;
      g.choose(pid, v.targets.includes(pid) ? pid : v.targets[0]);
    }
    pump(room);
  }, pl && pl.left ? 1200 : AWAY_MS);
}

function removeFromLobby(room, pl) {
  room.players = room.players.filter(p => p !== pl);
  if (!room.players.length) { rooms.delete(room.code); return; }
  if (room.hostId === pl.id) room.hostId = room.players[0].id;
  broadcast(room);
}

function attach(ws, room, pl) {
  if (pl.ws && pl.ws !== ws) { pl.ws.player = null; try { pl.ws.close(); } catch (e) {} }
  clearTimeout(pl.dropTimer);
  pl.ws = ws; pl.connected = true; pl.left = false;
  ws.room = room; ws.player = pl;
  send(ws, { t: 'joined', code: room.code, you: pl.id, token: pl.token });
  broadcast(room);
  watchAway(room);
}

const handlers = {
  create(ws, m) {
    if (ws.player) return;
    const room = { code: newCode(), players: [], hostId: null, target: 200, game: null, stepTimer: null, awayTimer: null, touched: Date.now() };
    rooms.set(room.code, room);
    const pl = { id: rid(4), token: rid(12), name: cleanName(m.name), ready: false, connected: true, ws: null };
    room.players.push(pl);
    room.hostId = pl.id;
    attach(ws, room, pl);
  },
  join(ws, m) {
    if (ws.player) return;
    const room = rooms.get(String(m.code || '').toUpperCase().trim());
    if (!room) return send(ws, { t: 'error', code: 'noroom', msg: 'Room not found. Check the code and try again.' });
    if (m.token) {
      const old = room.players.find(p => p.token === m.token);
      if (old) return attach(ws, room, old);
    }
    if (room.game) return send(ws, { t: 'error', code: 'started', msg: 'That game has already started.' });
    if (room.players.length >= MAX_PLAYERS) return send(ws, { t: 'error', code: 'full', msg: 'That room is full.' });
    const pl = { id: rid(4), token: rid(12), name: cleanName(m.name), ready: false, connected: true, ws: null };
    room.players.push(pl);
    attach(ws, room, pl);
  },
  ready(ws, m) {
    const { room, player } = ws;
    if (!room || room.game) return;
    player.ready = !!m.ready;
    broadcast(room);
  },
  config(ws, m) {
    const { room, player } = ws;
    if (!room || room.game || room.hostId !== player.id) return;
    const t = Number(m.target);
    if ([100, 150, 200, 300].includes(t)) room.target = t;
    broadcast(room);
  },
  start(ws) {
    const { room, player } = ws;
    if (!room || room.game || room.hostId !== player.id) return;
    if (room.players.length < 2) return send(ws, { t: 'error', msg: 'You need at least 2 players.' });
    if (room.players.some(p => p.id !== room.hostId && !p.ready)) return send(ws, { t: 'error', msg: 'Everyone needs to be ready first.' });
    room.game = new Game(room.players.map(p => ({ id: p.id, name: p.name })), { target: room.target });
    room.game.startRound();
    pump(room);
  },
  hit(ws) { const { room, player } = ws; if (room && room.game && room.game.hit(player.id)) pump(room); },
  stay(ws) { const { room, player } = ws; if (room && room.game && room.game.stay(player.id)) pump(room); },
  target(ws, m) { const { room, player } = ws; if (room && room.game && room.game.choose(player.id, String(m.pid))) pump(room); },
  next(ws) {
    const { room } = ws;
    if (room && room.game && room.game.phase === 'roundEnd' && room.game.startRound()) pump(room);
  },
  again(ws) {
    const { room } = ws;
    if (!room || !room.game || room.game.phase !== 'gameOver') return;
    room.game = null;
    room.players = room.players.filter(p => p.connected);
    for (const p of room.players) p.ready = false;
    if (!room.players.some(p => p.id === room.hostId)) room.hostId = room.players[0].id;
    broadcast(room);
  },
  leave(ws) {
    const { room, player } = ws;
    if (!room) return;
    ws.room = null; ws.player = null;
    player.ws = null; player.connected = false; player.left = true;
    send(ws, { t: 'left' });
    if (!room.game) removeFromLobby(room, player);
    else { broadcast(room); watchAway(room); }
  },
  ping(ws) { send(ws, { t: 'pong' }); },
};

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', ws => {
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    const h = handlers[m.t];
    if (!h) return;
    if (!ws.player && !['create', 'join', 'ping'].includes(m.t)) return;
    try { h(ws, m); } catch (e) { console.error('handler error', m.t, e); }
  });
  ws.on('close', () => {
    const { room, player } = ws;
    if (!room || !player || player.ws !== ws) return;
    player.ws = null; player.connected = false;
    if (!room.game) {
      // brief grace so a page refresh in the lobby does not lose the seat
      broadcast(room);
      player.dropTimer = setTimeout(() => { if (!player.connected && !room.game && rooms.get(room.code) === room) removeFromLobby(room, player); }, 8000);
    } else {
      broadcast(room);
      watchAway(room);
    }
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    try { ws.ping(); } catch (e) {}
  }
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (!room.players.some(p => p.connected) && now - room.touched > 10 * 60 * 1000) {
      clearTimeout(room.stepTimer); clearTimeout(room.awayTimer);
      rooms.delete(code);
    }
  }
}, 25000);

server.listen(PORT, () => console.log(`Flip 7 server listening on :${PORT}`));
