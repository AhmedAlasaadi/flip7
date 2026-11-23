// Flip 7 online — Cloudflare version. Static files come from ./public (Workers
// assets); every room is one Durable Object that holds the game and its WebSockets.
import { DurableObject } from 'cloudflare:workers';
import roomLib from '../room.js';

const { Room, dispatch, validCode } = roomLib;
const IDLE_MS = 6 * 60 * 60 * 1000;   // forget a room nobody has been connected to for this long

export class RoomDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.room = null;
    this.opts = {
      stepMs: env.STEP_MS ? Number(env.STEP_MS) : undefined,
      awayMs: env.AWAY_MS ? Number(env.AWAY_MS) : undefined,
      leadMs: env.LEAD_MS ? Number(env.LEAD_MS) : undefined,
      awardMs: env.AWARD_MS ? Number(env.AWARD_MS) : undefined,
      onSave: snap => { this.ctx.storage.put('room', snap); },
      onEmpty: () => { this.room = null; this.ctx.storage.deleteAll(); },
    };
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get('room');
      if (saved) this.room = Room.restore(saved, this.opts);
    });
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const code = new URL(request.url).searchParams.get('room');
    const pair = new WebSocketPair();
    const client = pair[0], socket = pair[1];
    socket.accept();
    const conn = {
      send: s => { try { socket.send(s); } catch (e) {} },
      close: () => { try { socket.close(1000, 'replaced'); } catch (e) {} },
    };
    const reg = { get: () => this.room, set: room => { this.room = room; }, opts: this.opts };
    socket.addEventListener('message', ev => {
      if (typeof ev.data !== 'string' || ev.data.length > 4096) return;
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      dispatch(conn, m, code, reg);
    });
    const gone = () => {
      if (conn.room) conn.room.drop(conn);
      if (this.room && !this.room.anyConnected()) this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
    };
    socket.addEventListener('close', gone);
    socket.addEventListener('error', gone);
    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm() {
    if (this.room && this.room.anyConnected()) return;
    if (this.room) this.room.opts.onEmpty = null, this.room.destroy();
    this.room = null;
    await this.ctx.storage.deleteAll();
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/healthz') return new Response('ok');
    if (url.pathname === '/ws') {
      const code = (url.searchParams.get('room') || '').toUpperCase();
      if (!validCode(code)) return new Response('Bad room code', { status: 400 });
      url.searchParams.set('room', code);
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(new Request(url, request));
    }
    return new Response('Not found', { status: 404 });
  },
};
