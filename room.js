'use strict';
// One game room: lobby, players, turn pump, reconnects. Transport-agnostic so the
// same logic runs on the Node server (server.js) and on Cloudflare (worker/index.js).
// A "conn" is any object with send(string) and close().
const { Game } = require('./engine');

const MAX_PLAYERS = 12;
const rid = n => {
  const a = new Uint8Array(n);
  globalThis.crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
};
const cleanName = s => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Player';
const AVATARS = 12;
const cleanAvatar = v => { const n = Math.floor(Number(v)); return n >= 0 && n < AVATARS ? n : 0; };
const tx = (conn, msg) => { try { if (conn) conn.send(JSON.stringify(msg)); } catch (e) {} };

class Room {
  constructor(code, opts = {}) {
    this.code = code;
    this.opts = opts;
    this.stepMs = opts.stepMs == null ? 950 : opts.stepMs;   // pause between automatic flips
    this.awayMs = opts.awayMs == null ? 20000 : opts.awayMs; // grace before a disconnected player is auto-played
    this.players = [];
    this.hostId = null;
    this.target = 200;
    this.game = null;
    this.stepTimer = null;
    this.awayTimer = null;
    this.leadMs = opts.leadMs == null ? 2800 : opts.leadMs;     // pause between the last card and the awards
    this.awardMs = opts.awardMs == null ? 9500 : opts.awardMs;  // how long each award is on screen
    this.ceremony = null;
    this.cerTimer = null;
    this.touched = Date.now();
  }

  snapshot() {
    return {
      code: this.code, hostId: this.hostId, target: this.target,
      players: this.players.map(p => ({ id: p.id, token: p.token, name: p.name, avatar: p.avatar || 0, ready: p.ready, left: !!p.left })),
      game: this.game ? this.game.dump() : null,
      ceremony: this.ceremony,
    };
  }

  static restore(d, opts) {
    const r = new Room(d.code, opts);
    r.hostId = d.hostId; r.target = d.target;
    r.players = d.players.map(p => ({ ...p, connected: false, conn: null }));
    r.game = d.game ? Game.load(d.game) : null;
    r.ceremony = d.ceremony || null;
    return r;
  }

  anyConnected() { return this.players.some(p => p.connected); }

