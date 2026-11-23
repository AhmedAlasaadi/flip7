'use strict';
// Flip 7 rules engine. Pure game logic, no networking.
// Deck (94): numbers 0-12 (one 0, then N copies of each N), +2 +4 +6 +8 +10, x2,
// 3x Freeze, 3x Flip Three, 3x Second Chance.

function buildDeck() {
  const d = [];
  let id = 1;
  d.push({ id: id++, k: 'num', v: 0 });
  for (let v = 1; v <= 12; v++) for (let i = 0; i < v; i++) d.push({ id: id++, k: 'num', v });
  for (const v of [2, 4, 6, 8, 10]) d.push({ id: id++, k: 'mod', v });
  d.push({ id: id++, k: 'x2' });
  for (const a of ['freeze', 'flip3', 'second']) for (let i = 0; i < 3; i++) d.push({ id: id++, k: a });
  return d;
}

function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cardName(c) {
  if (c.k === 'num') return String(c.v);
  if (c.k === 'mod') return '+' + c.v;
  if (c.k === 'x2') return 'x2';
  if (c.k === 'freeze') return 'Freeze';
  if (c.k === 'flip3') return 'Flip Three';
  return 'Second Chance';
}

function scoreOf(p) {
  if (p.status === 'busted') return 0;
  let s = p.nums.reduce((a, c) => a + c.v, 0);
  if (p.mods.some(c => c.k === 'x2')) s *= 2;
  s += p.mods.reduce((a, c) => a + (c.k === 'mod' ? c.v : 0), 0);
  if (p.flip7) s += 15;
  return s;
}

class Game {
  constructor(players, opts = {}) {
    this.rng = opts.rng || Math.random;
    this.target = opts.target || 200;
    this.players = players.map(p => ({
      id: p.id, name: p.name, total: 0,
      nums: [], mods: [], acts: [], bustCard: null, status: 'active', flip7: false, roundScore: null,
      // Tracked all game long; the end-of-game awards are chosen from these.
      stats: { hits: 0, stays: 0, riskyHits: 0, riskySurvived: 0, busts: 0, earlyBusts: 0, lost: 0, saves: 0, flip7s: 0, mods: 0, frozen: 0, ranks: [], gaps: [], rounds: [] },
    }));
    this.deck = opts.deck || shuffle(buildDeck(), this.rng);
    this.discard = [];
    this.round = 0;
    this.dealer = -1;
    this.turn = 0;
    this.needNext = false;
    this.stack = [];
    this.phase = 'idle';
    this.flip7By = null;
    this.outOfCards = false;
    this.winner = null;
    this.awards = null;
    this.hitBy = null;
    this.uid = 0;
    this.lastDraw = null;
    this.seq = 0;
    this.log = [];
  }

  say(type, text, pid) {
    this.log.push({ n: ++this.seq, type, text, pid: pid == null ? null : pid, round: this.round });
    if (this.log.length > 60) this.log.shift();
  }

  startRound() {
    if (this.phase !== 'idle' && this.phase !== 'roundEnd') return false;
    const n = this.players.length;
    for (const p of this.players) {
      this.discard.push(...p.nums, ...p.mods, ...p.acts);
      if (p.bustCard) this.discard.push(p.bustCard);
      p.nums = []; p.mods = []; p.acts = []; p.bustCard = null;
      p.status = 'active'; p.flip7 = false; p.roundScore = null;
    }
    this.round++;
    this.dealer = (this.dealer + 1) % n;
    this.stack = [];
    // Dealer deals one card to each player, starting on their left, themselves last.
    for (let i = n; i >= 1; i--) this.stack.push({ t: 'deal', pi: (this.dealer + i) % n });
    this.turn = this.dealer;
    this.needNext = true;
    this.flip7By = null;
    this.outOfCards = false;
    this.lastDraw = null;
    this.phase = 'auto';
    this.say('round', `Round ${this.round} — ${this.players[this.dealer].name} deals`, this.players[this.dealer].id);
    return true;
  }

  draw() {
    if (!this.deck.length) {
      if (!this.discard.length) return null;
      this.deck = shuffle(this.discard, this.rng);
      this.discard = [];
      this.say('reshuffle', 'Deck ran out — discards reshuffled');
    }
    const c = this.deck.pop();
    c.uid = ++this.uid;
    return c;
  }

  isActive(i) { return this.players[i].status === 'active'; }
  hasSecond(p) { return p.acts.some(c => c.k === 'second'); }

