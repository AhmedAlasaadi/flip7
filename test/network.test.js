'use strict';
// End-to-end test: real server process, real WebSocket clients playing a full game.
const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws');

// TEST_URL=host:port runs the same checks against an already-running server (e.g. wrangler dev).
const EXT = process.env.TEST_URL;
const PORT = 4100 + Math.floor(Math.random() * 500);
const HOST = EXT || `127.0.0.1:${PORT}`;
const srv = EXT ? { kill() {}, stdout: { once(_, r) { r(); } } } : spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, STEP_MS: 3, AWAY_MS: 150, LEAD_MS: 40, AWARD_MS: 250 }, stdio: ['ignore', 'pipe', 'inherit'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));

function client(name) {
  const c = { name, state: null, you: null, token: null, errors: [], bot: true };
  c.connect = code => new Promise(res => {
    c.ws = new WebSocket(`ws://${HOST}/ws?room=${code}`);
    c.ws.on('open', res);
    c.ws.on('message', raw => {
      const m = JSON.parse(raw);
      if (m.t === 'joined') { c.you = m.you; c.token = m.token; c.code = m.code; }
      if (m.t === 'error') c.errors.push(m);
      if (m.t === 'state') { c.state = m; if (c.bot) play(c); }
    });
  });
  c.send = m => c.ws.send(JSON.stringify(m));
  return c;
}
function play(c) {
  const g = c.state.game;
  if (!g) return;
  if (g.phase === 'turn' && g.turnId === c.you) {
    const me = g.players.find(p => p.id === c.you);
    c.send({ t: me.nums.length < 4 ? 'hit' : (Math.random() < 0.5 ? 'hit' : 'stay') });
  } else if (g.phase === 'choose' && g.chooser.ownerId === c.you) {
    const others = g.chooser.targets.filter(t => t !== c.you);
    c.send({ t: 'target', pid: g.chooser.card.k === 'freeze' && others.length ? others[0] : g.chooser.targets[0] });
  } else if (g.phase === 'roundEnd' && c.state.room.hostId === c.you) {
    c.send({ t: 'next' });
  }
}
const until = async (fn, what, ms = 20000) => {
  const t0 = Date.now();
  while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timeout: ' + what); await sleep(10); }
};

