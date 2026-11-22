'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const app = $('#app');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem('flip7.' + k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('flip7.' + k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem('flip7.' + k); } catch (e) {} },
  };
  const HUES = [200, 30, 95, 330, 175, 265, 12, 215, 140, 290, 50, 350, 235];
  const urlRoom = () => (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

  const S = {
    conn: 'connecting', room: null, game: null, you: null, err: '',
    screen: '', modal: null, overlayAt: 0, fresh: true, lastSeq: 0, sound: store.get('sound') !== false,
    invite: urlRoom(), pendingJoin: null,
  };
  const seen = new Map();   // card uid -> first time rendered (drives the flip animation)
  const bustSeen = new Set();

  // ---------- networking ----------
  let ws = null, retry = 0, pingTimer = null;
  const send = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

  function connect() {
    S.conn = 'connecting';
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    ws.onopen = () => {
      S.conn = 'open'; retry = 0; S.fresh = true;
      $('#net').hidden = true;
      const sess = store.get('session');
      if (sess && (!S.invite || S.invite === sess.code)) send({ t: 'join', code: sess.code, token: sess.token, name: sess.name });
      else if (S.pendingJoin) { send(S.pendingJoin); }
      S.pendingJoin = null;
      clearInterval(pingTimer);
      pingTimer = setInterval(() => send({ t: 'ping' }), 20000);
      render();
    };
    ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } onMsg(m); };
    ws.onclose = () => {
      S.conn = 'closed';
      clearInterval(pingTimer);
      if (S.room) $('#net').hidden = false;
      setTimeout(connect, Math.min(5000, 600 * ++retry));
    };
  }

  function onMsg(m) {
    if (m.t === 'joined') {
      S.you = m.you; S.err = '';
      store.set('session', { code: m.code, token: m.token, name: store.get('name') || '' });
      S.invite = m.code;
      try { history.replaceState(null, '', '?room=' + m.code); } catch (e) {}
    } else if (m.t === 'state') {
      const prev = S.game;
      S.room = m.room; S.game = m.game; S.you = m.you;
      if (S.game) onGame(prev, S.game);
      S.fresh = false;
      render();
    } else if (m.t === 'error') {
      if (!S.room) {
        if (m.code === 'noroom' || m.code === 'started') store.del('session');
        S.err = m.msg; S.screen = ''; render();
      } else callout(m.msg, 'info');
    } else if (m.t === 'left') {
      goHome();
    }
  }

  function goHome() {
    store.del('session');
    S.room = null; S.game = null; S.invite = ''; S.modal = null; S.screen = '';
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    render();
  }

  // ---------- reactions to game updates ----------
  function onGame(prev, g) {
    const now = performance.now();
    if (S.fresh) {
      for (const p of g.players) for (const c of [...p.nums, ...p.mods, ...p.acts, p.bustCard]) if (c) seen.set(c.uid, 0);
      for (const p of g.players) if (p.status === 'busted') bustSeen.add(g.round + ':' + p.id);
      S.lastSeq = g.log.length ? g.log[g.log.length - 1].n : 0;
      if (g.phase === 'roundEnd' || g.phase === 'gameOver') S.overlayAt = now;
      return;
    }
    const fresh = g.log.filter(l => l.n > S.lastSeq);
    if (fresh.length) S.lastSeq = fresh[fresh.length - 1].n;
    for (const l of fresh) {
      sfx(l.type);
      if (['bust', 'flip7', 'freeze', 'flip3', 'saved', 'win', 'reshuffle'].includes(l.type)) callout(l.text, l.type);
      if (l.type === 'second' && /gives/.test(l.text)) callout(l.text, l.type);
      if (l.type === 'flip7' || l.type === 'win') confetti();
    }
    const ended = g.phase === 'roundEnd' || g.phase === 'gameOver';
    const was = prev && (prev.phase === 'roundEnd' || prev.phase === 'gameOver') && prev.round === g.round;
    if (ended && !was) { S.overlayAt = now + 1700; setTimeout(render, 1750); }
    const mine = (g.phase === 'turn' && g.turnId === S.you) || (g.phase === 'choose' && g.chooser.ownerId === S.you);
    const wasMine = prev && ((prev.phase === 'turn' && prev.turnId === S.you) || (prev.phase === 'choose' && prev.chooser.ownerId === S.you));
    if (mine && !wasMine) { sfx('turn'); try { navigator.vibrate && navigator.vibrate(60); } catch (e) {} }
    document.title = mine ? '▶ Your turn — Flip 7' : 'Flip 7 — play online with friends';
  }

  let calloutTimer = null;
  function callout(text, type) {
    const el = $('#callout');
    el.innerHTML = `<div class="${esc(type)}">${esc(text)}</div>`;
    clearTimeout(calloutTimer);
    calloutTimer = setTimeout(() => { el.innerHTML = ''; }, 2100);
  }

  // ---------- sound ----------
  let ac = null;
  function tone(f, t0, dur, type = 'triangle', vol = 0.12, f2) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, ac.currentTime + t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, ac.currentTime + t0 + dur);
    g.gain.setValueAtTime(vol, ac.currentTime + t0);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t0 + dur);
    o.connect(g).connect(ac.destination); o.start(ac.currentTime + t0); o.stop(ac.currentTime + t0 + dur + 0.02);
  }
  function sfx(type) {
    if (!S.sound || !ac || ac.state !== 'running') return;
    try {
      if (type === 'deal' || type === 'second') tone(520, 0, 0.09, 'triangle', 0.1, 880);
      else if (type === 'bust') { tone(220, 0, 0.25, 'sawtooth', 0.12, 70); tone(160, 0.12, 0.3, 'sawtooth', 0.1, 50); }
      else if (type === 'stay') { tone(660, 0, 0.1); tone(880, 0.09, 0.16); }
      else if (type === 'freeze') { tone(1400, 0, 0.3, 'sine', 0.1, 500); tone(1900, 0.05, 0.3, 'sine', 0.06, 700); }
      else if (type === 'flip3') { [0, 0.09, 0.18].forEach((t, i) => tone(440 + i * 140, t, 0.09, 'square', 0.06)); }
      else if (type === 'saved') { tone(400, 0, 0.12, 'sine', 0.12, 800); tone(1000, 0.12, 0.22, 'sine', 0.1); }
      else if (type === 'flip7' || type === 'win') { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.28, 'triangle', 0.13)); }
      else if (type === 'turn') { tone(784, 0, 0.1, 'sine', 0.1); tone(1047, 0.1, 0.14, 'sine', 0.1); }
    } catch (e) {}
  }
  document.addEventListener('pointerdown', () => {
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
    } catch (e) {}
  });

  // ---------- confetti ----------
  const fx = $('#fx'), fctx = fx.getContext('2d');
  let parts = [], raf = 0;
  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    fx.width = innerWidth; fx.height = innerHeight;
    const cols = ['#ffd23f', '#ff5d8f', '#2ee6c5', '#7fd8ff', '#b06bff', '#ffffff'];
    for (let i = 0; i < 160; i++) parts.push({ x: innerWidth / 2, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 14 - 3, r: Math.random() * 6 + 3, c: cols[i % cols.length], a: Math.random() * 6, life: 0 });
    if (!raf) raf = requestAnimationFrame(tickFx);
  }
  function tickFx() {
    fctx.clearRect(0, 0, fx.width, fx.height);
    parts = parts.filter(p => p.life < 170 && p.y < fx.height + 20);
    for (const p of parts) {
      p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += 0.2; p.life++;
      fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.a); fctx.fillStyle = p.c; fctx.globalAlpha = Math.max(0, 1 - p.life / 170);
      fctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); fctx.restore();
    }
    raf = parts.length ? requestAnimationFrame(tickFx) : 0;
    if (!raf) fctx.clearRect(0, 0, fx.width, fx.height);
  }

  // ---------- helpers ----------
  const pInfo = id => (S.room && S.room.players.find(p => p.id === id)) || { name: '—', connected: true };
  const hueOf = id => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  const avatar = (id, name) => `<span class="av" style="--h:${hueOf(id)}">${esc((name || '?').trim().charAt(0).toUpperCase())}</span>`;

  function cardHTML(c, extra = '') {
    let cls = 'card ' + extra, inner = '', style = '';
    if (c.k === 'num') { cls += ' num'; inner = `<b>${c.v}</b>`; style = `--h:${HUES[c.v]};`; }
    else if (c.k === 'mod') { cls += ' mod'; inner = `<b>+${c.v}</b>`; }
    else if (c.k === 'x2') { cls += ' mod x2'; inner = '<b>×2</b>'; }
    else if (c.k === 'freeze') { cls += ' act freeze'; inner = '<i>❄</i><small>FREEZE</small>'; }
    else if (c.k === 'flip3') { cls += ' act flip3'; inner = '<i>×3</i><small>FLIP<br>THREE</small>'; }
    else { cls += ' act second'; inner = '<i>♥</i><small>SECOND<br>CHANCE</small>'; }
    const now = performance.now();
    if (!seen.has(c.uid)) seen.set(c.uid, now);
    const age = now - seen.get(c.uid);
    if (age < 650) { cls += ' flip'; style += `--d:${-Math.round(age)}ms;`; }
    const label = c.k === 'num' ? c.v : c.k === 'mod' ? '+' + c.v : c.k === 'x2' ? 'times 2' : c.k === 'freeze' ? 'Freeze' : c.k === 'flip3' ? 'Flip Three' : 'Second Chance';
    return `<div class="${cls}" style="${style}" role="img" aria-label="${label}"><div class="ci"><div class="cf">${inner}</div><div class="cb"></div></div></div>`;
  }

  function seatHTML(p, g, me) {
    const info = pInfo(p.id);
    const isTurn = (g.phase === 'turn' && g.turnId === p.id) || (g.phase === 'choose' && g.chooser.ownerId === p.id) || (g.phase === 'auto' && g.flip3 && g.flip3.pid === p.id);
    const pick = g.phase === 'choose' && g.chooser.ownerId === S.you && g.chooser.targets.includes(p.id);
    const key = g.round + ':' + p.id;
    let cls = `seat s-${p.status}`;
    if (isTurn) cls += ' turn';
    if (pick) cls += ' pick';
    if (!info.connected) cls += ' off';
    if (p.status === 'busted' && !bustSeen.has(key)) { cls += ' just-bust'; bustSeen.add(key); }
    let cards = p.nums.map(c => cardHTML(c)).join('');
    if (p.bustCard) cards += cardHTML(p.bustCard, 'bust');
    const extras = [...p.mods, ...p.acts];
    if (extras.length) cards += (cards ? '<span class="sep"></span>' : '') + extras.map(c => cardHTML(c)).join('');
    if (!cards) cards = '<span class="empty">No cards yet</span>';
    const st = p.flip7 ? ['flip7', 'Flip 7!'] : p.status === 'busted' ? ['busted', 'Busted'] : p.status === 'stayed' ? ['stayed', 'Banked'] : p.status === 'frozen' ? ['frozen', 'Frozen'] : ['active', `${p.nums.length}/7`];
    const tag = pick ? 'button' : 'div';
    return `<${tag} class="${cls}" ${pick ? `data-act="target" data-pid="${p.id}" aria-label="Choose ${esc(info.name)}"` : ''}>
      <div class="seat-head">${avatar(p.id, info.name)}<span class="nm">${esc(info.name)}${me ? ' (you)' : ''}</span>${g.dealerId === p.id ? '<span class="dealer" title="Dealer">D</span>' : ''}<span class="tot">${p.total}<small>pts</small></span></div>
      <div class="cards">${cards}</div>
      <div class="seat-foot"><span class="st ${st[0]}">${st[1]}</span><span class="pts">${p.status === 'busted' ? '0' : '+' + p.score}</span></div>
    </${tag}>`;
  }

  function bannerHTML(g) {
    const me = S.you, nm = id => esc(pInfo(id).name);
    const kind = { freeze: 'Freeze', flip3: 'Flip Three', second: 'Second Chance' };
    if (g.phase === 'choose') {
      const c = g.chooser, k = kind[c.card.k];
      const side = `<div class="aside-cards">${cardHTML(c.card)}</div>`;
      if (c.ownerId === me) {
        const what = c.card.k === 'freeze' ? 'They bank their points and are out of the round.' : c.card.k === 'flip3' ? 'They must flip the next three cards.' : 'You already hold one, so it goes to someone else.';
        return `<div class="banner mine"><h2>You drew ${k} — who gets it?</h2><p>${what}</p><div class="targets">${c.targets.map(id => `<button class="btn pink small" data-act="target" data-pid="${id}">${id === me ? 'Myself' : nm(id)}</button>`).join('')}</div></div>${side}`;
      }
      return `<div class="banner"><h2>${nm(c.ownerId)} drew ${k}</h2><p>Choosing who gets it…</p></div>${side}`;
    }
    if (g.phase === 'turn') {
      if (g.turnId === me) return `<div class="banner mine"><h2>Your turn</h2><p>Flip another card, or stay and bank your points.</p></div>`;
      return `<div class="banner"><h2>${nm(g.turnId)}'s turn</h2><p>Waiting for them to flip or stay…</p></div>`;
    }
    if (g.phase === 'auto') {
      if (g.flip3) {
        const side = g.flip3.pending.length ? `<div class="aside-cards">${g.flip3.pending.map(c => cardHTML(c)).join('')}</div>` : '';
        return `<div class="banner ${g.flip3.pid === me ? 'mine' : ''}"><h2>${g.flip3.pid === me ? 'You are' : nm(g.flip3.pid) + ' is'} flipping three</h2><p>${g.flip3.left} more to go${g.flip3.pending.length ? ' · set-aside cards play afterwards' : ''}</p></div>${side}`;
      }
      return `<div class="banner"><h2>Dealing…</h2><p>Round ${g.round}</p></div>`;
    }
    if (g.phase === 'gameOver') return `<div class="banner mine"><h2>${nm(g.winnerId)} wins!</h2></div>`;
    return `<div class="banner"><h2>Round ${g.round} is over</h2></div>`;
  }

  function overlayHTML(g) {
    if (S.modal === 'rules') return rulesHTML();
    if (S.modal === 'leave') return `<div class="overlay"><div class="modal"><h2>Leave the game?</h2><p class="sub">Your turns will be skipped for the rest of the game.</p><div class="row"><button class="btn ghost" data-act="close">Keep playing</button><button class="btn pink" data-act="leave-yes">Leave</button></div></div></div>`;
    if (!g || performance.now() < S.overlayAt) return '';
    if (g.phase !== 'roundEnd' && g.phase !== 'gameOver') return '';
    const over = g.phase === 'gameOver';
    const rows = [...g.players].sort((a, b) => b.total - a.total).map((p, i) => {
      const how = p.status === 'busted' ? 'Busted' : (p.flip7 ? 'Flip 7! ' : '') + (p.nums.map(c => c.v).join(' + ') || 'no numbers') + (p.mods.some(c => c.k === 'x2') ? ' ×2' : '') + p.mods.filter(c => c.k === 'mod').map(c => ' +' + c.v).join('') + (p.flip7 ? ' +15' : '');
      return `<div class="rrow ${over && p.id === g.winnerId ? 'win' : ''}"><span>${i + 1}</span><span class="nm">${esc(pInfo(p.id).name)}${p.id === S.you ? ' (you)' : ''}<small>${esc(how)}</small></span><span class="gain ${p.roundScore ? '' : 'zero'}">+${p.roundScore}</span><span class="tt">${p.total}</span></div>`;
    }).join('');
    if (over) {
      return `<div class="overlay"><div class="modal"><div class="trophy">🏆</div><h2>${g.winnerId === S.you ? 'You win!' : esc(pInfo(g.winnerId).name) + ' wins!'}</h2><p class="sub">Final scores after ${g.round} rounds</p><div class="res">${rows}</div><div class="row"><button class="btn ghost" data-act="leave-yes">Leave</button><button class="btn primary" data-act="again">Play again</button></div></div></div>`;
    }
    const max = Math.max(...g.players.map(p => p.total));
    return `<div class="overlay"><div class="modal"><h2>Round ${g.round} results</h2><p class="sub">${max >= g.target ? 'Tied at the top — one more round decides it' : `First to ${g.target} wins`}</p><div class="res">${rows}</div><button class="btn primary" style="width:100%" data-act="next">Deal round ${g.round + 1}</button></div></div>`;
  }

  function rulesHTML() {
    return `<div class="overlay" data-act="close"><div class="modal rules" data-stop><h2>How to play</h2>
      <p class="sub">Push your luck — don't flip the same number twice.</p>
      <h3>Your turn</h3><p><b>Flip</b> to take another card, or <b>Stay</b> to bank your points and sit out the rest of the round. Flip a number you already have and you <b>bust</b>: zero for the round.</p>
      <h3>Flip 7</h3><p>Collect 7 different numbers and the round ends on the spot — you get a 15-point bonus.</p>
      <h3>The deck (94 cards)</h3><p>Numbers 0–12. There are twelve 12s, eleven 11s … one 1, and a single 0, so high cards are worth more but riskier.</p>
      <h3>Special cards</h3><ul>
      <li><b>❄ Freeze</b> — the player you choose banks their points and is out of the round.</li>
      <li><b>×3 Flip Three</b> — the player you choose must flip three cards in a row. It stops early on a bust or Flip 7. Freeze or Flip Three found on the way are played afterwards.</li>
      <li><b>♥ Second Chance</b> — cancels your next duplicate (both cards are discarded). You can hold only one; a spare must be given away.</li>
      <li><b>+2 … +10</b> add to your score. <b>×2</b> doubles your number cards. Neither can bust you.</li></ul>
      <h3>Scoring</h3><p>Add your numbers, double them if you hold ×2, add the + cards, then +15 for a Flip 7.</p>
      <h3>Winning</h3><p>When someone reaches the target (200 by default) at the end of a round, the highest total wins.</p>
      <button class="btn primary" style="width:100%;margin-top:16px" data-act="close">Got it</button></div></div>`;
  }

  // ---------- screens ----------
  function renderHome() {
    const name = esc(S.nameDraft != null ? S.nameDraft : (store.get('name') || ''));
    const inv = S.invite;
    app.innerHTML = `<div class="center-wrap"><div class="sheet">
      <h1 class="logo">FLIP<span>7</span></h1>
      <p class="tag">${inv ? `You're invited to room <b>${esc(inv)}</b>` : 'The push-your-luck card game, online with friends'}</p>
      <div class="err" id="err">${esc(S.err)}</div>
      <label class="field"><span>Your name</span><input type="text" id="name" maxlength="16" placeholder="e.g. Ahmed" value="${name}" autocomplete="nickname"></label>
      ${inv ? `<button class="btn primary" style="width:100%" data-act="join">Join room ${esc(inv)}</button>
        <div class="foot"><button class="linkish" data-act="noinvite">Create my own room instead</button></div>`
      : `<button class="btn primary" style="width:100%" data-act="create">Create a room</button>
        <div class="or">or join a friend</div>
        <div class="row"><input type="text" id="code" class="code" maxlength="4" placeholder="CODE" value="${esc(S.codeDraft || '')}" autocomplete="off" autocapitalize="characters" aria-label="Room code"><button class="btn teal" data-act="join">Join</button></div>`}
      <div class="foot"><button class="linkish" data-act="rules">How to play</button></div>
    </div></div>${S.modal === 'rules' ? rulesHTML() : ''}`;
  }

  function renderLobby() {
    const r = S.room, host = r.hostId === S.you, me = r.players.find(p => p.id === S.you) || {};
    const allReady = r.players.length >= 2 && r.players.every(p => p.id === r.hostId || p.ready);
    app.innerHTML = `<div class="center-wrap"><div class="sheet">
      <h1 class="logo" style="font-size:2.2rem">FLIP<span>7</span></h1>
      <p class="tag" style="margin-bottom:14px">Invite your friends, then start when everyone is ready</p>
      <div class="codebox"><small>Room code</small><b>${esc(r.code)}</b></div>
      <div class="row"><button class="btn teal" data-act="copy">Copy invite link</button>${navigator.share ? '<button class="btn ghost" data-act="share">Share…</button>' : ''}</div>
      <ul class="plist">${r.players.map(p => `<li>${avatar(p.id, p.name)}<span class="nm">${esc(p.name)}${p.id === S.you ? ' (you)' : ''}</span>${!p.connected ? '<span class="pill off">Away</span>' : ''}${p.id === r.hostId ? '<span class="pill host">Host</span>' : `<span class="pill ${p.ready ? 'ok' : ''}">${p.ready ? 'Ready' : 'Not ready'}</span>`}</li>`).join('')}</ul>
      <div class="opts"><span>Play to</span><span class="seg">${[100, 150, 200, 300].map(t => `<button class="${r.target === t ? 'on' : ''}" ${host ? `data-act="target-score" data-v="${t}"` : 'disabled'}>${t}</button>`).join('')}</span></div>
      ${host ? `<button class="btn primary" style="width:100%" data-act="start" ${allReady ? '' : 'disabled'}>Start game</button>
        <p class="hint">${r.players.length < 2 ? 'Waiting for at least one more player…' : allReady ? 'Everyone is ready!' : 'Waiting for everyone to be ready…'}</p>`
      : `<button class="btn ${me.ready ? 'ghost' : 'primary'}" style="width:100%" data-act="ready">${me.ready ? 'Not ready after all' : "I'm ready"}</button>
        <p class="hint">${me.ready ? 'Waiting for the host to start…' : 'Tap when you are ready to play'}</p>`}
      <div class="foot"><button class="linkish" data-act="rules">How to play</button> · <button class="linkish" data-act="leave-yes">Leave room</button></div>
    </div></div>${S.modal === 'rules' ? rulesHTML() : ''}`;
  }

  function renderGame() {
    const g = S.game, r = S.room;
    const myIdx = g.players.findIndex(p => p.id === S.you);
    const order = g.players.map((_, i) => g.players[(myIdx + 1 + i) % g.players.length]);
    const me = order.pop();
    const myTurn = g.phase === 'turn' && g.turnId === S.you;
    const ranked = [...g.players].sort((a, b) => b.total - a.total);
    const logScroll = ($('.log') || {}).scrollTop || 0;
    app.innerHTML = `
      <header class="top"><div class="brand">FLIP<span>7</span></div>
        <div class="meta"><span class="chip">Room <b>${esc(r.code)}</b></span><span class="chip">Round <b>${g.round}</b></span><span class="chip">First to <b>${g.target}</b></span></div>
        <div class="tools"><button class="btn ghost small" data-act="rules" aria-label="How to play">?</button><button class="btn ghost small" data-act="sound" aria-label="Toggle sound">${S.sound ? '🔊' : '🔇'}</button><button class="btn ghost small" data-act="leave">Leave</button></div></header>
      <div class="game"><main class="table">
        <section class="opps">${order.map(p => seatHTML(p, g, false)).join('')}</section>
        <section class="mid"><div class="pile" title="${g.deck} cards left"><i></i><i></i><i></i><b>${g.deck}</b></div>${bannerHTML(g)}</section>
        <section class="me">${seatHTML(me, g, true)}
          ${me.status === 'active'
            ? `<div class="actions"><button class="btn pink big" data-act="hit" ${myTurn ? '' : 'disabled'}>Flip a card</button><button class="btn teal big" data-act="stay" ${myTurn ? '' : 'disabled'}>Stay · bank ${me.score}</button></div>`
            : `<p class="waitnote">${me.status === 'busted' ? 'You busted — nothing this round.' : me.flip7 ? 'Flip 7!' : `You banked ${me.score} this round.`}</p>`}
        </section></main>
        <aside class="side">
          <div class="box"><h3>Scoreboard</h3><div class="score">${ranked.map((p, i) => `<div class="srow ${p.id === S.you ? 'you' : ''}"><span class="rk">${i + 1}</span><span class="nm">${esc(pInfo(p.id).name)}</span><b>${p.total}</b><span class="bar"><i style="width:${Math.min(100, p.total / g.target * 100)}%"></i></span></div>`).join('')}</div></div>
          <div class="box"><h3>Play by play</h3><ul class="log">${[...g.log].reverse().slice(0, 25).map(l => `<li class="${esc(l.type)}">${esc(l.text)}</li>`).join('')}</ul></div>
        </aside></div>${overlayHTML(g)}`;
    const lg = $('.log'); if (lg) lg.scrollTop = logScroll;
  }

  function render() {
    const screen = !S.room ? 'home' : !S.game ? 'lobby' : 'game';
    if (screen === 'home') {
      // keep typed text: only rebuild the home screen when we arrive on it
      if (S.screen !== 'home') { S.screen = 'home'; renderHome(); }
      else { const e = $('#err'); if (e) e.textContent = S.err; }
      return;
    }
    S.screen = screen;
    if (screen === 'lobby') renderLobby(); else renderGame();
  }

  // ---------- input ----------
  function readName() {
    const el = $('#name');
    const n = (el ? el.value : store.get('name') || '').trim().slice(0, 16);
    if (!n) { S.err = 'Please enter your name first.'; render(); if (el) el.focus(); return null; }
    store.set('name', n);
    return n;
  }
  function request(m) {
    S.err = '';
    if (ws && ws.readyState === 1) send(m);
    else { S.pendingJoin = m; S.err = 'Connecting to the server…'; render(); }
  }
  const inviteLink = () => location.origin + location.pathname + '?room=' + S.room.code;

  const acts = {
    create() { const n = readName(); if (n) { store.del('session'); request({ t: 'create', name: n }); } },
    join() {
      const n = readName(); if (!n) return;
      const code = S.invite || (($('#code') || {}).value || '').toUpperCase().trim();
      if (code.length !== 4) { S.err = 'Enter the 4-letter room code.'; render(); return; }
      store.del('session');
      request({ t: 'join', code, name: n });
    },
    noinvite() { S.invite = ''; S.err = ''; S.screen = ''; try { history.replaceState(null, '', location.pathname); } catch (e) {} render(); },
    ready() { const me = S.room.players.find(p => p.id === S.you); send({ t: 'ready', ready: !me.ready }); },
    start() { send({ t: 'start' }); },
    'target-score'(el) { send({ t: 'config', target: Number(el.dataset.v) }); },
    async copy(el) {
      const link = inviteLink();
      try { await navigator.clipboard.writeText(link); el.textContent = 'Link copied!'; }
      catch (e) { el.textContent = link; }
      setTimeout(() => { if (S.screen === 'lobby') render(); }, 2500);
    },
    share() { try { navigator.share({ title: 'Flip 7', text: 'Join my Flip 7 game!', url: inviteLink() }).catch(() => {}); } catch (e) {} },
    hit() { send({ t: 'hit' }); },
    stay() { send({ t: 'stay' }); },
    target(el) { send({ t: 'target', pid: el.dataset.pid }); },
    next() { send({ t: 'next' }); },
    again() { send({ t: 'again' }); },
    rules() { S.modal = 'rules'; S.screen = ''; render(); },
    leave() { S.modal = 'leave'; render(); },
    close() { S.modal = null; S.screen = ''; render(); },
    'leave-yes'() { S.modal = null; send({ t: 'leave' }); if (!ws || ws.readyState !== 1) goHome(); },
    sound() { S.sound = !S.sound; store.set('sound', S.sound); render(); },
  };

  app.addEventListener('click', ev => {
    const el = ev.target.closest('[data-act]');
    if (!el || el.disabled) return;
    if (el.dataset.act === 'close' && el.classList.contains('overlay') && ev.target.closest('[data-stop]') && !ev.target.closest('button')) return;
    const fn = acts[el.dataset.act];
    if (fn) fn(el);
  });
  app.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter' || ev.target.tagName !== 'INPUT') return;
    if (ev.target.id === 'code' || S.invite) acts.join(); else acts.create();
  });
  app.addEventListener('input', ev => {
    if (ev.target.id === 'code') S.codeDraft = ev.target.value = ev.target.value.toUpperCase().replace(/[^A-Z]/g, '');
    if (ev.target.id === 'name') S.nameDraft = ev.target.value;
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && S.modal) acts.close(); });

  render();
  connect();
})();
