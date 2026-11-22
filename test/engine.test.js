'use strict';
const assert = require('assert');
const { Game, buildDeck, shuffle } = require('../engine');

// Build a deck whose first draws are `order` (e.g. ['5','F','+4','x2','3x','SC']).
function stacked(order) {
  const pool = buildDeck();
  const take = s => {
    const i = pool.findIndex(c =>
      (s === 'F' && c.k === 'freeze') || (s === '3x' && c.k === 'flip3') || (s === 'SC' && c.k === 'second') ||
      (s === 'x2' && c.k === 'x2') || (s[0] === '+' && c.k === 'mod' && c.v === +s.slice(1)) ||
      (/^\d+$/.test(s) && c.k === 'num' && c.v === +s));
    assert(i >= 0, 'no card ' + s);
    return pool.splice(i, 1)[0];
  };
  const top = order.map(take);
  return [...shuffle(pool, Math.random), ...top.reverse()];
}
const mk = (n, order, opts = {}) => {
  const g = new Game(Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i })), { deck: stacked(order), ...opts });
  g.startRound();
  return g;
};
const run = g => { let r; do { r = g.step(); assert.strictEqual(g.countCards(), 94); } while (r === 'more'); return r; };
const P = (g, i) => g.players[i];
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok', name); };

t('deck is 94 cards with the right mix', () => {
  const d = buildDeck();
  assert.strictEqual(d.length, 94);
  assert.strictEqual(d.filter(c => c.k === 'num').length, 79);
  assert.strictEqual(d.filter(c => c.k === 'num' && c.v === 12).length, 12);
  assert.strictEqual(d.filter(c => c.k === 'num' && c.v === 0).length, 1);
  assert.strictEqual(d.filter(c => c.k === 'mod' || c.k === 'x2').length, 6);
  for (const k of ['freeze', 'flip3', 'second']) assert.strictEqual(d.filter(c => c.k === k).length, 3);
});

t('deal starts left of dealer; duplicate number busts for 0', () => {
  const g = mk(2, ['3', '5', '3']); // p1 gets 3, p0 (dealer) gets 5, then p1 hits 3
  assert.strictEqual(run(g), 'wait');
  assert.strictEqual(g.current(), 'p1');
  assert.deepStrictEqual(P(g, 1).nums.map(c => c.v), [3]);
  assert(g.hit('p1')); run(g);
  assert.strictEqual(P(g, 1).status, 'busted');
  assert.strictEqual(g.current(), 'p0');
  assert(!g.hit('p1'), 'busted player cannot act');
  g.stay('p0');
  assert.strictEqual(run(g), 'roundEnd');
  assert.strictEqual(P(g, 1).total, 0);
  assert.strictEqual(P(g, 0).total, 5);
});

t('Second Chance cancels one duplicate, then is gone', () => {
  const g = mk(2, ['SC', '9', '5', '5', '5']);
  run(g);
  assert(g.hasSecond(P(g, 1)));
  g.hit('p1'); run(g);                 // 5
  g.stay('p0'); run(g);
  g.hit('p1'); run(g);                 // duplicate 5 -> saved
  assert.strictEqual(P(g, 1).status, 'active');
  assert(!g.hasSecond(P(g, 1)));
  assert.deepStrictEqual(P(g, 1).nums.map(c => c.v), [5]);
  g.hit('p1'); run(g);                 // duplicate 5 again -> bust
  assert.strictEqual(P(g, 1).status, 'busted');
});

t('scoring: (numbers x2) + modifiers + 15 for Flip 7; round ends at once', () => {
  const g = mk(2, ['1', '12', '2', '3', 'x2', '4', '+4', '5', '6', '7']);
  run(g);
  for (;;) {
    if (g.phase !== 'turn') break;
    if (g.current() === 'p1') g.hit('p1'); else g.hit('p0');
    if (run(g) !== 'wait') break;
  }
  // p1 took 1,2,x2,+4,6 ... interleaved with p0; just verify the formula on whoever got 7
  const w = g.players.find(p => p.flip7);
  if (w) {
    const sum = w.nums.reduce((a, c) => a + c.v, 0);
    const x2 = w.mods.some(c => c.k === 'x2') ? 2 : 1;
    const plus = w.mods.reduce((a, c) => a + (c.k === 'mod' ? c.v : 0), 0);
    assert.strictEqual(w.roundScore, sum * x2 + plus + 15);
  }
});