(async () => {
  await new Promise(r => srv.stdout.once('data', r));
  const res = await fetch(`http://${HOST}/`);
  assert.strictEqual(res.status, 200);
  assert((await res.text()).includes('Flip 7'));
  assert.strictEqual((await fetch(`http://${HOST}/server.js`)).status, 404);
  assert.strictEqual((await fetch(`http://${HOST}/healthz`)).status, 200);

  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const pick = () => Array.from({ length: 4 }, () => L[Math.floor(Math.random() * L.length)]).join('');
  const CODE = pick(), NOPE = pick();
  const [a, b, c, late] = ['Abu', 'Sara', 'Omar', 'Late'].map(client);
  const ghost = client('Ghost');
  await ghost.connect(NOPE);
  ghost.send({ t: 'join', name: 'Ghost' });
  await until(() => ghost.errors.length === 1, 'bad room error');
  assert.strictEqual(ghost.errors[0].code, 'noroom');

  await a.connect(CODE);
  a.send({ t: 'create', name: 'Abu' });
  await until(() => a.code, 'room created');
  assert.strictEqual(a.code, CODE);
  await Promise.all([b.connect(CODE.toLowerCase()), c.connect(CODE), late.connect(CODE)]);
  late.send({ t: 'create', name: 'Late' });
  await until(() => late.errors.length === 1, 'code already taken');
  assert.strictEqual(late.errors[0].code, 'taken');
  b.send({ t: 'join', name: 'Sara' });
  await until(() => a.state && a.state.room.players.length === 2, 'second player in');
  c.send({ t: 'join', name: '<b>Omar</b>' });
  await until(() => a.state && a.state.room.players.length === 3, 'lobby has 3');
  assert.strictEqual(a.state.room.players[2].name, 'bOmar/b');   // markup stripped
  assert.strictEqual(a.state.room.hostId, a.you);

  a.send({ t: 'start' });                                        // not everyone ready
  await until(() => a.errors.length === 1, 'not-ready error');
  b.send({ t: 'start' });                                        // non-host cannot start
  b.send({ t: 'ready', ready: true }); c.send({ t: 'ready', ready: true });
  await until(() => a.state.room.players.filter(p => p.ready).length === 2, 'ready flags sync');
  assert.strictEqual(a.state.game, null);
  a.send({ t: 'config', target: 100 });
  await until(() => c.state.room.target === 100, 'target synced');
  a.send({ t: 'start' });
  await until(() => c.state.game, 'game started for everyone');
  console.log('  ok lobby, ready states, host-only start');

  late.send({ t: 'join', name: 'Late' });
  await until(() => late.errors.length === 2, 'late join refused');
  assert.strictEqual(late.errors[1].code, 'started');

  // Sara drops mid-game and comes back on a new socket with her token.
  await until(() => a.state.game.round >= 2, 'reach round 2');
  b.ws.terminate();
  await until(() => a.state.room.players.find(p => p.id === b.you).connected === false, 'others see the disconnect');
  const r3 = a.state.game.round;
  await until(() => a.state.game.round > r3 || a.state.game.phase === 'gameOver', 'game keeps moving while she is away');
  const b2 = client('Sara');
  await b2.connect(CODE);
  b2.send({ t: 'join', token: b.token, name: 'x' });
  await until(() => b2.you === b.you && b2.state && b2.state.game, 'rejoined with same identity');
  console.log('  ok disconnect is auto-played, reconnect restores the seat');

  await until(() => a.state.game.phase === 'gameOver', 'game over', 60000);
  await sleep(100);
  const views = [a, b2, c].map(x => JSON.stringify({ ...x.state, you: 0 }));
  assert(views[0] === views[1] && views[1] === views[2], 'all clients hold the same state');
  const g = a.state.game;
  const win = g.players.find(p => p.id === g.winnerId);
  assert(win.total >= 100 && g.players.every(p => p === win || p.total < win.total));
  console.log(`  ok full game played over the network (${g.round} rounds, winner ${win.total})`);

  // Awards: six, from real stats, and the ceremony advances on a shared timeline.
  assert.deepStrictEqual(g.awards.map(x => x.key), ['gambler', 'nerd', 'luckiest', 'unluckiest', 'comeback', 'champion']);
  for (const aw of g.awards) assert(g.players.some(p => p.id === aw.pid) && aw.stat.length > 3, 'award has a real recipient and stat');
  assert.strictEqual(g.awards[5].pid, g.winnerId);
  const seenIdx = new Set();
  const watch = setInterval(() => { for (const x of [a, b2, c]) if (x.state.room.ceremony) seenIdx.add(x.state.room.ceremony.idx); }, 5);
  await until(() => a.state.room.ceremony && a.state.room.ceremony.idx >= 1, 'ceremony advances by itself');
  assert.strictEqual(a.state.room.ceremony.idx, c.state.room.ceremony.idx);
  for (const x of [a, b2, c]) x.send({ t: 'cskipall' });                 // everyone skips -> finishes at once
  await until(() => [a, b2, c].every(x => x.state.room.ceremony.done), 'ceremony ends when all skip', 1500);
  clearInterval(watch);
  console.log('  ok awards chosen from stats; ceremony synchronised, skippable (' + g.awards.map(x => x.stat).join(' | ') + ')');

  // Play again: a player asking only marks them as waiting; the room reopens when the host asks.
  c.send({ t: 'again' });
  await until(() => a.state.room.players.find(p => p.id === c.you).again === true, 'player is marked as waiting');
  assert(a.state.game && a.state.game.phase === 'gameOver', 'room stays on the credits until the host acts');
  a.send({ t: 'again' });
  await until(() => c.state.game === null && c.state.room.players.every(p => !p.ready && !p.again), 'host reopens the room for everyone');
  console.log('  ok play again waits for the host');
  c.send({ t: 'leave' });
  await until(() => a.state.room.players.length === 2, 'leave removes from lobby');
  a.ws.close();
  await until(() => b2.state.room.players.find(p => p.id === a.you).connected === false, 'host drop seen');
  console.log('  ok play again, leave');
  console.log('network: all passed');
  srv.kill(); process.exit(0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