  broadcast() {
    const base = {
      t: 'state',
      room: { code: this.code, hostId: this.hostId, target: this.target, players: this.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar || 0, ready: p.ready, again: !!p.again, connected: p.connected })),
        ceremony: this.ceremony ? { idx: this.ceremony.idx, n: this.ceremony.n, done: this.ceremony.done, elapsed: Date.now() - this.ceremony.at } : null },
      game: this.game ? this.game.view() : null,
    };
    for (const p of this.players) if (p.conn) tx(p.conn, { ...base, you: p.id });
    this.touched = Date.now();
    if (this.opts.onSave) this.opts.onSave(this.snapshot());
  }

  pump() {
    if (this.stepTimer) return;
    const tick = () => {
      this.stepTimer = null;
      if (!this.game) return;
      const r = this.game.step();
      this.broadcast();
      if (r === 'more') this.stepTimer = setTimeout(tick, this.stepMs);
      else if (r === 'gameOver') this.startCeremony();
      else this.watchAway();
    };
    tick();
  }

  // ----- awards ceremony: one shared timeline, so every player sees the same award at the same time -----
  startCeremony() {
    if (this.ceremony) return;
    const n = (this.game.awards || []).length;
    this.ceremony = { idx: -1, n, done: n === 0, at: Date.now(), skips: [], skipAll: [] };
    this.broadcast();
    if (n) this.cerTimer = setTimeout(() => this.nextAward(), this.leadMs);
  }

  nextAward() {
    clearTimeout(this.cerTimer); this.cerTimer = null;
    const c = this.ceremony;
    if (!c || c.done) return;
    c.idx++; c.at = Date.now(); c.skips = [];
    if (c.idx >= c.n) { c.done = true; this.broadcast(); return; }
    this.broadcast();
    this.cerTimer = setTimeout(() => this.nextAward(), this.awardMs);
    this.checkSkips();
  }

  // Move on early once every connected player has skipped the current award.
  checkSkips() {
    const c = this.ceremony;
    if (!c || c.done || c.idx < 0) return;
    const live = this.players.filter(p => p.connected);
    if (live.length && live.every(p => c.skipAll.includes(p.id) || c.skips.includes(p.id))) this.nextAward();
  }

  resumeCeremony() {
    const c = this.ceremony;
    if (!c || c.done || this.cerTimer) return;
    const left = (c.idx < 0 ? this.leadMs : this.awardMs) - (Date.now() - c.at);
    this.cerTimer = setTimeout(() => this.nextAward(), Math.max(0, left));
  }

  // If the game is waiting on someone who is disconnected, play for them after a grace period.
  watchAway() {
    clearTimeout(this.awayTimer);
    this.awayTimer = null;
    const g = this.game;
    if (!g) return;
    const pid = g.current();
    if (!pid) return;
    const pl = this.players.find(p => p.id === pid);
    if (pl && pl.connected) return;
    this.awayTimer = setTimeout(() => {
      this.awayTimer = null;
      if (this.game !== g || g.current() !== pid) return;
      const still = this.players.find(p => p.id === pid);
      if (still && still.connected) return;
      if (g.phase === 'turn') g.stay(pid);
      else if (g.phase === 'choose') {
        const v = g.view().chooser;
        g.choose(pid, v.targets.includes(pid) ? pid : v.targets[0]);
      }
      this.pump();
    }, pl && pl.left ? 1200 : this.awayMs);
  }

  removeFromLobby(pl) {
    this.players = this.players.filter(p => p !== pl);
    if (!this.players.length) { this.destroy(); return; }
    if (this.hostId === pl.id) this.hostId = this.players[0].id;
    this.broadcast();
  }

  destroy() {
    clearTimeout(this.stepTimer); clearTimeout(this.awayTimer); clearTimeout(this.cerTimer);
    for (const p of this.players) clearTimeout(p.dropTimer);
    if (this.opts.onEmpty) this.opts.onEmpty(this);
  }

  // In the lobby, a player who stays disconnected for a few seconds loses the seat.
  armLobbyDrops() {
    if (this.game) return;
    for (const p of this.players) {
      if (p.connected || p.dropTimer) continue;
      p.dropTimer = setTimeout(() => { p.dropTimer = null; if (!p.connected && !this.game) this.removeFromLobby(p); }, 8000);
    }
  }

  attach(conn, pl) {
    if (pl.conn && pl.conn !== conn) { pl.conn.player = null; pl.conn.room = null; try { pl.conn.close(); } catch (e) {} }
    clearTimeout(pl.dropTimer); pl.dropTimer = null;
    pl.conn = conn; pl.connected = true; pl.left = false;
    conn.room = this; conn.player = pl;
    tx(conn, { t: 'joined', code: this.code, you: pl.id, token: pl.token });
    this.broadcast();
    this.armLobbyDrops();
    if (this.game && this.game.phase === 'auto' && !this.stepTimer) this.pump();   // resume after a restore
    else this.watchAway();
    this.resumeCeremony();
  }

  join(conn, m, creating) {
    if (m.token) {
      const old = this.players.find(p => p.token === m.token);
      if (old) return this.attach(conn, old);
    }
    if (this.game) return tx(conn, { t: 'error', code: 'started', msg: 'That game has already started.' });
    if (this.players.length >= MAX_PLAYERS) return tx(conn, { t: 'error', code: 'full', msg: 'That room is full.' });
    const pl = { id: rid(4), token: rid(12), name: cleanName(m.name), avatar: cleanAvatar(m.avatar), ready: false, connected: true, conn: null };
    this.players.push(pl);
    if (creating || !this.hostId) this.hostId = pl.id;
    this.attach(conn, pl);
  }

  drop(conn) {
    const pl = conn.player;
    if (!pl || pl.conn !== conn) return;
    pl.conn = null; pl.connected = false;
    this.broadcast();
    if (!this.game) this.armLobbyDrops(); else this.watchAway();
    this.checkSkips();
  }

  handle(conn, m) {
    const pl = conn.player, g = this.game;
    switch (m.t) {
      case 'avatar':
        pl.avatar = cleanAvatar(m.avatar);
        return this.broadcast();
      case 'ready':
        if (g) return;
        pl.ready = !!m.ready;
        return this.broadcast();
      case 'config': {
        if (g || this.hostId !== pl.id) return;
        const t = Number(m.target);
        if ([100, 150, 200, 300].includes(t)) this.target = t;
        return this.broadcast();
      }
      case 'start':
        if (g || this.hostId !== pl.id) return;
        if (this.players.length < 2) return tx(conn, { t: 'error', msg: 'You need at least 2 players.' });
        if (this.players.some(p => p.id !== this.hostId && !p.ready)) return tx(conn, { t: 'error', msg: 'Everyone needs to be ready first.' });
        this.game = new Game(this.players.map(p => ({ id: p.id, name: p.name })), { target: this.target });
        this.game.startRound();
        return this.pump();
      case 'hit': if (g && g.hit(pl.id)) this.pump(); return;
      case 'stay': if (g && g.stay(pl.id)) this.pump(); return;
      case 'target': if (g && g.choose(pl.id, String(m.pid))) this.pump(); return;
      case 'next': if (g && g.phase === 'roundEnd' && g.startRound()) this.pump(); return;
      case 'again':
        if (!g || g.phase !== 'gameOver') return;
        // Players say they want another game; the room only reopens when the host does.
        // (If the host has gone, the first player to ask becomes the host.)
        if (!this.players.some(p => p.id === this.hostId && p.connected)) this.hostId = pl.id;
        if (pl.id !== this.hostId) { pl.again = true; return this.broadcast(); }
        clearTimeout(this.cerTimer); this.cerTimer = null; this.ceremony = null;
        this.game = null;
        this.players = this.players.filter(p => p.connected);
        for (const p of this.players) { p.ready = false; p.again = false; }
        if (!this.players.some(p => p.id === this.hostId)) this.hostId = this.players[0].id;
        return this.broadcast();
      case 'cskip': {
        const c = this.ceremony;
        if (!c || c.done || Number(m.idx) !== c.idx) return;
        if (!c.skips.includes(pl.id)) c.skips.push(pl.id);
        return this.checkSkips();
      }
      case 'cskipall': {
        const c = this.ceremony;
        if (!c || c.done) return;
        if (!c.skipAll.includes(pl.id)) c.skipAll.push(pl.id);
        return this.checkSkips();
      }
      case 'leave':
        conn.room = null; conn.player = null;
        pl.conn = null; pl.connected = false; pl.left = true;
        tx(conn, { t: 'left' });
        if (!g) this.removeFromLobby(pl);
        else { this.broadcast(); this.watchAway(); }
        return;
    }
  }
}

// Routes one client message. reg = { get(): Room|null, set(room), opts }.
function dispatch(conn, m, code, reg) {
  if (!m || typeof m.t !== 'string') return;
  if (m.t === 'ping') return tx(conn, { t: 'pong' });
  if (!conn.player) {
    if (m.t === 'create') {
      if (reg.get()) return tx(conn, { t: 'error', code: 'taken', msg: 'That room code is already in use.' });
      const room = new Room(code, reg.opts);
      reg.set(room);
      return room.join(conn, m, true);
    }
    if (m.t === 'join') {
      const room = reg.get();
      if (!room) return tx(conn, { t: 'error', code: 'noroom', msg: 'Room not found. Check the code and try again.' });
      return room.join(conn, m);
    }
    return;
  }
  try { conn.room.handle(conn, m); } catch (e) { console.error('handler error', m.t, e); }
}

const validCode = c => /^[A-HJ-NP-Z]{4}$/.test(c || '');

module.exports = { Room, dispatch, validCode };
