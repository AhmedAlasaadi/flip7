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
  const AVATARS = [['🦊', 22], ['🐼', 210], ['🦁', 42], ['🐸', 120], ['🐙', 335], ['🦉', 28], ['🐯', 32], ['🐵', 18], ['🦄', 290], ['🐲', 150], ['🐧', 200], ['🤖', 185]];
  const urlRoom = () => (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Special players: a custom name font and avatar frame.
  const vipOf = name => /feras/i.test(name || '') ? 'feras' : /supa\s*ahmed/i.test(name || '') ? 'supa' : '';
  const FERAS_NOTES = [
    'hey i made this game cuz of you LMAOO thanks alot broski have fun',
    'good luck in this game and just because your pro im lowering your chances of good cards (im joking)',
    'damnnn who are you playing this with other than me? or are you playing with me? either good luck',
  ];

  const EGG_NOTE = 'btw you found the easter egg if your name is feras or ahmed you get a special message and a custom frame and font for your name because were tuff like that';

  const S = {
    room: null, game: null, you: null, err: '',
    screen: '', modal: null, note: '', overlayAt: 0, fresh: true, lastSeq: 0, sound: store.get('sound') !== false,
    invite: urlRoom(), creating: null, freshJoin: false, sent: false,
    avatar: Math.min(AVATARS.length - 1, Math.max(0, store.get('avatar') == null ? Math.floor(Math.random() * AVATARS.length) : store.get('avatar'))),
    deckRot: 0, renderAt: 0, lastDrawUid: 0, pendingLog: [], wasMine: false,
  };
  const arriving = new Map();   // card uid -> time it lands in the player's row
  const bustSeen = new Set();

  // ---------- networking ----------
  // One socket per room: /ws?room=CODE. Opened when creating/joining, kept alive
  // with automatic reconnects (the saved token restores the seat).
  const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const randomCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
  let ws = null, retry = 0, pingTimer = null, wantCode = null, firstMsg = null, retryTimer = null;
  const send = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

  function hangUp() {
    wantCode = null; firstMsg = null;
    clearTimeout(retryTimer); clearInterval(pingTimer);
    if (ws) { const old = ws; ws = null; old.onclose = null; try { old.close(); } catch (e) {} }
    $('#net').hidden = true;
  }
  function openRoom(code, msg) {
    hangUp();
    wantCode = code; firstMsg = msg; retry = 0;
    dial();
  }
  function dial() {
    const my = ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?room=' + wantCode);
    my.onopen = () => {
      retry = 0; S.fresh = true;
      $('#net').hidden = true;
      const sess = store.get('session');
      if (firstMsg) send(firstMsg);
      else if (sess && sess.code === wantCode) send({ t: 'join', token: sess.token, name: sess.name });
      firstMsg = null;
      clearInterval(pingTimer);
      pingTimer = setInterval(() => send({ t: 'ping' }), 20000);
    };
    my.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } onMsg(m); };
    my.onclose = () => {
      if (ws !== my || !wantCode) return;
      clearInterval(pingTimer);
      if (S.room) $('#net').hidden = false;
      retryTimer = setTimeout(dial, Math.min(5000, 500 * ++retry));
    };
  }

  function onMsg(m) {
    if (m.t === 'joined') {
      S.you = m.you; S.err = ''; S.creating = null;
      store.set('session', { code: m.code, token: m.token, name: store.get('name') || '' });
      S.invite = m.code;
      try { history.replaceState(null, '', '?room=' + m.code); } catch (e) {}
      if (S.freshJoin) { S.freshJoin = false; ferasNote(); }
    } else if (m.t === 'state') {
      const prev = S.game;
      S.room = m.room; S.game = m.game; S.you = m.you; S.sent = false;
      if (S.game) onGame(prev, S.game); else { S.renderAt = 0; S.pendingLog = []; }
      S.fresh = false;
      scheduleRender();
    } else if (m.t === 'error') {
      if (m.code === 'taken' && S.creating) { openRoom(randomCode(), { t: 'create', name: S.creating, avatar: S.avatar }); return; }
      if (!S.room) {
        if (m.code === 'noroom' || m.code === 'started') store.del('session');
        hangUp();
        S.err = m.msg; S.screen = ''; render();
      } else callout(m.msg, 'info');
    } else if (m.t === 'left') {
      goHome();
    }
  }

  function goHome() {
    hangUp();
    store.del('session');
    S.room = null; S.game = null; S.invite = ''; S.modal = null; S.screen = '';
    document.body.classList.remove('my-turn');
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    render();
  }

  // Welcome notes for certain names when they enter a room; each note is shown only once on this device.
  const NOTES = {
    feras: FERAS_NOTES.map(t => t + ' ' + EGG_NOTE),
    sultan: ['يا هلا! بالتوفيق يا خوي، وترى برمجتها عشان تخسر 😂 أمزح'],
  };
  const noteKey = name => /feras/i.test(name || '') ? 'feras' : /sultan|سلطان/i.test(name || '') ? 'sultan' : '';
  function ferasNote() {
    const who = noteKey(store.get('name'));
    if (!who) return;
    const seenNotes = store.get(who + 'Notes') || [];
    const left = NOTES[who].map((_, i) => i).filter(i => !seenNotes.includes(i));
    if (!left.length) return;
    const pick = left[Math.floor(Math.random() * left.length)];
    store.set(who + 'Notes', [...seenNotes, pick]);
    S.note = NOTES[who][pick]; S.noteWho = who;
    S.modal = 'note';
  }

  // ---------- reactions to game updates ----------
  const isMine = g => !!g && ((g.phase === 'turn' && g.turnId === S.you) || (g.phase === 'choose' && g.chooser.ownerId === S.you));
  const focusPid = g => g.phase === 'turn' ? g.turnId : g.phase === 'choose' ? g.chooser.ownerId : g.phase === 'auto' ? (g.flip3 ? g.flip3.pid : g.lastDraw ? g.lastDraw.pid : null) : null;

  function onGame(prev, g) {
    const now = performance.now();
    const drawUid = g.lastDraw ? g.lastDraw.uid : 0;
    if (S.fresh) {
      for (const p of g.players) if (p.status === 'busted') bustSeen.add(g.round + ':' + p.id);
      S.lastSeq = g.log.length ? g.log[g.log.length - 1].n : 0;
      S.lastDrawUid = drawUid; S.pendingLog = []; S.renderAt = 0;
      if (g.phase === 'roundEnd' || g.phase === 'gameOver') S.overlayAt = now;
      return;
    }
    const fresh = g.log.filter(l => l.n > S.lastSeq);
    if (fresh.length) S.lastSeq = fresh[fresh.length - 1].n;
    S.pendingLog.push(...fresh);
    // A new card was pulled: show it face-up at the deck to everyone, then update the table.
    if (drawUid && drawUid !== S.lastDrawUid && !reduced() && $('#deck')) {
      aimDeck(g);
      reveal(g.lastDraw);
      S.renderAt = Math.max(S.renderAt, now + 430);
    }
    S.lastDrawUid = drawUid;
    const ended = g.phase === 'roundEnd' || g.phase === 'gameOver';
    const was = prev && (prev.phase === 'roundEnd' || prev.phase === 'gameOver') && prev.round === g.round;
    if (ended && !was) { S.overlayAt = Math.max(S.renderAt, now) + 1900; setTimeout(render, S.overlayAt - now + 30); }
  }

  let renderTimer = null;
  function scheduleRender() {
    clearTimeout(renderTimer);
    const wait = S.renderAt - performance.now();
    if (wait <= 5) flush(); else renderTimer = setTimeout(flush, wait);
  }
  function flush() {
    const g = S.game;
    for (const l of S.pendingLog.splice(0)) {
      if (l.type !== 'deal') sfx(l.type);
      if (['bust', 'flip7', 'freeze', 'flip3', 'saved', 'win', 'reshuffle'].includes(l.type)) callout(l.text, l.type);
      if (l.type === 'second' && /gives/.test(l.text)) callout(l.text, l.type);
      if (l.type === 'flip7' || l.type === 'win') confetti();
    }
    const mine = isMine(g);
    if (mine && !S.wasMine) { sfx('turn'); try { navigator.vibrate && navigator.vibrate(60); } catch (e) {} }
    S.wasMine = mine;
    document.title = mine ? '▶ Your turn — Flip 7' : 'Flip 7 — play online with friends';
    render();
  }

  // The pulled card flips face-up over the deck (big, for everyone), then flies to its owner.
  function reveal(d) {
    const spot = $('.deckspot');
    if (!spot) return;
    const r = spot.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'flyer';
    el.style.left = (r.left + r.width / 2) + 'px';
    el.style.top = (r.top + r.height / 2) + 'px';
    el.innerHTML = cardHTML(d, '', true);
    document.body.appendChild(el);
    sfx('deal');
    const T_FLY = 620, T_LAND = 940;
    arriving.set(d.uid, performance.now() + T_LAND);
    setTimeout(() => {
      const target = document.querySelector(`#app [data-uid="${d.uid}"]`) || document.querySelector(`[data-seat="${d.pid}"] .av`);
      if (!target || !el.animate) return;
      const a = el.getBoundingClientRect(), b = target.getBoundingClientRect();
      const gone = !target.hasAttribute('data-uid');   // discarded straight away (e.g. Second Chance used)
      const s = gone ? 0.3 : b.width / a.width;
      const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
      el.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: gone ? 0 : 1 }],
        { duration: T_LAND - T_FLY, easing: 'cubic-bezier(.5,0,.25,1)', fill: 'forwards' });
    }, T_FLY);
    setTimeout(() => {
      el.remove();
      arriving.delete(d.uid);
      document.querySelectorAll(`#app [data-uid="${d.uid}"]`).forEach(c => { c.classList.remove('arriving'); c.classList.add('landed'); });
    }, T_LAND);
  }

  // The deck turns to face whoever is being dealt to or is deciding.
  function aimDeck(g) {
    const deck = $('#deck');
    if (!g || !deck) return;
    const pid = focusPid(g);
    const seat = pid && document.querySelector(`[data-seat="${pid}"]`);
    let a;
    if (seat) {
      const s = deck.parentElement.getBoundingClientRect(), r = seat.getBoundingClientRect();
      a = Math.atan2((r.top + r.height / 2) - (s.top + s.height / 2), (r.left + r.width / 2) - (s.left + s.width / 2)) * 180 / Math.PI + 90;
      a = S.deckRot + ((((a - S.deckRot + 180) % 360) + 360) % 360 - 180);   // shortest way round
    } else a = Math.round(S.deckRot / 360) * 360;
    S.deckRot = a;
    deck.style.rotate = a + 'deg';
    deck.classList.toggle('live', !!seat);
    deck.classList.toggle('mine', pid === S.you);
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
    if (reduced()) return;
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
  const pInfo = id => (S.room && S.room.players.find(p => p.id === id)) || { name: '—', avatar: 0, connected: true };
  function avatarHTML(name, idx) {
    const a = AVATARS[idx] || AVATARS[0], v = vipOf(name);
    return `<span class="av ${v ? 'vip vip-' + v : ''}" style="--h:${a[1]}"><span class="face">${a[0]}</span>${v ? `<span class="badge">${v === 'feras' ? '👑' : '⚡'}</span>` : ''}</span>`;
  }
  const nameHTML = (name, suffix = '') => { const v = vipOf(name); return `<span class="nm ${v ? 'vipname vipname-' + v : ''}">${esc(name)}${suffix}</span>`; };

  function cardHTML(c, extra = '', loose) {
    let cls = 'card ' + extra, inner = '', style = '';
    if (c.k === 'num') { cls += ' num'; inner = `<b>${c.v}</b>`; style = `--h:${HUES[c.v]};`; }
    else if (c.k === 'mod') { cls += ' mod'; inner = `<b>+${c.v}</b>`; }
    else if (c.k === 'x2') { cls += ' mod x2'; inner = '<b>×2</b>'; }
    else if (c.k === 'freeze') { cls += ' act freeze'; inner = '<i>❄</i><small>FREEZE</small>'; }
    else if (c.k === 'flip3') { cls += ' act flip3'; inner = '<i>×3</i><small>FLIP<br>THREE</small>'; }
    else { cls += ' act second'; inner = '<i>♥</i><small>SECOND<br>CHANCE</small>'; }
    if (!loose && arriving.has(c.uid)) cls += ' arriving';
    const label = c.k === 'num' ? c.v : c.k === 'mod' ? '+' + c.v : c.k === 'x2' ? 'times 2' : c.k === 'freeze' ? 'Freeze' : c.k === 'flip3' ? 'Flip Three' : 'Second Chance';
    return `<div class="${cls}" ${loose ? '' : `data-uid="${c.uid}"`} style="${style}" role="img" aria-label="${label}"><div class="ci"><div class="cf">${inner}</div><div class="cb"></div></div></div>`;
  }

  function seatHTML(p, g, me, pos) {
    const info = pInfo(p.id);
    const isTurn = focusPid(g) === p.id;
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
    return `<${tag} class="${cls}" data-seat="${p.id}" ${pos ? `style="--x:${pos[0]}%;--y:${pos[1]}%"` : ''} ${pick ? `data-act="target" data-pid="${p.id}" aria-label="Choose ${esc(info.name)}"` : ''}>
      <div class="seat-head">${avatarHTML(info.name, info.avatar)}${nameHTML(info.name, me ? ' (you)' : '')}${g.dealerId === p.id ? '<span class="dealer" title="Dealer">D</span>' : ''}<span class="tot">${p.total}<small>pts</small></span></div>
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
        return `${side}<div class="banner mine"><h2>You drew ${k} — who gets it?</h2><p>${what}</p><div class="targets">${c.targets.map(id => `<button class="btn pink small" data-act="target" data-pid="${id}">${id === me ? 'Myself' : nm(id)}</button>`).join('')}</div></div>`;
      }
      return `${side}<div class="banner"><h2>${nm(c.ownerId)} drew ${k}</h2><p>Choosing who gets it…</p></div>`;
    }
    if (g.phase === 'turn') {
      if (g.turnId === me) return `<div class="banner mine"><h2>Your turn</h2><p>Flip another card, or stay and bank your points.</p></div>`;
      return `<div class="banner"><h2>${nm(g.turnId)}'s turn</h2><p>Waiting for them to flip or stay…</p></div>`;
    }
    if (g.phase === 'auto') {
      if (g.flip3) {
        const side = g.flip3.pending.length ? `<div class="aside-cards">${g.flip3.pending.map(c => cardHTML(c)).join('')}</div>` : '';
        return `${side}<div class="banner ${g.flip3.pid === me ? 'mine' : ''}"><h2>${g.flip3.pid === me ? 'You are' : nm(g.flip3.pid) + ' is'} flipping three</h2><p>${g.flip3.left} more to go${g.flip3.pending.length ? ' · set-aside cards play afterwards' : ''}</p></div>`;
      }
      return `<div class="banner"><h2>Dealing…</h2><p>Round ${g.round}</p></div>`;
    }
    if (g.phase === 'gameOver') return `<div class="banner mine"><h2>${nm(g.winnerId)} wins!</h2></div>`;
    return `<div class="banner"><h2>Round ${g.round} is over</h2></div>`;
  }

  function noteHTML() {
    const ar = S.noteWho === 'sultan';
    const head = ar ? '<h2 lang="ar" dir="rtl">يا هلا سلطان</h2>' : '<h2 class="vipname vipname-feras">Yo Feras</h2>';
    return `<div class="overlay"><div class="modal note"><div class="trophy">👑</div>${head}<p class="notetext" ${ar ? 'lang="ar" dir="rtl"' : ''}>${esc(S.note)}</p><button class="btn primary" style="width:100%" data-act="close">${ar ? 'يلا نلعب' : "Let's play"}</button></div></div>`;
  }

  function overlayHTML(g) {
    if (S.modal === 'note') return noteHTML();
    if (S.modal === 'rules') return rulesHTML();
    if (S.modal === 'leave') return `<div class="overlay"><div class="modal"><h2>Leave the game?</h2><p class="sub">Your turns will be skipped for the rest of the game.</p><div class="row"><button class="btn ghost" data-act="close">Keep playing</button><button class="btn pink" data-act="leave-yes">Leave</button></div></div></div>`;
    if (!g || performance.now() < S.overlayAt) return '';
    if (g.phase !== 'roundEnd' && g.phase !== 'gameOver') return '';
    const over = g.phase === 'gameOver';
    const rows = [...g.players].sort((a, b) => b.total - a.total).map((p, i) => {
      const info = pInfo(p.id);
      const how = p.status === 'busted' ? 'Busted' : (p.flip7 ? 'Flip 7! ' : '') + (p.nums.map(c => c.v).join(' + ') || 'no numbers') + (p.mods.some(c => c.k === 'x2') ? ' ×2' : '') + p.mods.filter(c => c.k === 'mod').map(c => ' +' + c.v).join('') + (p.flip7 ? ' +15' : '');
      return `<div class="rrow ${over && p.id === g.winnerId ? 'win' : ''}"><span>${i + 1}</span><span class="who">${nameHTML(info.name, p.id === S.you ? ' (you)' : '')}<small>${esc(how)}</small></span><span class="gain ${p.roundScore ? '' : 'zero'}">+${p.roundScore}</span><span class="tt">${p.total}</span></div>`;
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

  const pickerHTML = () => `<div class="avpick" role="radiogroup" aria-label="Choose your picture">${AVATARS.map((a, i) => `<button class="avopt ${i === S.avatar ? 'on' : ''}" data-act="avatar" data-v="${i}" role="radio" aria-checked="${i === S.avatar}" aria-label="Picture ${i + 1}"><span class="av" style="--h:${a[1]}"><span class="face">${a[0]}</span></span></button>`).join('')}</div>`;

  // ---------- screens ----------
  function renderHome() {
    const name = esc(S.nameDraft != null ? S.nameDraft : (store.get('name') || ''));
    const inv = S.invite;
    app.innerHTML = `<div class="center-wrap"><div class="sheet">
      <h1 class="logo">FLIP<span>7</span></h1>
      <p class="tag">${inv ? `You're invited to room <b>${esc(inv)}</b>` : 'The push-your-luck card game, online with friends'}</p>
      <div class="err" id="err">${esc(S.err)}</div>
      <label class="field"><span>Your name</span><input type="text" id="name" maxlength="16" placeholder="e.g. Ahmed" value="${name}" autocomplete="nickname"></label>
      <div class="field"><span>Your picture</span>${pickerHTML()}</div>
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
    if (me.avatar != null) S.avatar = me.avatar;
    app.innerHTML = `<div class="center-wrap"><div class="sheet">
      <h1 class="logo" style="font-size:2.2rem">FLIP<span>7</span></h1>
      <p class="tag" style="margin-bottom:14px">Invite your friends, then start when everyone is ready</p>
      <div class="codebox"><small>Room code</small><b>${esc(r.code)}</b></div>
      <div class="row"><button class="btn teal" data-act="copy">Copy invite link</button>${navigator.share ? '<button class="btn ghost" data-act="share">Share…</button>' : ''}</div>
      <ul class="plist">${r.players.map(p => `<li>${avatarHTML(p.name, p.avatar)}${nameHTML(p.name, p.id === S.you ? ' (you)' : '')}${!p.connected ? '<span class="pill off">Away</span>' : ''}${p.id === r.hostId ? '<span class="pill host">Host</span>' : `<span class="pill ${p.ready ? 'ok' : ''}">${p.ready ? 'Ready' : 'Not ready'}</span>`}</li>`).join('')}</ul>
      <div class="field"><span>Your picture</span>${pickerHTML()}</div>
      <div class="opts"><span>Play to</span><span class="seg">${[100, 150, 200, 300].map(t => `<button class="${r.target === t ? 'on' : ''}" ${host ? `data-act="target-score" data-v="${t}"` : 'disabled'}>${t}</button>`).join('')}</span></div>
      ${host ? `<button class="btn primary" style="width:100%" data-act="start" ${allReady ? '' : 'disabled'}>Start game</button>
        <p class="hint">${r.players.length < 2 ? 'Waiting for at least one more player…' : allReady ? 'Everyone is ready!' : 'Waiting for everyone to be ready…'}</p>`
      : `<button class="btn ${me.ready ? 'ghost' : 'primary'}" style="width:100%" data-act="ready">${me.ready ? 'Not ready after all' : "I'm ready"}</button>
        <p class="hint">${me.ready ? 'Waiting for the host to start…' : 'Tap when you are ready to play'}</p>`}
      <div class="foot"><button class="linkish" data-act="rules">How to play</button> · <button class="linkish" data-act="leave-yes">Leave room</button></div>
    </div></div>${S.modal === 'note' ? noteHTML() : S.modal === 'rules' ? rulesHTML() : ''}`;
  }

  function renderGame() {
    const g = S.game, r = S.room;
    const myIdx = g.players.findIndex(p => p.id === S.you);
    const order = g.players.map((_, i) => g.players[(myIdx + 1 + i) % g.players.length]);
    const me = order.pop();
    const myTurn = g.phase === 'turn' && g.turnId === S.you && !S.sent;
    const ranked = [...g.players].sort((a, b) => b.total - a.total);
    const logScroll = ($('.log') || {}).scrollTop || 0;
    // Up to 6 opponents sit around the table (next player on your left, going clockwise); more use a grid.
    const n = order.length, ring = n <= 6;
    const pos = i => { const f = (i + 1) * Math.PI / (n + 1); return [(50 - 41 * Math.cos(f)).toFixed(1), (66 - 52 * Math.sin(f)).toFixed(1)]; };
    const focus = focusPid(g);
    document.body.classList.toggle('my-turn', isMine(g));
    app.innerHTML = `
      <header class="top"><div class="brand">FLIP<span>7</span></div>
        <div class="meta"><span class="chip">Room <b>${esc(r.code)}</b></span><span class="chip">Round <b>${g.round}</b></span><span class="chip">First to <b>${g.target}</b></span></div>
        <div class="tools"><button class="btn ghost small" data-act="rules" aria-label="How to play">?</button><button class="btn ghost small" data-act="sound" aria-label="Toggle sound">${S.sound ? '🔊' : '🔇'}</button><button class="btn ghost small" data-act="leave">Leave</button></div></header>
      <div class="game"><main class="table">
        <section class="arena ${ring ? 'ring' : 'crowd'} n${n}">
          <div class="opps">${order.map((p, i) => seatHTML(p, g, false, ring ? pos(i) : null)).join('')}</div>
          <div class="felt"><div class="feltin">
            <div class="deckspot" title="${g.deck} cards left"><div class="deck ${focus ? 'live' : ''} ${focus === S.you ? 'mine' : ''}" id="deck" style="rotate:${S.deckRot}deg"><span class="beam"></span><i></i><i></i><i></i></div><b class="count">${g.deck}</b></div>
            ${bannerHTML(g)}
          </div></div>
        </section>
        <section class="me">${seatHTML(me, g, true)}
          ${me.status === 'active'
            ? `<div class="actions"><button class="btn pink big" data-act="hit" ${myTurn ? '' : 'disabled'}>Flip a card</button><button class="btn teal big" data-act="stay" ${myTurn ? '' : 'disabled'}>Stay · bank ${me.score}</button></div>`
            : `<p class="waitnote">${me.status === 'busted' ? 'You busted — nothing this round.' : me.flip7 ? 'Flip 7!' : `You banked ${me.score} this round.`}</p>`}
        </section></main>
        <aside class="side">
          <div class="box"><h3>Scoreboard</h3><div class="score">${ranked.map((p, i) => `<div class="srow ${p.id === S.you ? 'you' : ''}"><span class="rk">${i + 1}</span>${nameHTML(pInfo(p.id).name)}<b>${p.total}</b><span class="bar"><i style="width:${Math.min(100, p.total / g.target * 100)}%"></i></span></div>`).join('')}</div></div>
          <div class="box"><h3>Play by play</h3><ul class="log">${[...g.log].reverse().slice(0, 25).map(l => `<li class="${esc(l.type)}">${esc(l.text)}</li>`).join('')}</ul></div>
        </aside></div>${overlayHTML(g)}`;
    const lg = $('.log'); if (lg) lg.scrollTop = logScroll;
    requestAnimationFrame(() => aimDeck(S.game));
  }

  function render() {
    const screen = !S.room ? 'home' : !S.game ? 'lobby' : 'game';
    if (screen !== 'game') document.body.classList.remove('my-turn');
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
  const inviteLink = () => location.origin + location.pathname + '?room=' + S.room.code;
  const lockActions = () => { S.sent = true; document.querySelectorAll('.actions .btn').forEach(b => { b.disabled = true; }); };

  const acts = {
    create() { const n = readName(); if (!n) return; store.del('session'); S.err = ''; S.creating = n; S.freshJoin = true; openRoom(randomCode(), { t: 'create', name: n, avatar: S.avatar }); },
    join() {
      const n = readName(); if (!n) return;
      const code = S.invite || (($('#code') || {}).value || '').toUpperCase().trim();
      if (code.length !== 4) { S.err = 'Enter the 4-letter room code.'; render(); return; }
      if (!/^[A-HJ-NP-Z]{4}$/.test(code)) { S.err = 'Room not found. Check the code and try again.'; render(); return; }
      store.del('session'); S.err = ''; S.creating = null; S.freshJoin = true;
      openRoom(code, { t: 'join', name: n, avatar: S.avatar });
    },
    noinvite() { S.invite = ''; S.err = ''; S.screen = ''; try { history.replaceState(null, '', location.pathname); } catch (e) {} render(); },
    avatar(el) {
      S.avatar = Number(el.dataset.v); store.set('avatar', S.avatar);
      document.querySelectorAll('.avopt').forEach(b => { const on = b === el; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
      if (S.room) send({ t: 'avatar', avatar: S.avatar });
    },
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
    hit() { send({ t: 'hit' }); lockActions(); },
    stay() { send({ t: 'stay' }); lockActions(); },
    target(el) { send({ t: 'target', pid: el.dataset.pid }); },
    next() { send({ t: 'next' }); },
    again() { send({ t: 'again' }); },
    rules() { S.modal = 'rules'; S.screen = ''; render(); },
    leave() { S.modal = 'leave'; render(); },
    close() { S.modal = null; S.screen = ''; render(); },
    'leave-yes'() { S.modal = null; if (ws && ws.readyState === 1) send({ t: 'leave' }); else goHome(); },
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
  addEventListener('resize', () => aimDeck(S.game));

  render();
  const saved = store.get('session');
  if (saved && saved.code && (!S.invite || S.invite === saved.code)) openRoom(saved.code, null);
})();