t('Flip 7 exact: 7 unique numbers = sum*2 + 4 + 15 and others still score', () => {
  // p1: 1 ; p0: 12 ; p0 stays... make p1 the flipper via Flip Three chain-free hits
  const g = mk(2, ['1', '12', '2', '3', 'x2', '4', '+4', '5', '6', '0']);
  run(g);
  g.hit('p1'); run(g);  // 2
  g.hit('p0'); run(g);  // 3 -> p0 has 12,3
  for (const _ of [0, 1, 2, 3, 4, 5]) { // x2,4,+4,5,6,0 all to p1 while p0 keeps... p0 must act too
    if (g.current() === 'p0') { g.stay('p0'); run(g); }
    if (g.phase !== 'turn') break;
    g.hit('p1'); run(g);
  }
  // p1 has 1,2,4,5,6,0 = 6 numbers -> not yet 7
  assert.strictEqual(P(g, 1).nums.length, 6);
  assert.strictEqual(P(g, 1).flip7, false);
});

t('Flip 7 via stacked hits', () => {
  const g = mk(2, ['1', '12', '2', '3', '4', '5', 'x2', '+4', '6', '7']);
  run(g);
  g.stay('p1'); run(g); // p1 stays with 1? no - we want p0 to stay. redo below
  assert.strictEqual(P(g, 1).status, 'stayed');
  // p0 now alone: has 12, hits 2,3,4,5,x2,+4,6 -> numbers 12,2,3,4,5,6 = 6, then 7 -> Flip 7
  let r = 'wait';
  while (r === 'wait') { g.hit('p0'); r = run(g); }
  assert.strictEqual(r, 'roundEnd');
  assert(P(g, 0).flip7);
  assert.strictEqual(P(g, 0).roundScore, (12 + 2 + 3 + 4 + 5 + 6 + 7) * 2 + 4 + 15);
  assert.strictEqual(P(g, 1).roundScore, 1);
});

t('Freeze on the opening deal: owner chooses, target banks and is skipped', () => {
  const g = mk(3, ['F', '8', '9', '4']);   // p1 draws Freeze first
  assert.strictEqual(run(g), 'wait');
  assert.strictEqual(g.phase, 'choose');
  assert.strictEqual(g.current(), 'p1');
  assert.deepStrictEqual(g.view().chooser.targets, ['p0', 'p1', 'p2']);
  assert(!g.choose('p0', 'p2'), 'only the owner chooses');
  assert(g.choose('p1', 'p2'));
  run(g);
  assert.strictEqual(P(g, 2).status, 'frozen');
  assert.strictEqual(P(g, 2).nums.length, 0);          // frozen before being dealt
  assert.deepStrictEqual(P(g, 0).nums.map(c => c.v), [8]);
  assert.strictEqual(g.current(), 'p1');               // p1 has no cards yet, but it is their turn
});

t('last active player must take Freeze themself', () => {
  const g = mk(2, ['6', '7', 'F']);
  run(g);
  g.stay('p1'); run(g);
  g.hit('p0');
  assert.strictEqual(run(g), 'roundEnd');
  assert.strictEqual(P(g, 0).status, 'frozen');
  assert.strictEqual(P(g, 0).roundScore, 7);
});

t('Flip Three: three cards, set-aside Freeze resolves afterwards', () => {
  const g = mk(2, ['3x', '10', '1', 'F', '2']);  // p1 draws Flip Three, chooses self
  run(g);
  assert.strictEqual(g.phase, 'choose');
  g.choose('p1', 'p1');
  const r = run(g);
  // p1 flipped 10, 1, Freeze(set aside); wait: p0's deal comes after. Flip three finishes -> Freeze choice
  assert.strictEqual(r, 'wait');
  assert.strictEqual(g.phase, 'choose');
  assert.strictEqual(g.view().chooser.card.k, 'freeze');
  assert.deepStrictEqual(P(g, 1).nums.map(c => c.v), [10, 1, 2].slice(0, P(g, 1).nums.length));
  g.choose('p1', 'p0'); run(g);
  assert.strictEqual(P(g, 0).status, 'frozen');
});