  nextActive(from) {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (from + i) % n;
      if (this.isActive(idx)) return idx;
    }
    return -1;
  }

  legalTargets(task) {
    const out = [];
    this.players.forEach((p, i) => {
      if (p.status !== 'active') return;
      if (task.card.k === 'second' && (i === task.pi || this.hasSecond(p))) return;
      out.push(i);
    });
    return out;
  }

  give(pi, card, f3) {
    const p = this.players[pi];
    const viaHit = this.hitBy; 
    this.lastDraw = { uid: card.uid, k: card.k, v: card.v, pi };   // so every client can show the pull
    if (card.k === 'num') {
      if (p.nums.some(c => c.v === card.v)) {
        const sc = p.acts.findIndex(c => c.k === 'second');
        if (sc >= 0) {
          p.stats.saves++;
          this.discard.push(p.acts.splice(sc, 1)[0], card);
          this.say('saved', `${p.name} flipped a second ${card.v} — Second Chance saves them`, p.id);
        } else {
          p.stats.busts++;
          p.stats.lost += scoreOf(p);
          if (p.nums.length <= 3) p.stats.earlyBusts++;
          p.bustCard = card;
          p.status = 'busted';
          this.say('bust', `${p.name} flipped a second ${card.v} and BUSTS`, p.id);
        }
      } else {
        p.nums.push(card);
        if (this.hitBy && this.hitBy.pi === pi && this.hitBy.risky) p.stats.riskySurvived++;
        if (p.nums.length === 7) {
          p.stats.flip7s++;
          p.flip7 = true;
          this.flip7By = pi;
          this.say('flip7', `FLIP 7! ${p.name} flipped seven different numbers (+15)`, p.id);
        } else {
          this.say('deal', `${p.name} flipped ${card.v}`, p.id);
        }
      }
    } else if (card.k === 'mod' || card.k === 'x2') {
      p.mods.push(card);
      p.stats.mods += card.k === 'x2' ? 2 : 1;
      this.say('deal', `${p.name} flipped ${cardName(card)}`, p.id);
    } else if (card.k === 'second') {
      if (!this.hasSecond(p)) {
        p.acts.push(card);
        this.say('second', `${p.name} flipped a Second Chance and keeps it`, p.id);
      } else {
        this.say('deal', `${p.name} flipped another Second Chance — must give it away`, p.id);
        this.stack.push({ t: 'action', card, pi });
      }
    } else if (f3) {
      f3.pending.push(card);
      this.say('deal', `${p.name} flipped ${cardName(card)} — set aside until Flip Three is done`, p.id);
    } else {
      this.say('deal', `${p.name} flipped ${cardName(card)}`, p.id);
      this.stack.push({ t: 'action', card, pi });
    }
    if (viaHit) this.hitBy = null;
  }

  apply(card, ownerIdx, targetIdx) {
    const o = this.players[ownerIdx], t = this.players[targetIdx];
    const who = ownerIdx === targetIdx ? 'themself' : t.name;
    t.acts.push(card);
    if (card.k === 'freeze') {
      if (ownerIdx !== targetIdx) t.stats.frozen++;
      t.status = 'frozen';
      this.say('freeze', ownerIdx === targetIdx
        ? `${o.name} is frozen and banks ${scoreOf(t)}`
        : `${o.name} freezes ${t.name} — they bank ${scoreOf(t)}`, t.id);
    } else if (card.k === 'flip3') {
      this.stack.push({ t: 'flip3', pi: targetIdx, left: 3, pending: [] });
      this.say('flip3', `${o.name} plays Flip Three on ${who}`, t.id);
    } else {
      this.say('second', `${o.name} gives a Second Chance to ${t.name}`, t.id);
    }
  }

  // Performs one visible step. Returns 'more' (call again), 'wait' (needs player
  // input), 'roundEnd' or 'gameOver'.
  step() {
    for (;;) {
      if (this.phase === 'roundEnd' || this.phase === 'gameOver' || this.phase === 'idle') return this.phase;
      if (this.flip7By != null || this.outOfCards || !this.players.some(p => p.status === 'active')) return this.endRound();
      const top = this.stack[this.stack.length - 1];
      if (!top) {
        if (this.needNext) { this.turn = this.nextActive(this.turn); this.needNext = false; }
        this.phase = 'turn';
        return 'wait';
      }
      this.phase = 'auto';
      if (top.t === 'deal') {
        this.stack.pop();
        if (!this.isActive(top.pi)) continue;
        const c = this.draw();
        if (!c) { this.outOfCards = true; continue; }
        this.give(top.pi, c, null);
        return 'more';
      }
      if (top.t === 'flip3') {
        if (!this.isActive(top.pi)) {
          this.stack.pop();
          if (top.pending.length) {
            this.discard.push(...top.pending);
            this.say('info', `Set-aside action cards are discarded`);
          }
          continue;
        }
        if (top.left > 0) {
          top.left--;
          const c = this.draw();
          if (!c) { this.outOfCards = true; continue; }
          this.give(top.pi, c, top);
          return 'more';
        }
        this.stack.pop();
        for (let i = top.pending.length - 1; i >= 0; i--) this.stack.push({ t: 'action', card: top.pending[i], pi: top.pi });
        continue;
      }
      // action card waiting to be played
      const owner = this.players[top.pi];
      if (owner.status !== 'active') {
        this.stack.pop();
        this.discard.push(top.card);
        this.say('info', `${cardName(top.card)} is discarded`);
        continue;
      }
      const targets = this.legalTargets(top);
      if (targets.length === 0) {
        this.stack.pop();
        this.discard.push(top.card);
        this.say('info', `Nobody can take the ${cardName(top.card)} — discarded`);
        return 'more';
      }
      if (targets.length === 1) {
        this.stack.pop();
        this.apply(top.card, top.pi, targets[0]);
        return 'more';
      }
      this.phase = 'choose';
      return 'wait';
    }
  }

  current() {
    if (this.phase === 'turn') return this.players[this.turn].id;
    if (this.phase === 'choose') return this.players[this.stack[this.stack.length - 1].pi].id;
    return null;
  }

  hit(pid) {
    if (this.phase !== 'turn' || this.players[this.turn].id !== pid) return false;
    this.needNext = true;
    const hp = this.players[this.turn];
    hp.stats.hits++;
    if (hp.nums.length >= 4) hp.stats.riskyHits++;
    this.hitBy = { pi: this.turn, risky: hp.nums.length >= 4 };
    this.stack.push({ t: 'deal', pi: this.turn });
    this.phase = 'auto';
    return true;
  }

  stay(pid) {
    if (this.phase !== 'turn' || this.players[this.turn].id !== pid) return false;
    const p = this.players[this.turn];
    p.status = 'stayed';
    p.stats.stays++;
    this.needNext = true;
    this.phase = 'auto';
    this.say('stay', `${p.name} stays and banks ${scoreOf(p)}`, p.id);
    return true;
  }

  choose(pid, targetId) {
    if (this.phase !== 'choose') return false;
    const top = this.stack[this.stack.length - 1];
    if (this.players[top.pi].id !== pid) return false;
    const ti = this.players.findIndex(p => p.id === targetId);
    if (!this.legalTargets(top).includes(ti)) return false;
    this.stack.pop();
    this.apply(top.card, top.pi, ti);
    this.phase = 'auto';
    return true;
  }

  endRound() {
    for (const t of this.stack) {
      if (t.card) this.discard.push(t.card);
      if (t.pending) this.discard.push(...t.pending);
    }
    this.stack = [];
    for (const p of this.players) {
      p.roundScore = scoreOf(p);
      p.total += p.roundScore;
    }
    const max = Math.max(...this.players.map(p => p.total));
    const leaders = this.players.filter(p => p.total === max);
    for (const p of this.players) {
      p.stats.ranks.push(1 + this.players.filter(q => q.total > p.total).length);
      p.stats.gaps.push(max - p.total);
      p.stats.rounds.push(p.roundScore);
    }
    if (max >= this.target && leaders.length === 1) {
      this.winner = leaders[0].id;
      this.awards = this.computeAwards();
      this.phase = 'gameOver';
      this.say('win', `${leaders[0].name} wins with ${max} points!`, leaders[0].id);
    } else {
      this.phase = 'roundEnd';
      this.say('roundEnd', max >= this.target ? `Tied at ${max} — play another round to break it` : `Round ${this.round} is over`);
    }
    return this.phase;
  }

  // Plain-data copy of the whole game, and its inverse (used to persist rooms).
  dump() {
    const o = {};
    for (const k of Object.keys(this)) if (k !== 'rng') o[k] = this[k];
    return JSON.parse(JSON.stringify(o));
  }

  static load(d) {
    const g = Object.create(Game.prototype);
    Object.assign(g, JSON.parse(JSON.stringify(d)));
    g.rng = Math.random;
    return g;
  }

  // The six end-of-game awards, chosen from the tracked statistics. Ties go to the
  // listed tie-breakers, then to seating order, so every client agrees.
  computeAwards() {
    const P = this.players;
    const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 >> 3 ^ 1) && n % 10] || 'th');
    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : (w.endsWith('s') ? 'es' : 's')}`;
    const best = (...keys) => [...P].sort((a, b) => { for (const k of keys) { const d = k(b) - k(a); if (d) return d; } return 0; })[0];
    const dec = p => p.stats.hits + p.stats.stays;
    const luck = p => p.stats.saves * 3 + p.stats.flip7s * 4 + p.stats.riskySurvived + p.stats.mods;
    const woe = p => p.stats.busts * 2 + p.stats.earlyBusts * 2 + p.stats.frozen * 2 + p.stats.lost / 10;
    const last = a => a[a.length - 1];
    const climb = p => Math.max(...p.stats.ranks) - last(p.stats.ranks);
    const closed = p => Math.max(...p.stats.gaps) - last(p.stats.gaps);
    const out = [];
    const add = (key, p, stat) => out.push({ key, pid: p.id, stat });

    let p = best(q => q.stats.riskyHits, q => dec(q) ? q.stats.hits / dec(q) : 0, q => q.stats.busts);
    add('gambler', p, p.stats.riskyHits ? `${plural(p.stats.riskyHits, 'flip')} with 4 or more numbers already showing` : `Chose to flip ${dec(p) ? Math.round(100 * p.stats.hits / dec(p)) : 0}% of the time`);

    p = best(q => dec(q) ? q.stats.stays / dec(q) : 0, q => -q.stats.busts, q => -q.stats.riskyHits);
    add('nerd', p, `Stayed on ${dec(p) ? Math.round(100 * p.stats.stays / dec(p)) : 0}% of decisions · ${plural(p.stats.busts, 'bust')}`);

    p = best(luck, q => -q.stats.busts, q => q.total);
    const lucky = [p.stats.flip7s && plural(p.stats.flip7s, 'Flip 7'), p.stats.saves && plural(p.stats.saves, 'Second Chance save'), p.stats.riskySurvived && plural(p.stats.riskySurvived, 'risky flip') + ' survived', p.stats.mods && plural(p.stats.mods, 'bonus card')].filter(Boolean);
    add('luckiest', p, lucky.length ? lucky.slice(0, 3).join(' · ') : 'Nobody got lucky — this was the least unlucky');

    p = best(woe, q => -q.total);
    const sad = [plural(p.stats.busts, 'bust'), p.stats.lost && `${p.stats.lost} points lost`, p.stats.frozen && `frozen ${plural(p.stats.frozen, 'time')}`].filter(Boolean);
    add('unluckiest', p, sad.join(' · '));

    p = best(climb, closed, q => last(q.stats.rounds), q => q.total);
    add('comeback', p, climb(p) > 0 ? `Climbed from ${ord(Math.max(...p.stats.ranks))} place to ${ord(last(p.stats.ranks))}`
      : closed(p) > 0 ? `Closed a ${closed(p)}-point gap on the leader` : `Best closing round: +${last(p.stats.rounds)}`);

    p = P.find(q => q.id === this.winner);
    add('champion', p, `Won with ${p.total} points in ${plural(this.round, 'round')}`);
    return out;
  }

  countCards() {
    let n = this.deck.length + this.discard.length;
    for (const p of this.players) n += p.nums.length + p.mods.length + p.acts.length + (p.bustCard ? 1 : 0);
    for (const t of this.stack) n += (t.card ? 1 : 0) + (t.pending ? t.pending.length : 0);
    return n;
  }

  view() {
    const top = this.stack[this.stack.length - 1];
    const pub = c => ({ uid: c.uid, k: c.k, v: c.v });
    let chooser = null;
    if (this.phase === 'choose') {
      chooser = { ownerId: this.players[top.pi].id, card: pub(top.card), targets: this.legalTargets(top).map(i => this.players[i].id) };
    }
    const f3 = [...this.stack].reverse().find(t => t.t === 'flip3');
    return {
      phase: this.phase, round: this.round, target: this.target,
      dealerId: this.players[this.dealer] ? this.players[this.dealer].id : null,
      turnId: this.phase === 'turn' ? this.players[this.turn].id : null,
      chooser,
      flip3: f3 ? { pid: this.players[f3.pi].id, left: f3.left, pending: f3.pending.map(pub) } : null,
      deck: this.deck.length, discard: this.discard.length,
      lastDraw: this.lastDraw ? { uid: this.lastDraw.uid, k: this.lastDraw.k, v: this.lastDraw.v, pid: this.players[this.lastDraw.pi].id } : null,
      winnerId: this.winner,
      awards: this.awards,
      players: this.players.map(p => ({
        id: p.id, total: p.total, status: p.status, flip7: p.flip7,
        nums: p.nums.map(pub), mods: p.mods.map(pub), acts: p.acts.map(pub),
        bustCard: p.bustCard ? pub(p.bustCard) : null,
        score: scoreOf(p), roundScore: p.roundScore,
      })),
      log: this.log.slice(-40),
    };
  }
}

module.exports = { Game, buildDeck, scoreOf, cardName, shuffle };