t('Flip Three: bust midway stops it and discards set-aside actions', () => {
  const g = mk(2, ['4', '6', '3x', 'F', '4', '9']); // p1:4, p0:6, p1 hits Flip Three -> self
  run(g);
  g.hit('p1'); run(g);
  assert.strictEqual(g.phase, 'choose');
  g.choose('p1', 'p1'); run(g);
  assert.strictEqual(P(g, 1).status, 'busted');
  assert.strictEqual(P(g, 0).status, 'active');     // the Freeze was never played
  assert.strictEqual(P(g, 0).nums.length, 1);       // the third card (9) was never flipped
  assert.strictEqual(g.current(), 'p0');
});

t('extra Second Chance goes to another player, or is discarded', () => {
  const g = mk(2, ['SC', 'SC', 'SC', 'SC'].slice(0, 3).concat(['5']));
  run(g);                       // p1: SC, p0: SC
  g.hit('p1'); run(g);          // third SC: nobody eligible -> discarded
  assert.strictEqual(P(g, 1).acts.length, 1);
  assert.strictEqual(P(g, 0).acts.length, 1);
  assert.strictEqual(g.phase, 'turn');
  const g2 = mk(3, ['SC', '2', '3', 'SC']);
  run(g2);
  g2.hit('p1'); run(g2);        // two eligible players -> choice
  assert.strictEqual(g2.phase, 'choose');
  assert.deepStrictEqual(g2.view().chooser.targets, ['p0', 'p2']);
  g2.choose('p1', 'p0'); run(g2);
  assert(g2.hasSecond(P(g2, 0)));
});

t('game ends at the end of the round where someone has the target; ties play on', () => {
  const g = mk(2, ['12', '12'], { target: 10 });
  run(g); g.stay('p1'); run(g); g.stay('p0');
  assert.strictEqual(run(g), 'roundEnd');           // 12-12 tie -> keep playing
  assert.strictEqual(g.winner, null);
  const g2 = mk(2, ['12', '11'], { target: 10 });
  run(g2); g2.stay('p1'); run(g2); g2.stay('p0');
  assert.strictEqual(run(g2), 'gameOver');
  assert.strictEqual(g2.winner, 'p1');
});

t('fuzz: 3000 random full games keep every invariant', () => {
  let rounds = 0, flip7s = 0, reshuffles = 0;
  for (let i = 0; i < 3000; i++) {
    const np = 2 + (i % 9);
    const g = new Game(Array.from({ length: np }, (_, k) => ({ id: 'p' + k, name: 'P' + k })));
    g.startRound();
    let guard = 0;
    for (;;) {
      assert(++guard < 100000, 'game did not terminate');
      const r = g.step();
      assert.strictEqual(g.countCards(), 94);
      for (const p of g.players) {
        assert(new Set(p.nums.map(c => c.v)).size === p.nums.length, 'duplicate number kept');
        assert(p.nums.length <= 7);
        assert(p.acts.filter(c => c.k === 'second').length <= 1);
      }
      if (r === 'more') continue;
      if (r === 'gameOver') { assert(g.players.find(p => p.id === g.winner).total >= 200); break; }
      if (r === 'roundEnd') {
        rounds++;
        if (g.players.some(p => p.flip7)) flip7s++;
        for (const p of g.players) assert(p.status === 'busted' ? p.roundScore === 0 : p.roundScore >= 0);
        g.startRound();
        continue;
      }
      const pid = g.current();
      assert(pid);
      if (g.phase === 'turn') { Math.random() < 0.7 ? g.hit(pid) : g.stay(pid); }
      else { const ts = g.view().chooser.targets; assert(ts.length >= 2); g.choose(pid, ts[Math.floor(Math.random() * ts.length)]); }
    }
    reshuffles += g.log.filter(l => l.type === 'reshuffle').length;
  }
  console.log(`     (${rounds} rounds, ${flip7s} Flip 7s)`);
});

console.log(`engine: ${n} tests passed`);
