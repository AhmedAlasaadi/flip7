'use strict';
// Flip 7 awards ceremony: six hand-built canvas scenes, one per award.
// Every scene is a pure function of time (draw(stage, t, data)), so it can be
// started part-way through (late joiners / reconnects), skipped to its reveal,
// or drawn as a single still frame for reduced motion.
window.Awards = (() => {
  const DUR = 8000;                 // length of a reveal; scenes keep idling after it
  const FD = '"Bangers","Fredoka","Segoe UI","Noto Sans Arabic",system-ui,sans-serif';   // display
  const FU = '"Fredoka","Segoe UI","Noto Sans Arabic",system-ui,sans-serif';             // rounded UI

  // ---------- maths ----------
  const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const seg = (t, a, b) => cl((t - a) / (b - a));
  const lerp = (a, b, p) => a + (b - a) * p;
  const eo = x => 1 - Math.pow(1 - x, 3);
  const eio = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const back = x => { const c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const elastic = x => x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
  const hash = (i, s = 0) => { const x = Math.sin(i * 127.1 + s * 311.7 + 17.3) * 43758.5453; return x - Math.floor(x); };
  const TAU = Math.PI * 2;

  // ---------- text ----------
  const graphemes = str => {
    try { return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(str)].map(x => x.segment); }
    catch (e) { return Array.from(str); }
  };
  const isRTL = str => /[֐-ࣿיִ-ﻼ]/.test(str);
  function fit(c, text, maxW, size, font, weight = '700') {
    c.font = `${weight} ${size}px ${font}`;
    const w = c.measureText(text).width;
    if (w > maxW) { size *= maxW / w; c.font = `${weight} ${size}px ${font}`; }
    return size;
  }
  function label(c, text, x, y, o) {   // centred text with optional outline, fitted to a width
    c.save();
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    fit(c, text, o.w || 900, o.size, o.font || FU, o.weight || '700');
    if (o.stroke) { c.strokeStyle = o.stroke; c.lineWidth = o.lw || 8; c.strokeText(text, x, y); }
    c.fillStyle = o.fill || '#fff';
    c.fillText(text, x, y);
    c.restore();
  }
  // A bright band sweeping across text (drawn through an offscreen mask).
  let OFF = null;
  function sweep(c, text, x, y, size, font, maxW, p, weight = '700') {
    if (p <= 0 || p >= 1) return;
    if (!OFF) { OFF = document.createElement('canvas'); OFF.width = 1200; OFF.height = 320; }
    const o = OFF.getContext('2d');
    o.globalCompositeOperation = 'source-over';
    o.clearRect(0, 0, 1200, 320);
    o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillStyle = '#fff';
    fit(o, text, maxW, size, font, weight);
    o.fillText(text, 600, 160);
    o.globalCompositeOperation = 'source-in';
    const px = -200 + p * 1600;
    const g = o.createLinearGradient(px - 110, 0, px + 110, 80);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    o.fillStyle = g; o.fillRect(0, 0, 1200, 320);
    c.save(); c.globalCompositeOperation = 'lighter'; c.drawImage(OFF, x - 600, y - 160); c.restore();
  }

  // ---------- shapes ----------
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function sparkle(c, x, y, r, rot, color) {
    c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = color; c.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, q = i % 2 ? r * 0.22 : r; c.lineTo(Math.cos(a) * q, Math.sin(a) * q); }
    c.closePath(); c.fill(); c.restore();
  }
  function rays(c, x, y, r, n, rot, color, alpha) {
    c.save(); c.translate(x, y); c.rotate(rot); c.globalAlpha = alpha; c.fillStyle = color;
    for (let i = 0; i < n; i++) { c.rotate(TAU / n); c.beginPath(); c.moveTo(0, 0); c.lineTo(r, -r * 0.09); c.lineTo(r, r * 0.09); c.closePath(); c.fill(); }
    c.restore();
  }
  function heart(c, s) {   // a leaf: heart with its point at the origin, growing upwards
    c.beginPath(); c.moveTo(0, 0);
    c.bezierCurveTo(-s * 0.9, -s * 0.5, -s * 0.75, -s * 1.25, 0, -s * 0.85);
    c.bezierCurveTo(s * 0.75, -s * 1.25, s * 0.9, -s * 0.5, 0, 0);
    c.closePath();
  }
  function clover(c, x, y, s, rot, leaves, fill, stroke) {
    c.save(); c.translate(x, y); c.rotate(rot);
    for (let i = 0; i < leaves; i++) { c.save(); c.rotate(i * TAU / leaves); heart(c, s); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = s * 0.08; c.stroke(); } c.restore(); }
    c.restore();
  }
  function begin(s) { const c = s.c; c.save(); c.translate(s.W / 2, s.H * 0.47); c.scale(s.u, s.u); return c; }
  function vgrad(c, s, stops) { const g = c.createLinearGradient(0, 0, 0, s.H); stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col)); c.fillStyle = g; c.fillRect(0, 0, s.W, s.H); }

  // The casino floor behind the hero machine: panelled wall, neon, rows of machines, patterned carpet.
  function casino(c, s, t, L) {
    const floorY = L.mh / 2 + 6, W = s.vw + 40;
    const wg = c.createLinearGradient(0, -s.vh, 0, floorY); wg.addColorStop(0, '#1a0626'); wg.addColorStop(0.6, '#4a0f38'); wg.addColorStop(1, '#6a1430');
    c.fillStyle = wg; c.fillRect(-W, -s.vh - 60, W * 2, s.vh + 60 + floorY);
    // wall panels with gold trim
    c.strokeStyle = 'rgba(255,200,90,.28)'; c.lineWidth = 4;
    for (let x = -Math.ceil(W / 260) * 260; x <= W; x += 260) { c.beginPath(); c.moveTo(x, floorY); c.lineTo(x, -s.vh); c.stroke(); rr(c, x + 34, floorY - 300, 192, 250, 96); c.stroke(); }
    // ceiling lights
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 30; i++) { const x = (hash(i, 60) - 0.5) * 2 * W, y = -s.vh * (0.35 + hash(i, 61) * 0.6), r = 14 + hash(i, 62) * 34, a = 0.1 + 0.12 * (0.5 + 0.5 * Math.sin(t * 0.003 + i * 2.1));
      c.fillStyle = ['rgba(255,210,90,', 'rgba(255,110,170,', 'rgba(120,220,255,'][i % 3] + a + ')'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
    c.restore();
    // neon signs either side
    for (const [sx, txt, col] of [[-1, '777', '#ff4fa3'], [1, 'WIN', '#3fe0ff']]) {
      const x = sx * Math.max(L.mw / 2 + 150, W * 0.68), y = -L.mh / 2 - 120, on = Math.sin(t * 0.02 + sx) > -0.92 ? 1 : 0.35;
      c.save(); c.globalAlpha = on; c.shadowColor = col; c.shadowBlur = 26; c.strokeStyle = col; c.lineWidth = 6; rr(c, x - 92, y - 46, 184, 92, 22); c.stroke();
      label(c, txt, x, y + 3, { size: 62, font: FD, fill: '#fff', stroke: col, lw: 5, weight: '400', w: 150 }); c.restore();
    }
    // rows of machines down both sides
    for (const sx of [-1, 1]) for (let i = 3; i >= 0; i--) {
      const sc = 1 - i * 0.13, x = sx * (L.mw / 2 + 150 + i * 190), h = 330 * sc, w = 170 * sc, y = floorY - h;
      c.save(); c.globalAlpha = 1 - i * 0.16;
      const bg = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0); bg.addColorStop(0, '#2b1a5a'); bg.addColorStop(0.5, '#4a2f9a'); bg.addColorStop(1, '#22134a');
      rr(c, x - w / 2, y, w, h, 20 * sc); c.fillStyle = bg; c.fill(); c.lineWidth = 5 * sc; c.strokeStyle = '#d9a441'; c.stroke();
      const hue = (i * 80 + (sx > 0 ? 40 : 200) + Math.floor(t / 400 + i) * 47) % 360;
      rr(c, x - w * 0.36, y + h * 0.16, w * 0.72, h * 0.3, 8 * sc); c.fillStyle = `hsl(${hue} 90% 62%)`; c.fill();
      c.fillStyle = 'rgba(255,255,255,.55)'; for (let k = -1; k <= 1; k++) c.fillRect(x + k * w * 0.22 - w * 0.07, y + h * 0.22, w * 0.14, h * 0.18);
      rr(c, x - w * 0.3, y + h * 0.56, w * 0.6, h * 0.1, 5 * sc); c.fillStyle = '#12061f'; c.fill();
      c.fillStyle = (Math.floor(t / 260) + i) % 2 ? '#ffd23f' : '#7a5a10'; c.beginPath(); c.arc(x, y - 6 * sc, 13 * sc, 0, TAU); c.fill();
      c.fillStyle = '#1a0a2a'; c.fillRect(x - w * 0.4, floorY - 6, w * 0.8, 8);
      c.restore();
    }
    // carpet
    const cg = c.createLinearGradient(0, floorY, 0, s.vh); cg.addColorStop(0, '#3a0818'); cg.addColorStop(1, '#6a1228');
    c.fillStyle = cg; c.fillRect(-W, floorY, W * 2, s.vh - floorY + 60);
    c.save(); c.beginPath(); c.rect(-W, floorY, W * 2, s.vh - floorY + 60); c.clip(); c.strokeStyle = 'rgba(255,200,90,.22)'; c.lineWidth = 4;
    for (let x = -Math.ceil(W / 120) * 120 - 600; x <= W + 600; x += 120) { c.beginPath(); c.moveTo(x, floorY); c.lineTo(x + 500, floorY + 500); c.moveTo(x, floorY); c.lineTo(x - 500, floorY + 500); c.stroke(); }
    c.restore();
    c.fillStyle = '#d9a441'; c.fillRect(-W, floorY - 4, W * 2, 8);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(0, floorY + 14, L.mw * 0.55, 26, 0, 0, TAU); c.fill();
  }

  // =====================================================================
  // 1. THE GAMBLER — slot machine spells the name, then jackpot
  // =====================================================================
  const SYM = ['🍒', '7', '🔔', '💎', '🍋', '★', '🍀', 'BAR'];
  function slotLayout(d) {
    if (d._slot) return d._slot;
    const g = graphemes(d.name).slice(0, 18);
    const n = g.length, rows = n > 9 ? 2 : 1, cols = Math.ceil(n / rows);
    const cell = Math.min(118, 800 / cols);
    const rtl = isRTL(d.name);
    const reels = g.map((ch, i) => {
      const r = Math.floor(i / cols), inRow = r === rows - 1 ? n - cols * (rows - 1) : cols;
      let k = i % cols; if (rtl) k = inRow - 1 - k;
      return { ch, x: (k - (inRow - 1) / 2) * cell, y: (r - (rows - 1) / 2) * cell * 1.08, stop: 1300 + (i + 1) * (3900 / n) };
    });
    return (d._slot = { reels, cell, rows, cols, mw: cols * cell + 150, mh: rows * cell * 1.08 + 190 });
  }
  const gambler = {
    title: 'THE GAMBLER', sub: 'Pushed their luck the hardest', icon: '🎰', reveal: 5700,
    cues(d) {
      const L = slotLayout(d), n = L.reels.length, q = [], PENTA = [0, 2, 4, 7, 9], MOTIF = [0, 4, 7, 12, 7, 4];
      q.push([0, s => s.noise(0, 5.35, 0.022, 520, 'bandpass', { q: 0.6, sus: true, a: 0.5, rel: 0.2, rev: 0.6 })]);
      for (let t = 150; t < 5100; t += 330 + hash(t) * 260) q.push([t, s => s.bell(N(84 + [0, 4, 7, 12, 16][Math.floor(hash(t, 1) * 5)]), 0, 0.3, 0.014, { pan: hash(t, 2) > 0.5 ? 0.9 : -0.9, rev: 0.9 })]);
      // casino floor hum under the spin
      q.push([0, s => s.pad([N(36), N(43)], 0, 5.3, 0.028, { cut: 320, a: 1.2, rev: 0.3 })]);
      // lever: ratchet clicks, then the spring
      q.push([250, s => { for (let i = 0; i < 5; i++) s.noise(i * 0.045, 0.03, 0.2, 2600, 'bandpass', { q: 3, pan: 0.5, rev: 0.05 }); s.tone(120, 0.24, 0.5, 'triangle', 0.16, 64, { vib: [17, 30], pan: 0.5 }); s.noise(0.24, 0.3, 0.1, 700, 'lowpass', { pan: 0.4 }); }]);
      // spinning: mechanical ticks plus a looping tune that steps up each time a reel locks
      for (let t = 650, k = 0; t < 5150; t += 90, k++) {
        const up = Math.floor(L.reels.filter(r => r.stop <= t).length * 7 / n);
        q.push([t, s => { s.noise(0, 0.025, 0.1, 3000 + (k % 2) * 1000, 'bandpass', { q: 2, pan: k % 2 ? 0.25 : -0.25, rev: 0.04 }); s.tone(N(72 + up + MOTIF[k % 6]), 0, 0.085, 'square', 0.032, null, { rev: 0.2, cut: 3500 }); }]);
      }
      // each reel: a solid clunk where it sits on screen, and a rising bell
      L.reels.forEach((r, i) => q.push([r.stop, s => { const pan = cl(r.x / 420, -0.8, 0.8); s.kick(0, 0.3, { f: 140, f2: 52, dur: 0.14, pan }); s.noise(0, 0.05, 0.2, 1700, 'bandpass', { pan, rev: 0.1 }); s.bell(N(72 + PENTA[i % 5] + 12 * Math.floor(i / 5)), 0.01, 0.8, 0.11, { pan, rev: 0.4 }); }]));
      q.push([4550, s => s.riser(0, 0.85, 0.15)]);
      // JACKPOT: hit, fanfare, alarm bell
      q.push([5400, s => {
        s.boom(0, 0.5, 1.5); s.cym(0, 2.4, 0.18);
        [[60, 0, 0.13], [64, 0.14, 0.13], [67, 0.28, 0.13], [72, 0.42, 0.95]].forEach(([m, at, len]) => { s.brass(N(m), at, len, 0.17, { pan: -0.2 }); s.brass(N(m + 12), at, len, 0.09, { pan: 0.25 }); });
        s.brass(N(64), 0.42, 0.95, 0.1, { pan: 0.3 }); s.brass(N(67), 0.42, 0.95, 0.1, { pan: -0.3 }); s.brass(N(48), 0.42, 0.95, 0.11);
        for (let i = 0; i < 18; i++) s.bell(N(i % 2 ? 91 : 86), 0.05 + i * 0.07, 0.12, 0.085, { pan: i % 2 ? 0.6 : -0.6, rev: 0.25 });
      }]);
      // coins raining, thinning out
      for (let t = 5520; t < 8300; t += 55 + (t - 5520) * 0.06) q.push([t, s => { const p = hash(t) * 2 - 1; s.bell(N(96 + Math.floor(hash(t, 1) * 9)), 0, 0.16, 0.075, { pan: p, rev: 0.3 }); s.noise(0, 0.018, 0.06, 7500, 'highpass', { pan: p, rev: 0.1 }); }]);
      q.push([6900, s => { s.kick(0, 0.4, { f: 120, f2: 40, dur: 0.4 }); s.cym(0, 1.6, 0.1); [48, 60, 64, 67, 72, 76].forEach((m, i) => s.brass(N(m), 0, 1.0, i ? 0.085 : 0.12, { pan: (i - 2.5) * 0.2 })); }]);
      return q;
    },
    draw(s, t, d) {
      const L = slotLayout(d), jack = t >= 5400, jp = seg(t, 5400, 6000);
      vgrad(s.c, s, jack && Math.floor(t / 110) % 2 ? ['#5a0a1c', '#a8102e', '#3a0512'] : ['#2a0410', '#7a0c24', '#1c030b']);
      const c = begin(s);
      const k = Math.min(1.5, (2 * s.vw - 40) / (L.mw + 170), (s.vh - 262) / (L.mh / 2 + 150)); c.translate(0, -34); c.scale(k, k); s = Object.assign({}, s, { vw: s.vw / k, vh: s.vh / k });
      if (jack) { rays(c, 0, 0, 1500, 16, t * 0.0006, '#ffd23f', 0.16 + 0.08 * Math.sin(t * 0.02)); }
      else casino(c, s, t, L);   // the casino floor, until the jackpot flash wipes it away
      const shake = jack ? Math.sin(t * 0.09) * 9 * (1 - seg(t, 5400, 6600)) : 0;
      const enter = back(seg(t, 0, 600));
      c.save(); c.translate(shake, (1 - enter) * 900 - 20);
      const mw = L.mw, mh = L.mh;
      // lever
      const pull = Math.sin(seg(t, 250, 900) * Math.PI);
      c.save(); c.translate(mw / 2 + 6, 30); c.rotate(lerp(-0.75, 0.75, pull));
      c.strokeStyle = '#c9c9d6'; c.lineWidth = 16; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 0); c.lineTo(70, -110); c.stroke();
      c.fillStyle = '#ff3355'; c.beginPath(); c.arc(70, -110, 30, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.arc(60, -120, 9, 0, TAU); c.fill(); c.restore();
      // body
      const bg = c.createLinearGradient(0, -mh / 2, 0, mh / 2); bg.addColorStop(0, '#ff4d6a'); bg.addColorStop(0.5, '#c2143a'); bg.addColorStop(1, '#7c0a22');
      rr(c, -mw / 2, -mh / 2, mw, mh, 46); c.fillStyle = bg; c.fill(); c.lineWidth = 12; c.strokeStyle = '#ffd23f'; c.stroke();
      // sign
      rr(c, -190, -mh / 2 - 62, 380, 96, 30); c.fillStyle = '#1c0410'; c.fill(); c.lineWidth = 8; c.strokeStyle = '#ffd23f'; c.stroke();
      label(c, jack ? 'JACKPOT!' : 'LUCKY 7s', 0, -mh / 2 - 12, { size: 64, font: FD, fill: jack && Math.floor(t / 90) % 2 ? '#fff' : '#ffd23f', w: 330, weight: '400' });
      // bulbs
      const nb = 30;
      for (let i = 0; i < nb; i++) {
        const p = i / nb, per = 2 * (mw + mh), dd = p * per;
        let bx, by;
        if (dd < mw) { bx = -mw / 2 + dd; by = -mh / 2; } else if (dd < mw + mh) { bx = mw / 2; by = -mh / 2 + dd - mw; } else if (dd < 2 * mw + mh) { bx = mw / 2 - (dd - mw - mh); by = mh / 2; } else { bx = -mw / 2; by = mh / 2 - (dd - 2 * mw - mh); }
        const on = jack ? (i + Math.floor(t / 70)) % 2 : (i + Math.floor(t / 200)) % 3 === 0;
        c.fillStyle = on ? (jack ? `hsl(${(i * 37 + t * 0.4) % 360} 100% 70%)` : '#fff6b0') : '#7a5a10';
        c.beginPath(); c.arc(bx, by, 9, 0, TAU); c.fill();
      }
      // reel window
      const ww = mw - 96, wh = L.rows * L.cell * 1.08 + 26;
      rr(c, -ww / 2, -wh / 2 + 18, ww, wh, 20); c.fillStyle = '#12020a'; c.fill();
      for (let i = 0; i < L.reels.length; i++) {
        const r = L.reels[i], cs = L.cell * 0.9, cx = r.x, cy = r.y + 18;
        c.save(); rr(c, cx - cs / 2, cy - cs / 2, cs, cs, 12); c.clip();
        const g2 = c.createLinearGradient(0, cy - cs / 2, 0, cy + cs / 2); g2.addColorStop(0, '#d9cfa8'); g2.addColorStop(0.5, '#fffdf0'); g2.addColorStop(1, '#d9cfa8');
        c.fillStyle = g2; c.fillRect(cx - cs / 2, cy - cs / 2, cs, cs);
        const rem = Math.max(0, r.stop - Math.max(t, 600));
        const dist = rem <= 450 ? Math.pow(rem / 450, 2) * 2.5 : 2.5 + (rem - 450) * 0.0111;
        const base = Math.floor(dist), bounce = t >= r.stop ? -10 * Math.sin(seg(t, r.stop, r.stop + 200) * Math.PI) : 0;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        for (let j = -1; j <= 1; j++) {
          const idx = base + j; if (idx < 0) continue;
          const sym = idx === 0 ? r.ch : SYM[Math.floor(hash(i * 31 + idx) * SYM.length)];
          const yy = cy + (dist - idx) * cs + bounce;
          const fs = fit(c, sym, cs * 0.8, cs * 0.66, idx === 0 ? FU : FD, idx === 0 ? '700' : '400');
          c.fillStyle = idx === 0 ? '#b30d2c' : '#3b2a55';
          if (rem > 450) c.globalAlpha = 0.75;
          c.fillText(sym, cx, yy + fs * 0.04);
          c.globalAlpha = 1;
        }
        const fl = t >= r.stop ? 1 - seg(t, r.stop, r.stop + 260) : 0;
        if (fl > 0) { c.fillStyle = `rgba(255,240,150,${fl * 0.85})`; c.fillRect(cx - cs / 2, cy - cs / 2, cs, cs); }
        c.restore();
        if (t >= r.stop) { rr(c, cx - cs / 2, cy - cs / 2, cs, cs, 12); c.lineWidth = 4; c.strokeStyle = jack ? '#ffd23f' : '#8d7a3a'; c.stroke(); }
      }
      // coin tray
      rr(c, -150, mh / 2 - 46, 300, 30, 12); c.fillStyle = '#12020a'; c.fill();
      c.restore();
      if (jack) {
        // name ribbon (whole name, properly shaped) + coin shower
        const sc = lerp(0.2, 1, elastic(jp));
        c.save(); c.translate(0, mh / 2 + 78); c.scale(sc, sc);
        rr(c, -430, -62, 860, 124, 30); c.fillStyle = '#1c0410'; c.fill(); c.lineWidth = 8; c.strokeStyle = '#ffd23f'; c.stroke();
        const gg = c.createLinearGradient(0, -50, 0, 50); gg.addColorStop(0, '#fff6b0'); gg.addColorStop(0.5, '#ffd23f'); gg.addColorStop(1, '#e08a00');
        label(c, d.name, 0, 4, { size: 92, font: FU, fill: gg, stroke: '#5a2a00', lw: 10, w: 800 });
        sweep(c, d.name, 0, 4, 92, FU, 800, ((t - 5900) % 1800) / 1100);
        c.restore();
        for (let i = 0; i < 70; i++) {
          const t0 = 5400 + hash(i) * 1700, age = (t - t0) % 2300; if (t < t0) continue;
          const x = (hash(i, 1) - 0.5) * 2 * s.vw, y = -s.vh - 60 + age * (0.5 + hash(i, 2) * 0.45) + age * age * 0.00016;
          const w = Math.abs(Math.cos(age * 0.011 + i)) * 26 + 3;
          c.fillStyle = '#b97800'; c.beginPath(); c.ellipse(x, y + 3, w, 27, 0, 0, TAU); c.fill();
          c.fillStyle = '#ffd23f'; c.beginPath(); c.ellipse(x, y, w, 26, 0, 0, TAU); c.fill();
          c.fillStyle = '#fff3a0'; c.beginPath(); c.ellipse(x - w * 0.2, y - 6, w * 0.45, 12, 0, 0, TAU); c.fill();
        }
        const fl = 1 - seg(t, 5400, 5750); if (fl > 0) { c.fillStyle = `rgba(255,255,220,${fl * 0.8})`; c.fillRect(-s.vw, -s.vh, s.vw * 2, s.vh * 2); }
      }
      c.restore();
    },
  };

  // A school corridor in one-point perspective: lockers down both walls, tiled floor, strip lights.
  function hallway(c, s, t) {
    const E = Math.max(s.vw, 560) + 60, bx = 200, bt = -250, bb = 120;
    const yt = bt - (E - bx) * 0.95, yb = bb + (E - bx) * 0.8;
    const at = u => ({ x: lerp(bx, E, u), top: lerp(bt, yt, u), bot: lerp(bb, yb, u) });
    // ceiling with strip lights
    c.fillStyle = '#f4f0e2'; c.beginPath(); c.moveTo(-E, yt); c.lineTo(E, yt); c.lineTo(bx, bt); c.lineTo(-bx, bt); c.fill();
    for (const [u0, u1] of [[0.06, 0.16], [0.3, 0.46], [0.66, 0.9]]) { const a = at(u0), b = at(u1); c.fillStyle = '#fffdf0'; c.beginPath(); c.moveTo(-a.x * 0.3, a.top); c.lineTo(a.x * 0.3, a.top); c.lineTo(b.x * 0.3, b.top); c.lineTo(-b.x * 0.3, b.top); c.fill(); c.strokeStyle = '#d6d0ba'; c.lineWidth = 4; c.stroke(); }
    // floor: polished tiles
    const fg = c.createLinearGradient(0, bb, 0, yb); fg.addColorStop(0, '#b3a27e'); fg.addColorStop(1, '#e6dbbd');
    c.fillStyle = fg; c.beginPath(); c.moveTo(-bx, bb); c.lineTo(bx, bb); c.lineTo(E, yb); c.lineTo(-E, yb); c.fill();
    c.strokeStyle = 'rgba(110,92,60,.35)'; c.lineWidth = 3;
    for (let i = -4; i <= 4; i++) { c.beginPath(); c.moveTo(i * bx / 4, bb); c.lineTo(i * E / 4, yb); c.stroke(); }
    for (let j = 1; j <= 6; j++) { const a = at(Math.pow(j / 6, 1.8)); c.beginPath(); c.moveTo(-a.x, a.bot); c.lineTo(a.x, a.bot); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.moveTo(-40, bb); c.lineTo(40, bb); c.lineTo(E * 0.3, yb); c.lineTo(-E * 0.3, yb); c.fill();
    // end wall with double doors and an exit sign
    c.fillStyle = '#d3dfcb'; c.fillRect(-bx, bt, bx * 2, bb - bt);
    for (const sx of [-1, 1]) { c.fillStyle = '#8a5a33'; c.fillRect(sx > 0 ? 6 : -132, -120, 126, bb + 120); c.fillStyle = '#bfe6ff'; c.fillRect(sx > 0 ? 30 : -108, -96, 78, 90); }
    rr(c, -52, -196, 104, 40, 8); c.fillStyle = '#1f9d55'; c.fill(); label(c, 'EXIT', 0, -175, { size: 26, font: FU, fill: '#fff' });
    // side walls: paint above, lockers below, posters
    for (const sx of [-1, 1]) {
      c.fillStyle = sx < 0 ? '#cfdcc6' : '#c6d5bd'; c.beginPath(); c.moveTo(sx * bx, bt); c.lineTo(sx * E, yt); c.lineTo(sx * E, yb); c.lineTo(sx * bx, bb); c.fill();
      const n = 6;
      for (let i = 0; i < n; i++) {
        const a = at(Math.pow(i / n, 1.5)), b = at(Math.pow((i + 1) / n, 1.5));
        const la = lerp(a.top, a.bot, 0.3), lb = lerp(b.top, b.bot, 0.3);
        c.fillStyle = i % 2 ? '#3f86c9' : '#3577b8'; c.strokeStyle = '#1f4f7c'; c.lineWidth = 4;
        c.beginPath(); c.moveTo(sx * a.x, la); c.lineTo(sx * b.x, lb); c.lineTo(sx * b.x, b.bot); c.lineTo(sx * a.x, a.bot); c.closePath(); c.fill(); c.stroke();
        const px = p => sx * lerp(a.x, b.x, p), py = (p, v) => lerp(lerp(la, a.bot, v), lerp(lb, b.bot, v), p);
        c.strokeStyle = 'rgba(15,45,80,.6)'; c.lineWidth = 3;
        for (let v = 0; v < 3; v++) { c.beginPath(); c.moveTo(px(0.25), py(0.25, 0.07 + v * 0.035)); c.lineTo(px(0.75), py(0.75, 0.07 + v * 0.035)); c.stroke(); }
        c.fillStyle = '#d9dde3'; c.beginPath(); c.arc(px(0.78), py(0.78, 0.5), 3 + 5 * (i + 1) / n, 0, TAU); c.fill();
      }
      // a poster on each wall
      const a = at(0.22), b = at(0.5), ya = lerp(a.top, a.bot, 0.07), yb2 = lerp(b.top, b.bot, 0.07), ha = (a.bot - a.top) * 0.17, hb = (b.bot - b.top) * 0.17;
      c.fillStyle = sx < 0 ? '#ffd23f' : '#ff7a8a'; c.strokeStyle = '#fff'; c.lineWidth = 4;
      c.beginPath(); c.moveTo(sx * a.x, ya); c.lineTo(sx * b.x, yb2); c.lineTo(sx * b.x, yb2 + hb); c.lineTo(sx * a.x, ya + ha); c.closePath(); c.fill(); c.stroke();
    }
  }

  // =====================================================================
  // 2. THE SAFE NERD — glasses push, anime lens glint, polished name
  // =====================================================================
  const nerd = {
    title: 'THE SAFE NERD', sub: 'Played it safest', icon: '🤓', reveal: 5400,
    cues() {
      const q = [];
      // pop in + a curious little marimba figure
      q.push([0, s => { for (let i = 0; i < 9; i++) s.bell(N(93), i * 0.045, 0.1, 0.035, { pan: -0.5, rev: 0.6 }); }]);   // school bell down the corridor
      q.push([100, s => { s.tone(N(53), 0, 0.2, 'sine', 0.2, N(65)); s.noise(0.13, 0.04, 0.1, 2600, 'bandpass', { rev: 0.2 }); }]);
      [65, 69, 72, 69, 65, 69, 72, 77, 72, 69, 65].forEach((m, i) => q.push([260 + i * 150, s => s.pluck(N(m), 0, 0.28, 0.1, { pan: i % 2 ? 0.25 : -0.25, rev: 0.25 })]));
      // glasses slip: slide whistle down
      q.push([950, s => s.slide(N(86), N(74), 0, 0.42, 0.08, { vib: [9, 28], pan: -0.1 })]);
      // finger: two rubbery squeaks up, then the glasses click home
      q.push([1500, s => { s.slide(480, 900, 0, 0.17, 0.07, { vib: [30, 12] }); s.slide(640, 1300, 0.21, 0.2, 0.08, { vib: [30, 12] }); }]);
      q.push([2010, s => { s.noise(0, 0.03, 0.2, 4200, 'bandpass', { q: 3 }); s.pluck(N(89), 0, 0.2, 0.07); s.riser(0, 0.32, 0.12); }]);
      // the anime glint: sub drop, low drone, and a wide shimmering "shiiing"
      q.push([2330, s => {
        s.kick(0, 0.5, { f: 95, f2: 36, dur: 0.6, rev: 0.3 }); s.tone(N(41), 0, 1.0, 'sawtooth', 0.07, null, { cut: 420, sus: true, a: 0.02, rel: 0.5, rev: 0.4 });
        s.noise(0, 1.1, 0.15, 7500, 'highpass', { rev: 0.7 });
        [96, 103, 108, 115].forEach((m, i) => s.bell(N(m), i * 0.012, 1.7, 0.065, { pan: (i - 1.5) * 0.45, rev: 0.8 }));
      }]);
      q.push([2900, s => { s.bell(N(108), 0, 0.7, 0.06, { pan: 0.5, rev: 0.7 }); s.bell(N(113), 0.07, 0.7, 0.05, { pan: 0.65, rev: 0.7 }); }]);
      // the name arrives: warm chord and a rising glockenspiel run
      q.push([3600, s => { s.whoosh(0, 0.5, 0.08, 400, 2600); s.pad([N(53), N(60), N(65), N(69), N(79)], 0, 4.2, 0.075, { cut: 1700, a: 0.5, rev: 0.5 }); [65, 69, 72, 77, 81, 84].forEach((m, i) => s.pluck(N(m), 0.05 + i * 0.07, 0.6, 0.14, { pan: (i - 2.5) * 0.22, rev: 0.45 })); }]);
      // highlight sweeps across the lettering, left to right
      q.push([5100, s => { s.whoosh(0, 1.0, 0.11, 2000, 9500, { rev: 0.45 }); for (let i = 0; i < 10; i++) s.bell(N(84 + [0, 2, 4, 7, 9][i % 5] + 12 * Math.floor(i / 5)), 0.08 + i * 0.08, 0.5, 0.065, { pan: -0.8 + i * 0.18, rev: 0.55 }); }]);
      q.push([6100, s => { s.pluck(N(77), 0, 0.3, 0.17); s.pluck(N(84), 0.16, 1.0, 0.2, { rev: 0.5 }); s.pluck(N(65), 0.16, 1.0, 0.12, { rev: 0.5 }); s.bell(N(96), 0.16, 1.3, 0.08, { rev: 0.6 }); s.kick(0.16, 0.25); }]);
      for (let t = 6600; t < 8300; t += 260) q.push([t, s => s.bell(N(96 + [0, 4, 7, 12][Math.floor(hash(t) * 4)]), 0, 0.45, 0.028, { pan: hash(t, 1) * 2 - 1, rev: 0.6 })]);
      return q;
    },
    draw(s, t, d) {
      const glint = seg(t, 2300, 3300), dark = Math.sin(seg(t, 2200, 3500) * Math.PI), hall = t < 2850;
      vgrad(s.c, s, hall ? ['#efe9d2', '#ddd5b6', '#bdb08c'] : ['#bfe6ff', '#dff3ff', '#a9d4ff']);
      const c = begin(s);
      const k0 = Math.min(1.25, (2 * s.vw - 40) / 960); c.scale(k0, k0); s = Object.assign({}, s, { vw: s.vw / k0, vh: s.vh / k0 });
      if (hall) hallway(c, s, t);
      else {
        // after the glint: notebook grid + drifting maths
        c.strokeStyle = 'rgba(70,130,220,.18)'; c.lineWidth = 2;
        for (let x = -Math.ceil(s.vw / 80) * 80; x <= s.vw; x += 80) { c.beginPath(); c.moveTo(x, -s.vh); c.lineTo(x, s.vh); c.stroke(); }
        for (let y = -Math.ceil(s.vh / 80) * 80; y <= s.vh; y += 80) { c.beginPath(); c.moveTo(-s.vw, y); c.lineTo(s.vw, y); c.stroke(); }
        const M = ['π', '∑', '√', '∞', '%', '÷', '≈', 'x²', '∫', '7'];
        for (let i = 0; i < 16; i++) {
          const x = (hash(i) - 0.5) * 2 * s.vw, y = ((hash(i, 1) * 2 * s.vh - t * (0.02 + hash(i, 2) * 0.03)) % (2 * s.vh) + 2 * s.vh) % (2 * s.vh) - s.vh;
          label(c, M[i % M.length], x, y, { size: 54 + hash(i, 3) * 40, font: FU, fill: 'rgba(40,90,190,.2)' });
        }
      }
      if (dark > 0) {   // anime moment: the world goes black (and the scenery changes behind it)
        c.fillStyle = `rgba(6,8,30,${Math.min(1, dark * 1.25)})`; c.fillRect(-s.vw, -s.vh, s.vw * 2, s.vh * 2);
        c.save(); c.globalAlpha = dark * 0.5; c.strokeStyle = '#fff';
        for (let i = 0; i < 44; i++) { const a = hash(i, 5) * TAU, r0 = 360 + hash(i, 6) * 200 - ((t * 0.5) % 80); c.lineWidth = 2 + hash(i, 7) * 5; c.beginPath(); c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 - 110); c.lineTo(Math.cos(a) * 2000, Math.sin(a) * 2000 - 110); c.stroke(); }
        c.restore();
      }
      // camera: push in for the glint, pull back for the name
      const z = lerp(1, 1.28, eio(seg(t, 1900, 2500))) * lerp(1, 0.62, eio(seg(t, 3400, 4100)));
      const camY = lerp(0, -150, eio(seg(t, 3400, 4100)));
      c.save(); c.translate(0, camY); c.scale(z, z);
      const pop = back(seg(t, 100, 650)), fy = -110 + (1 - pop) * 60, R = 200 * pop;
      if (pop > 0.02) {
        c.translate(0, fy + Math.sin(t * 0.004) * 4);
        const k = R / 200;
        c.scale(k, k);
        // the face (simple, as before)
        const fg = c.createRadialGradient(-60, -70, 20, 0, 0, 200); fg.addColorStop(0, '#fff07a'); fg.addColorStop(1, '#f7b500');
        c.fillStyle = fg; c.beginPath(); c.arc(0, 0, 200, 0, TAU); c.fill(); c.lineWidth = 8; c.strokeStyle = '#a86b00'; c.stroke();
        // mouth: closed smile, with the two front teeth peeking out under the lip
        c.fillStyle = '#fff'; c.strokeStyle = '#cfcfcf'; c.lineWidth = 2.5;
        rr(c, -25, 80, 23, 28, 6); c.fill(); c.stroke(); rr(c, 2, 80, 23, 28, 6); c.fill(); c.stroke();
        c.strokeStyle = '#5a3200'; c.lineWidth = 9; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-72, 60); c.quadraticCurveTo(0, 112, 72, 60); c.stroke();
        // glasses: slip down, then get pushed back up
        const slip = eo(seg(t, 900, 1400)) * 34 - back(seg(t, 1600, 2000)) * 44, gy = -42 + slip;
        c.fillStyle = '#3a2a1a';   // eyes (behind lenses)
        if (glint < 0.05 || glint > 0.98) { c.beginPath(); c.arc(-74, -40, 15, 0, TAU); c.arc(74, -40, 15, 0, TAU); c.fill(); }
        for (const sx of [-1, 1]) {
          const lx = sx * 76;
          rr(c, lx - 62, gy - 48, 124, 96, 26);
          const white = Math.sin(glint * Math.PI) > 0 ? cl(Math.sin(glint * Math.PI) * 1.6) : 0;
          c.fillStyle = `rgba(${lerp(200, 255, white)},${lerp(235, 255, white)},255,${lerp(0.28, 1, white)})`; c.fill();
          c.save(); c.clip();
          const bx = lx - 150 + glint * 300;   // the travelling shine
          if (glint > 0 && glint < 1) { c.fillStyle = 'rgba(255,255,255,1)'; c.beginPath(); c.moveTo(bx - 20, gy - 60); c.lineTo(bx + 30, gy - 60); c.lineTo(bx - 10, gy + 60); c.lineTo(bx - 60, gy + 60); c.fill();
            c.fillStyle = 'rgba(120,200,255,.9)'; c.beginPath(); c.moveTo(bx + 44, gy - 60); c.lineTo(bx + 58, gy - 60); c.lineTo(bx + 18, gy + 60); c.lineTo(bx + 4, gy + 60); c.fill(); }
          c.restore();
          rr(c, lx - 62, gy - 48, 124, 96, 26); c.lineWidth = 13; c.strokeStyle = '#1d1d2b'; c.stroke();
        }
        c.strokeStyle = '#1d1d2b'; c.lineWidth = 13; c.beginPath(); c.moveTo(-14, gy - 6); c.lineTo(14, gy - 6); c.stroke();
        // lens-corner star
        const st = Math.sin(seg(t, 2700, 3400) * Math.PI);
        if (st > 0) { sparkle(c, 150, gy - 52, 120 * st, t * 0.004, '#fff'); sparkle(c, 150, gy - 52, 60 * st, -t * 0.006, '#9fe0ff'); }
        // the hand: emoji-style, index finger pushing the bridge of the glasses
        const hp = eo(seg(t, 1450, 1750)) - eo(seg(t, 2050, 2350));
        if (hp > 0.01) {
          c.save(); c.translate(lerp(210, 4, hp), lerp(470, gy + 14, hp)); c.rotate(lerp(-0.75, -0.3, hp));
          const hg = c.createLinearGradient(-30, 0, 100, 0); hg.addColorStop(0, '#ffe066'); hg.addColorStop(1, '#f7b21a');
          c.fillStyle = hg; c.strokeStyle = '#c47f08'; c.lineWidth = 7; c.lineJoin = 'round';
          rr(c, 2, 232, 84, 300, 30); c.fill(); c.stroke();                       // wrist
          rr(c, -30, 122, 130, 132, 44); c.fill(); c.stroke();                    // fist
          c.save(); c.translate(-34, 196); c.rotate(0.5); c.beginPath(); c.ellipse(0, 0, 24, 46, 0, 0, TAU); c.fill(); c.stroke(); c.restore();   // thumb
          rr(c, -22, 0, 44, 178, 22); c.fill(); c.stroke();                       // index finger
          c.fillStyle = hg; c.fillRect(-18, 150, 36, 40);                         // blend finger into fist
          c.lineWidth = 5; for (const kx of [40, 66, 90]) { c.beginPath(); c.moveTo(kx - 12, 128); c.quadraticCurveTo(kx - 10, 160, kx - 12, 186); c.stroke(); }   // curled fingers
          c.strokeStyle = 'rgba(196,127,8,.55)'; c.beginPath(); c.moveTo(-10, 28); c.lineTo(10, 28); c.stroke();    // fingernail line
          c.restore();
        }
      }
      c.restore();
      // the name, in polished chrome lettering
      const np = seg(t, 3600, 4500);
      if (np > 0) {
        const y = 250, size = 150;
        c.save(); c.globalAlpha = cl(np * 2); c.translate(0, y + (1 - back(np)) * 120);
        rr(c, -470, -100, 940, 200, 40); c.fillStyle = 'rgba(14,26,70,.92)'; c.fill(); c.lineWidth = 6; c.strokeStyle = '#8fd0ff'; c.stroke();
        const g = c.createLinearGradient(0, -70, 0, 70); g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#bfe2ff'); g.addColorStop(0.5, '#5e8fd6'); g.addColorStop(0.56, '#d9efff'); g.addColorStop(1, '#8fb6ee');
        label(c, d.name, 0, 4, { size, font: FU, fill: g, stroke: '#0a1440', lw: 12, w: 860 });
        sweep(c, d.name, 0, 4, size, FU, 860, t < 6400 ? seg(t, 5100, 6100) : ((t - 6400) % 2400) / 1000);
        c.restore();
        for (let i = 0; i < 9; i++) { const tw = Math.max(0, Math.sin(t * 0.004 + i * 1.9)); if (t > 5600) sparkle(c, (hash(i, 9) - 0.5) * 900, y + (hash(i, 10) - 0.5) * 230, 30 * tw, t * 0.002, '#fff'); }
      }
      const fl = Math.sin(seg(t, 2300, 2700) * Math.PI); if (fl > 0) { c.fillStyle = `rgba(255,255,255,${fl * 0.35})`; c.fillRect(-s.vw, -s.vh, s.vw * 2, s.vh * 2); }
      c.restore();
    },
  };

  // =====================================================================
  // 3. THE LUCKIEST — sprout, vines and clovers grow around the name
  // =====================================================================
  const VM = 110;
  function vinePts(d) {
    if (d._v) return d._v;
    const vs = [];
    for (let k = 0; k < 6; k++) {
      const dir = k % 2 ? 1 : -1, a0 = Math.PI / 2 + dir * 0.25, turns = 1.05 + hash(k, 3) * 0.35, pts = [];
      for (let j = 0; j <= VM; j++) {
        const p = j / VM, a = a0 + dir * p * turns * TAU;
        const ex = Math.cos(a) * (470 + 36 * Math.sin(p * 9 + k * 2) - k * 9), ey = 30 + Math.sin(a) * (188 + 22 * Math.cos(p * 7 + k) - k * 4);
        const b = eo(Math.min(1, p * 5));
        pts.push([lerp(0, ex, b) + Math.sin(p * 30 + k) * 5, lerp(318, ey, b)]);
      }
      vs.push(pts);
    }
    return (d._v = vs);
  }
  const luckiest = {
    title: 'THE LUCKIEST', sub: 'Fortune smiled on them', icon: '🍀', reveal: 5600,
    cues() {
      const q = [], LYD = [0, 2, 4, 6, 7, 9, 11];
      // earth and air
      q.push([0, s => { s.pad([N(38), N(45)], 0, 5.6, 0.06, { cut: 520, a: 2, rev: 0.45 }); s.noise(0, 1.3, 0.05, 280, 'lowpass', { sus: true, a: 0.3, rel: 0.6 }); s.whoosh(0.2, 5, 0.04, 500, 1600, { rev: 0.4 }); }]);
      q.push([230, s => { s.kick(0, 0.3, { f: 170, f2: 70, dur: 0.12 }); s.bell(N(79), 0, 0.25, 0.05, { rev: 0.3 }); }]);   // the pot is set down
      // the sprout pushes through and wiggles
      q.push([650, s => { s.tone(N(62), 0, 0.24, 'sine', 0.14, N(74)); s.noise(0, 0.05, 0.08, 1300, 'bandpass'); }]);
      q.push([950, s => { s.slide(900, 1250, 0, 0.1, 0.04, { vib: [25, 15] }); s.slide(1000, 1400, 0.16, 0.1, 0.04, { vib: [25, 15] }); }]);
      // growth: a harp climbing three octaves, with soft pops as leaves open
      for (let i = 0; i < 21; i++) q.push([1250 + i * 172, s => { const pan = Math.sin(i * 1.3) * 0.65; s.pluck(N(62 + LYD[i % 7] + 12 * Math.floor(i / 7)), 0, 1.0, 0.11, { pan, rev: 0.55 }); if (i % 2) s.tone(520 + hash(i) * 500, 0.07, 0.07, 'sine', 0.045, 1500, { pan: -pan, rev: 0.3 }); }]);
      q.push([2500, s => s.pad([N(50), N(57), N(62), N(66), N(69)], 0, 3.1, 0.045, { cut: 900, cut2: 2600, a: 2.3, rel: 0.5, rev: 0.5 })]);
      q.push([4650, s => s.whoosh(0, 0.6, 0.09, 800, 6500, { peak: 0.92 })]);
      // the four-leaf clover: full chord and a bell-tree shimmer
      q.push([5200, s => {
        s.boom(0, 0.3, 1.3); s.cym(0, 2.0, 0.06);
        s.pad([N(50), N(57), N(62), N(66), N(69), N(73), N(76)], 0, 3.6, 0.1, { cut: 2800, a: 0.08, rel: 1.4, rev: 0.6 });
        [86, 90, 93, 98, 102, 105, 110, 114, 110, 105, 102, 98, 93, 98].forEach((m, i) => s.bell(N(m), i * 0.06, 1.4, 0.065, { pan: -0.7 + (i % 7) * 0.23, rev: 0.75 }));
      }]);
      for (let t = 5900; t < 8300; t += 210) q.push([t, s => s.bell(N(98 + LYD[Math.floor(hash(t) * 7)] + (hash(t, 2) > 0.5 ? 12 : 0)), 0, 0.5, 0.028, { pan: hash(t, 1) * 2 - 1, rev: 0.65 })]);
      q.push([7000, s => [74, 78, 81, 86].forEach((m, i) => s.pluck(N(m), i * 0.1, 1.5, 0.09, { pan: (i - 1.5) * 0.3, rev: 0.6 }))]);
      return q;
    },
    draw(s, t, d) {
      // starts as a brown potting shed and turns into the green glade as the plant takes over
      const gp = eio(seg(t, 1300, 4700));
      vgrad(s.c, s, ['#3a2513', '#5a3a1e', '#24160b']);
      s.c.save(); s.c.globalAlpha = gp; vgrad(s.c, s, ['#03231a', '#0a4a30', '#04180f']); s.c.restore();
      const c = begin(s), big = seg(t, 5200, 6200);
      const k0 = Math.min(1.3, (2 * s.vw - 30) / 1080); c.scale(k0, k0); s = Object.assign({}, s, { vw: s.vw / k0, vh: s.vh / k0 });
      if (gp < 1) {   // wooden wall planks, fading away
        c.save(); c.globalAlpha = (1 - gp) * 0.5; c.strokeStyle = '#1c1008'; c.lineWidth = 5;
        for (let x = -Math.ceil(s.vw / 150) * 150; x <= s.vw; x += 150) { c.beginPath(); c.moveTo(x, -s.vh); c.lineTo(x, 446); c.stroke(); }
        c.globalAlpha = (1 - gp) * 0.25; c.fillStyle = '#ffcf8a'; c.beginPath(); c.moveTo(-s.vw, -s.vh); c.lineTo(-s.vw + 420, -s.vh); c.lineTo(160, 446); c.lineTo(-260, 446); c.fill();   // dusty window light
        c.restore();
      }
      // light shafts + fireflies
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = gp;
      for (let i = 0; i < 5; i++) { c.fillStyle = `rgba(120,255,170,${0.035 + 0.02 * Math.sin(t * 0.001 + i)})`; c.beginPath(); const x = -500 + i * 230 + Math.sin(t * 0.0004 + i) * 40; c.moveTo(x, -s.vh); c.lineTo(x + 130, -s.vh); c.lineTo(x - 180, s.vh); c.lineTo(x - 380, s.vh); c.fill(); }
      for (let i = 0; i < 26; i++) { const x = (hash(i) - 0.5) * 2 * s.vw + Math.sin(t * 0.001 + i) * 30, y = (hash(i, 1) - 0.5) * 2 * s.vh + Math.cos(t * 0.0013 + i * 2) * 30; c.fillStyle = `rgba(200,255,120,${0.25 + 0.25 * Math.sin(t * 0.004 + i * 3)})`; c.beginPath(); c.arc(x, y, 5, 0, TAU); c.fill(); }
      c.restore();
      const V = vinePts(d), rtl = isRTL(d.name);
      const grow = k => eio(seg(t, 1200 + k * 230, 4700 + k * 110));
      const drawVine = k => {
        const pts = V[k], n = Math.floor(grow(k) * VM); if (n < 2) return;
        c.lineCap = 'round'; c.lineJoin = 'round';
        for (const [w, col] of [[15, '#0c4a26'], [9, '#2fae5b'], [3, '#9cf5ae']]) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let j = 1; j <= n; j++) c.lineTo(pts[j][0], pts[j][1]); c.stroke(); }
        for (let j = 7; j <= n; j += 7) { const g = back(seg(n - j, 0, 7)), [x, y] = pts[j]; const side = j % 14 ? 1 : -1; clover(c, x + side * 16, y - 10, (24 + hash(j, k) * 20) * g, hash(j, k + 9) * TAU + Math.sin(t * 0.002 + j) * 0.15, 3, '#39c46a', '#0c4a26'); }
      };
      // the bench and the terracotta pot everything grows out of
      c.fillStyle = gp < 0.5 ? '#3a2413' : '#1f2a14'; c.fillRect(-s.vw, 446, s.vw * 2, s.vh);
      c.fillStyle = gp < 0.5 ? '#5a3a1e' : '#2f4a22'; c.fillRect(-s.vw, 446, s.vw * 2, 12);
      const pp = back(seg(t, 0, 450));
      c.save(); c.translate(0, 446); c.scale(pp, pp); c.translate(0, -446);
      c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(0, 450, 130, 16, 0, 0, TAU); c.fill();
      const tg = c.createLinearGradient(-120, 0, 120, 0); tg.addColorStop(0, '#9c4a22'); tg.addColorStop(0.35, '#e0763c'); tg.addColorStop(0.6, '#c95f2c'); tg.addColorStop(1, '#7c3616');
      c.fillStyle = tg; c.strokeStyle = '#5a2710'; c.lineWidth = 6; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(-98, 350); c.lineTo(98, 350); c.lineTo(72, 446); c.lineTo(-72, 446); c.closePath(); c.fill(); c.stroke();
      rr(c, -118, 318, 236, 38, 10); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.18)'; rr(c, -62, 362, 16, 70, 8); c.fill();
      c.fillStyle = '#3b2412'; c.beginPath(); c.ellipse(0, 322, 104, 13, 0, 0, TAU); c.fill();
      c.fillStyle = '#5a3a1e'; c.beginPath(); c.ellipse(-10, 320, 70, 8, 0, 0, TAU); c.fill();
      c.restore();
      const sp = eo(seg(t, 300, 1200)), wig = Math.sin(t * 0.012) * 0.12 * (1 - seg(t, 900, 1600));
      if (sp > 0) { c.save(); c.translate(0, 322); c.rotate(wig); c.strokeStyle = '#2fae5b'; c.lineWidth = 12; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(14, -40 * sp, 0, -80 * sp); c.stroke();
        for (const sx of [-1, 1]) { c.save(); c.translate(0, -80 * sp); c.rotate(sx * lerp(0.1, 1.05, back(seg(t, 700, 1300)))); c.fillStyle = '#58d97e'; c.beginPath(); c.ellipse(0, -30 * sp, 17 * sp, 36 * sp, 0, 0, TAU); c.fill(); c.restore(); }
        c.restore(); }
      for (const k of [0, 1, 2]) drawVine(k);
      // the name, revealed as the growth passes over it
      const np = eio(seg(t, 2500, 5000)), size = 150, maxW = 610;
      if (np > 0) {
        c.save(); c.beginPath(); const half = 330, x0 = rtl ? half - np * 2 * half : -half; c.rect(x0 - 30, -120, np * 2 * half + 60, 300); c.clip();
        const g = c.createLinearGradient(0, -50, 0, 110); g.addColorStop(0, '#f4ffd9'); g.addColorStop(0.5, '#a8f29a'); g.addColorStop(1, '#43c267');
        label(c, d.name, 0, 30, { size, font: FU, fill: g, stroke: '#07351c', lw: 16, w: maxW });
        if (big > 0) { c.save(); c.globalAlpha = big; label(c, d.name, 0, 30, { size, font: FU, fill: 'rgba(0,0,0,0)', stroke: '#ffd23f', lw: 4, w: maxW }); c.restore(); sweep(c, d.name, 0, 30, size, FU, maxW, ((t - 5600) % 2200) / 1100); }
        c.restore();
        if (np < 1) { const ex = rtl ? 330 - np * 660 : -330 + np * 660; for (let i = 0; i < 5; i++) clover(c, ex + Math.sin(t * 0.02 + i) * 16, -60 + i * 46, 18, t * 0.004 + i, 3, '#7dffa0'); }
      }
      for (const k of [3, 4, 5]) drawVine(k);
      // the four-leaf finale
      if (big > 0) {
        const cy = -260, sc = elastic(big);
        c.save(); c.globalCompositeOperation = 'lighter';
        const gl = c.createRadialGradient(0, cy, 10, 0, cy, 340); gl.addColorStop(0, `rgba(130,255,160,${0.55 * big * (0.8 + 0.2 * Math.sin(t * 0.006))})`); gl.addColorStop(1, 'rgba(130,255,160,0)');
        c.fillStyle = gl; c.fillRect(-400, cy - 400, 800, 800); c.restore();
        rays(c, 0, cy, 420, 12, t * 0.0005, '#b8ffcf', 0.12 * big);
        c.strokeStyle = '#1f8f47'; c.lineWidth = 12; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, cy); c.quadraticCurveTo(40, cy + 80 * sc, 10, cy + 150 * sc); c.stroke();
        clover(c, 0, cy, 118 * sc, Math.PI / 4 + (1 - sc) * 3 + Math.sin(t * 0.002) * 0.05, 4, '#2fd06a', '#0b5c2c');
        clover(c, 0, cy, 70 * sc, Math.PI / 4 + (1 - sc) * 3 + Math.sin(t * 0.002) * 0.05, 4, '#7df5a0');
        for (let i = 0; i < 46; i++) {   // emerald particles
          const age = ((t - 5200) * (0.00022 + hash(i, 2) * 0.0002) + hash(i)) % 1;
          const x = (hash(i, 1) - 0.5) * 1100 + Math.sin(age * 8 + i) * 30, y = 420 - age * 900, r = (8 + hash(i, 3) * 12) * Math.sin(age * Math.PI);
          c.fillStyle = i % 3 ? '#4dffa0' : '#d6ffe2'; c.save(); c.translate(x, y); c.rotate(age * 6 + i); c.beginPath(); c.moveTo(0, -r); c.lineTo(r * 0.6, 0); c.lineTo(0, r); c.lineTo(-r * 0.6, 0); c.fill(); c.restore();
        }
      }
      c.restore();
    },
  };

  // ----- graveyard props -----
  function deadTree(c, x, y, sc, flip, t) {
    c.save(); c.translate(x, y); c.scale(sc * flip, sc);
    const sway = Math.sin(t * 0.0009 + x) * 0.012;
    c.fillStyle = '#0a0818'; c.strokeStyle = '#0a0818'; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(-34, 70); c.bezierCurveTo(-22, 20, -40, -40, -18, -110); c.bezierCurveTo(-12, -170, -2, -200, 10, -250); c.lineTo(26, -246);
    c.bezierCurveTo(22, -190, 30, -150, 24, -100); c.bezierCurveTo(20, -40, 44, 10, 46, 70); c.closePath(); c.fill();
    for (const [a, b] of [[-34, -78], [46, 96], [0, -26]]) { c.lineWidth = 14; c.beginPath(); c.moveTo(a * 0.6, 58); c.quadraticCurveTo(a, 74, b, 78); c.stroke(); }
    const br = (x0, y0, ang, len, w, depth, seed) => {
      const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
      c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(x0 + Math.cos(ang + 0.35) * len * 0.5, y0 + Math.sin(ang + 0.35) * len * 0.5, x1, y1); c.stroke();
      if (depth > 0) {
        br(x1, y1, ang - 0.45 - hash(seed) * 0.3 + sway * depth * 4, len * 0.68, w * 0.62, depth - 1, seed * 2 + 1);
        br(x1, y1, ang + 0.4 + hash(seed, 1) * 0.35 + sway * depth * 4, len * 0.6, w * 0.58, depth - 1, seed * 2 + 2);
        if (depth > 1 && hash(seed, 2) > 0.4) br((x0 + x1) / 2, (y0 + y1) / 2, ang + (hash(seed, 3) > 0.5 ? 0.9 : -0.9), len * 0.45, w * 0.4, depth - 2, seed * 3 + 7);
      }
    };
    br(-6, -120, -2.5, 120, 16, 3, 1); br(16, -170, -0.6, 130, 15, 3, 2); br(12, -246, -1.5, 110, 13, 3, 3); br(-14, -60, -2.9, 70, 10, 2, 4);
    c.fillStyle = '#1f1b3a'; c.beginPath(); c.ellipse(8, -70, 10, 17, 0.2, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(40,36,70,.9)'; c.lineWidth = 3; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(-20 + i * 11, 40 - i * 30); c.quadraticCurveTo(-8 + i * 9, 20 - i * 30, -16 + i * 12, -10 - i * 30); c.stroke(); }
    c.strokeStyle = 'rgba(70,105,80,.55)'; c.lineWidth = 3;   // hanging moss
    for (let i = 0; i < 7; i++) { const mx = -150 + i * 52, my = -250 + hash(i, 70) * 60; c.beginPath(); c.moveTo(mx, my); c.quadraticCurveTo(mx + Math.sin(t * 0.002 + i) * 8, my + 30, mx + Math.sin(t * 0.002 + i) * 12, my + 46 + hash(i, 71) * 30); c.stroke(); }
    c.restore();
  }
  // A skeleton arm, origin at the elbow end, pointing up. curl 0..1 closes the fingers.
  function boneArm(c, x, y, sc, ang, curl, out) {
    if (out <= 0.01) return;
    c.save(); c.translate(x, y); c.rotate(ang); c.scale(sc, sc);
    c.beginPath(); c.rect(-220, -420, 440, 432); c.clip(); c.translate(0, (1 - out) * 230);
    c.lineCap = 'round';
    const bone = (x0, y0, x1, y1, w) => {
      c.strokeStyle = '#2a2438'; c.lineWidth = w + 6; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.fillStyle = '#2a2438'; c.beginPath(); c.arc(x0, y0, w * 0.8 + 3, 0, TAU); c.arc(x1, y1, w * 0.8 + 3, 0, TAU); c.fill();
      c.strokeStyle = '#efe9d6'; c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.fillStyle = '#efe9d6'; c.beginPath(); c.arc(x0, y0, w * 0.8, 0, TAU); c.arc(x1, y1, w * 0.8, 0, TAU); c.fill();
    };
    bone(-9, 40, -9, -120, 9); bone(9, 40, 9, -120, 9);
    for (let i = 0; i < 4; i++) { c.fillStyle = '#2a2438'; c.beginPath(); c.arc(-15 + i * 10, -134, 8, 0, TAU); c.fill(); c.fillStyle = '#efe9d6'; c.beginPath(); c.arc(-15 + i * 10, -134, 5.5, 0, TAU); c.fill(); }
    [[-22, -0.75, [26, 20]], [-11, -0.22, [36, 26, 19]], [0, 0, [40, 28, 20]], [11, 0.2, [36, 25, 18]], [21, 0.48, [28, 20, 15]]].forEach(([fx, fa, segs], i) => {
      c.save(); c.translate(fx, -144); c.rotate(fa * (1 - curl * 0.5));
      for (const len of segs) { bone(0, 0, 0, -len, 5.5); c.translate(0, -len); c.rotate((i === 0 ? -1 : 1) * curl * (0.75 + i * 0.05)); }
      c.restore();
    });
    c.restore();
  }
  function crow(c, x, y, sc, t) {
    c.save(); c.translate(x, y + Math.abs(Math.sin(t * 0.004)) * -3); c.scale(sc, sc); c.fillStyle = '#07060f';
    c.beginPath(); c.ellipse(0, -20, 30, 19, -0.25, 0, TAU); c.fill();
    c.beginPath(); c.arc(24, -36, 13, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(34, -40); c.lineTo(56, -33); c.lineTo(34, -29); c.fill();
    c.beginPath(); c.moveTo(-24, -24); c.lineTo(-62, -8); c.lineTo(-22, -8); c.fill();
    c.strokeStyle = '#07060f'; c.lineWidth = 3; c.beginPath(); c.moveTo(-4, -4); c.lineTo(-4, 6); c.moveTo(8, -4); c.lineTo(8, 6); c.stroke();
    c.fillStyle = Math.sin(t * 0.0021) > 0.96 ? '#07060f' : '#fff'; c.beginPath(); c.arc(28, -39, 2.6, 0, TAU); c.fill();
    c.restore();
  }

  // =====================================================================
  // 4. THE UNLUCKIEST — casket, dirt, gravestone, sad trombone
  // =====================================================================
  const unluckiest = {
    title: 'THE UNLUCKIEST', sub: 'Gone too soon (again and again)', icon: '⚰️', reveal: 6200,
    cues(d) {
      const q = [], n = graphemes(d.name).length;
      const toll = v => s => { s.bell(N(46), 0, 3.4, 0.1 * v, { rev: 0.85 }); s.bell(N(58), 0, 2.4, 0.04 * v, { rev: 0.85 }); s.tone(N(34), 0, 2.6, 'sine', 0.045 * v, null, { rev: 0.5 }); };
      const thunder = v => s => { s.noise(0, 0.14, 0.3 * v, 3200, 'highpass', { rev: 0.6 }); s.noise(0.04, 2.4, 0.3 * v, 150, 'lowpass', { rev: 0.7 }); s.kick(0.04, 0.35 * v, { f: 70, f2: 27, dur: 1.1, rev: 0.4 }); };
      // night: wind and rain for the whole scene
      q.push([0, s => { s.whoosh(0, 4.6, 0.05, 420, 1250, { rev: 0.5, peak: 0.5 }); s.whoosh(3.9, 5.2, 0.05, 520, 1500, { rev: 0.5, peak: 0.5 }); s.noise(0, 9.3, 0.03, 6000, 'highpass', { sus: true, a: 0.6, rel: 1, rev: 0.2 }); }]);
      q.push([80, toll(1)]); q.push([700, thunder(0.55)]); q.push([1500, toll(0.9)]);
      // Chopin's funeral march on a wheezy low organ
      [[58, 0.55], [58, 0.4], [58, 0.15], [58, 0.55], [61, 0.4], [60, 0.15], [60, 0.4], [58, 0.15], [58, 0.4], [57, 0.15], [58, 0.7]]
        .reduce((at, [m, len]) => { q.push([at, s => { s.brass(N(m - 24), 0, len * 0.5, 0.045, { bright: 3, rev: 0.5 }); s.tone(N(m - 12), 0, len * 0.5, 'triangle', 0.05, null, { sus: true, rel: 0.08, rev: 0.5 }); }]); return at + len * 520; }, 250);
      // chiselling the name, one letter at a time
      for (let i = 0; i < n; i++) q.push([1500 + i * (1000 / n), s => { const pan = -0.4 + 0.8 * i / Math.max(1, n - 1); s.bell(N(100 + i % 3), 0, 0.09, 0.095, { pan, rev: 0.3 }); s.noise(0, 0.03, 0.16, 4600, 'highpass', { pan, rev: 0.2 }); }]);
      // shovels: scrape from one side, then the thud in the grave
      for (let i = 0; i < 7; i++) { const pan = i % 2 ? 0.65 : -0.65, at = 2950 + i * 320;
        q.push([at - 150, s => s.noise(0, 0.13, 0.13, 2400, 'bandpass', { f2: 900, q: 2, pan, rev: 0.15 })]);
        q.push([at, s => { s.kick(0, 0.4, { f: 95, f2: 37, dur: 0.23, pan: pan * 0.35 }); s.noise(0, 0.22, 0.2, 250, 'lowpass', { pan: pan * 0.35, rev: 0.2 }); for (let k = 0; k < 3; k++) s.noise(0.05 + k * 0.04, 0.02, 0.04, 5000, 'highpass', { pan: pan * 0.5 }); }]); }
      // the skeleton arm: bursts out, rattles whenever it twitches, then one last wave at the end
      q.push([3000, s => { s.noise(0, 0.18, 0.2, 500, 'lowpass', { pan: 0.3 }); s.tone(300, 0, 0.12, 'sine', 0.1, 700, { pan: 0.3 }); }]);
      for (let t = 3100; t < 4700; t += 85) if (hash(Math.floor(t / 360), 5) > 0.4) q.push([t, s => { s.tone(1100 + hash(t) * 1100, 0, 0.035, 'square', 0.035, null, { pan: 0.3, cut: 4000 }); s.noise(0, 0.02, 0.05, 3500, 'bandpass', { q: 4, pan: 0.3 }); }]);
      for (let i = 0; i < 6; i++) q.push([6950 + i * 130, s => s.tone(1300 + (i % 2) * 500, 0, 0.035, 'square', 0.03, null, { pan: -0.3, cut: 4000 })]);
      q.push([6650, s => { s.tone(560, 0, 0.17, 'sawtooth', 0.06, 430, { cut: 2400, pan: 0.2, rev: 0.4 }); s.tone(540, 0.24, 0.2, 'sawtooth', 0.06, 400, { cut: 2400, pan: 0.2, rev: 0.4 }); }]);
      // the stone grinds up out of the ground
      q.push([5000, s => { s.noise(0, 1.25, 0.26, 90, 'lowpass', { sus: true, a: 0.25, rel: 0.3 }); s.tone(42, 0, 1.2, 'sawtooth', 0.1, 56, { cut: 170, vib: [14, 12], sus: true, a: 0.2, rel: 0.2 }); s.noise(0, 1.15, 0.08, 430, 'bandpass', { q: 4, sus: true, a: 0.2, rel: 0.2 }); }]);
      q.push([6000, thunder(1.15)]);
      q.push([6080, s => s.kick(0, 0.5, { f: 82, f2: 30, dur: 0.5 })]);
      // sad trombone
      q.push([6350, s => { [[58, 0, 0.34], [57, 0.4, 0.34], [56, 0.8, 0.34]].forEach(([m, at, len]) => s.brass(N(m), at, len, 0.21, { bright: 5, vibDepth: 14, rev: 0.35 })); s.brass(N(55), 1.2, 1.35, 0.22, { bright: 4.5, fall: N(49), vibDepth: 30, vibRate: 6.5, rev: 0.4 }); }]);
      // the ghost leaves
      q.push([7150, s => { s.slide(N(72), N(79), 0, 0.5, 0.045, { vib: [6, 45], rev: 0.85, pan: 0.4 }); s.slide(N(79), N(67), 0.5, 0.9, 0.045, { vib: [6, 45], rev: 0.85, pan: 0.6 }); }]);
      q.push([8000, toll(0.6)]);
      return q;
    },
    draw(s, t, d) {
      const bolt = Math.max(1 - seg(t, 6000, 6250), 1 - seg(t, 700, 880)) * (t > 6000 || (t > 700 && t < 880) ? 1 : 0);
      vgrad(s.c, s, bolt > 0.5 ? ['#8a8fb5', '#5a5f85', '#3b3f5a'] : ['#0e0b22', '#261f47', '#15122a']);
      const c = begin(s);
      const zoomIn = eio(seg(t, 1300, 1900)) - eio(seg(t, 2500, 3000));
      const k0 = Math.min(1.3, (2 * s.vw) / 900), stoneCam = eio(seg(t, 4900, 5700));
      const z = k0 * (1 + zoomIn * 0.55 + stoneCam * 0.12), cy = lerp(-330, 0, eio(seg(t, 0, 1300))) + zoomIn * 240 - stoneCam * 150 + 60;
      c.scale(z, z); c.translate(0, -cy);
      // moon, drifting cloud, bats
      c.fillStyle = 'rgba(255,250,210,.12)'; c.beginPath(); c.arc(-300, -520, 150, 0, TAU); c.fill();
      c.fillStyle = '#f6efc0'; c.beginPath(); c.arc(-300, -520, 92, 0, TAU); c.fill();
      c.fillStyle = '#ddd4a0'; c.beginPath(); c.arc(-330, -540, 18, 0, TAU); c.arc(-270, -490, 26, 0, TAU); c.arc(-322, -480, 10, 0, TAU); c.fill();
      c.fillStyle = 'rgba(20,16,44,.72)'; for (let i = 0; i < 3; i++) { const cx = -520 + ((t * 0.02 + i * 260) % 760); c.beginPath(); c.ellipse(cx, -500 + i * 34, 150 - i * 30, 26, 0, 0, TAU); c.fill(); }
      c.fillStyle = '#07060f'; for (let i = 0; i < 4; i++) { const bx = -40 + i * 130 + Math.sin(t * 0.0012 + i * 2) * 90, by = -470 - i * 34 + Math.cos(t * 0.0017 + i) * 34, f = Math.sin(t * 0.022 + i * 1.7) * 13;
        c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx - 14, by - 14 - f, bx - 30, by - f * 0.4); c.quadraticCurveTo(bx - 16, by - 2, bx, by + 7); c.quadraticCurveTo(bx + 16, by - 2, bx + 30, by - f * 0.4); c.quadraticCurveTo(bx + 14, by - 14 - f, bx, by); c.fill(); }
      // far hills, iron fence
      c.fillStyle = '#17142e'; c.beginPath(); c.moveTo(-2000, -30); for (let x = -2000; x <= 2000; x += 100) c.lineTo(x, -40 - 60 * Math.sin(x * 0.004) - 30 * Math.sin(x * 0.011)); c.lineTo(2000, 2000); c.lineTo(-2000, 2000); c.fill();
      c.strokeStyle = '#0c0a1c'; c.fillStyle = '#0c0a1c'; c.lineWidth = 6;
      for (let x = -1100; x <= 1100; x += 44) { const h = (x / 44) % 4 === 0 ? 128 : 104; c.beginPath(); c.moveTo(x, 44); c.lineTo(x, 44 - h); c.stroke(); c.beginPath(); c.moveTo(x - 8, 44 - h); c.lineTo(x, 26 - h); c.lineTo(x + 8, 44 - h); c.fill(); }
      c.lineWidth = 7; c.beginPath(); c.moveTo(-1100, -30); c.lineTo(1100, -30); c.moveTo(-1100, 16); c.lineTo(1100, 16); c.stroke();
      // gnarled trees
      deadTree(c, -480, -30, 1.25, 1, t); deadTree(c, 530, -22, 1.05, -1, t); deadTree(c, -820, -40, 0.8, -1, t);
      // ground with grass
      c.fillStyle = '#211c3d'; c.fillRect(-2000, 40, 4000, 2000);
      c.fillStyle = '#1a1632'; for (let i = 0; i < 9; i++) { c.beginPath(); c.ellipse((hash(i, 80) - 0.5) * 1500, 120 + hash(i, 81) * 360, 170, 22, 0, 0, TAU); c.fill(); }
      c.fillStyle = '#2c3a34'; for (let i = 0; i < 46; i++) { const gx = (hash(i, 82) - 0.5) * 1700, gy = 60 + hash(i, 83) * 420; if (Math.abs(gx) < 300 && gy > 60 && gy < 430) continue; for (let b = -1; b <= 1; b++) { c.beginPath(); c.moveTo(gx + b * 7 - 4, gy); c.lineTo(gx + b * 11 + Math.sin(t * 0.002 + i) * 3, gy - 20 - hash(i, b + 84) * 12); c.lineTo(gx + b * 7 + 4, gy); c.fill(); } }
      // older graves: a leaning slab, a cross, an obelisk
      const oldStone = (gx, gy, gs, rot, kind) => { c.save(); c.translate(gx, gy); c.rotate(rot); c.scale(gs, gs);
        const og = c.createLinearGradient(-50, 0, 50, 0); og.addColorStop(0, '#3f3d58'); og.addColorStop(0.5, '#62607c'); og.addColorStop(1, '#34324a'); c.fillStyle = og; c.strokeStyle = '#201e33'; c.lineWidth = 5;
        if (kind === 0) { rr(c, -50, -130, 100, 140, 46); c.fill(); c.stroke(); c.strokeStyle = 'rgba(20,18,36,.6)'; c.lineWidth = 3; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-26, -80 + i * 20); c.lineTo(26, -80 + i * 20); c.stroke(); } }
        else if (kind === 1) { c.beginPath(); c.rect(-14, -150, 28, 160); c.rect(-48, -112, 96, 26); c.fill(); c.stroke(); }
        else { c.beginPath(); c.moveTo(-26, 10); c.lineTo(-18, -150); c.lineTo(0, -178); c.lineTo(18, -150); c.lineTo(26, 10); c.closePath(); c.fill(); c.stroke(); }
        c.fillStyle = 'rgba(70,120,80,.6)'; c.beginPath(); c.ellipse(-22, 4, 30, 9, 0, 0, TAU); c.fill(); c.restore(); };
      oldStone(-420, 80, 0.75, -0.09, 0); oldStone(440, 96, 0.8, 0.06, 1); oldStone(-650, 160, 0.95, 0.12, 2); oldStone(650, 190, 0.9, -0.05, 0); oldStone(-250, 62, 0.5, 0.04, 1);
      // the grave
      const fill = seg(t, 2900, 5000);
      c.fillStyle = '#0a0612'; c.beginPath(); c.moveTo(-175, 70); c.lineTo(175, 70); c.lineTo(275, 410); c.lineTo(-275, 410); c.closePath(); c.fill();
      c.fillStyle = '#2b1c10'; c.beginPath(); c.moveTo(-175, 70); c.lineTo(175, 70); c.lineTo(190, 120); c.lineTo(-190, 120); c.closePath(); c.fill();
      c.strokeStyle = '#3a2716'; c.lineWidth = 8; c.lineJoin = 'round'; c.beginPath(); c.moveTo(-175, 70); c.lineTo(175, 70); c.lineTo(275, 410); c.lineTo(-275, 410); c.closePath(); c.stroke();
      // casket with the engraved name
      const wood = c.createLinearGradient(-200, 0, 200, 0); wood.addColorStop(0, '#5a3418'); wood.addColorStop(0.5, '#8a5327'); wood.addColorStop(1, '#4e2c13');
      c.fillStyle = wood; c.beginPath(); c.moveTo(-120, 108); c.lineTo(120, 108); c.lineTo(168, 180); c.lineTo(212, 390); c.lineTo(-212, 390); c.lineTo(-168, 180); c.closePath(); c.fill();
      c.strokeStyle = '#d9a441'; c.lineWidth = 6; c.stroke();
      c.strokeStyle = 'rgba(40,20,5,.5)'; c.lineWidth = 3; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(-150 + i * 60, 120); c.lineTo(-190 + i * 76, 385); c.stroke(); }
      c.fillStyle = '#d9a441'; for (const [hx, hy] of [[-186, 230], [186, 230], [-200, 330], [200, 330]]) { rr(c, hx - 7, hy - 22, 14, 44, 6); c.fill(); }
      const g = graphemes(d.name), shown = Math.ceil(seg(t, 1500, 2500) * g.length);
      if (shown > 0) {
        const txt = shown >= g.length ? d.name : g.slice(0, shown).join('');
        c.save(); c.translate(0, 268); c.transform(1, 0, 0, 0.62, 0, 0);
        rr(c, -165, -60, 330, 120, 14); c.fillStyle = '#d9a441'; c.fill(); c.strokeStyle = '#7a5310'; c.lineWidth = 5; c.stroke();
        label(c, txt, 2, 5, { size: 86, font: FU, fill: '#f7e3a8', w: 300 });
        label(c, txt, 0, 2, { size: 86, font: FU, fill: '#4b2f05', w: 300 });
        c.restore();
        if (shown < g.length && t > 1500) for (let i = 0; i < 5; i++) sparkle(c, -130 + (shown / g.length) * 260 + (hash(i, shown) - 0.5) * 40, 262 + (hash(i, shown + 3) - 0.5) * 30, 12, i, '#ffe9a0');
      }
      // dirt going in
      if (fill > 0) {
        c.save(); c.beginPath(); c.moveTo(-175, 70); c.lineTo(175, 70); c.lineTo(275, 410); c.lineTo(-275, 410); c.closePath(); c.clip();
        c.fillStyle = `rgba(74,46,22,${fill * fill})`; c.fillRect(-300, 60, 600, 360);
        for (let i = 0; i < 64; i++) { const at = i / 64; if (fill < at) continue; const g2 = back(seg(fill, at, at + 0.06)); const y = 90 + hash(i, 1) * 310, w = 150 + (y - 70) * 0.3; c.fillStyle = ['#5c3a1c', '#4a2e16', '#6b4526'][i % 3]; c.beginPath(); c.ellipse((hash(i) - 0.5) * 2 * w, y, (50 + hash(i, 2) * 50) * g2, (24 + hash(i, 3) * 20) * g2, 0, 0, TAU); c.fill(); }
        c.restore();
      }
      // a skeleton arm bursts out of the dirt and twitches while the burial goes on
      const jerky = tt => (hash(Math.floor(tt / 360), 5) > 0.4 ? 1 : 0.12);
      const armOut = back(seg(t, 3000, 3350)) - eo(seg(t, 4700, 5000));
      if (armOut > 0.01) {
        boneArm(c, 118, 352, 0.82, 0.3 + (hash(Math.floor(t / 85)) - 0.5) * 0.55 * jerky(t), 0.45 + 0.45 * Math.sin(t * 0.021) * jerky(t), armOut);
        c.fillStyle = '#5c3a1c'; c.beginPath(); c.ellipse(118, 356, 46, 16, 0, 0, TAU); c.fill(); c.fillStyle = '#6b4526'; c.beginPath(); c.ellipse(104, 352, 22, 9, 0, 0, TAU); c.fill();
      }
      if (fill >= 1) { c.fillStyle = '#5c3a1c'; c.beginPath(); c.moveTo(-190, 80); c.quadraticCurveTo(0, 20, 190, 80); c.lineTo(285, 415); c.quadraticCurveTo(0, 450, -285, 415); c.closePath(); c.fill(); c.fillStyle = '#6b4526'; for (let i = 0; i < 14; i++) { c.beginPath(); c.ellipse((hash(i, 20) - 0.5) * 380, 110 + hash(i, 21) * 280, 34, 14, 0, 0, TAU); c.fill(); } }
      // shovels + flying clumps
      if (t > 2700 && t < 5200) for (const sx of [-1, 1]) {
        const ph = ((t - 2700) / 640 + (sx > 0 ? 0.5 : 0)) % 1, sw = Math.sin(ph * TAU);
        c.save(); c.translate(sx * 400, 250); c.rotate(sx * (-0.5 + sw * 0.5)); c.strokeStyle = '#9a6a3a'; c.lineWidth = 14; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 150); c.lineTo(0, -40); c.stroke(); c.fillStyle = '#b9bccb'; c.beginPath(); c.moveTo(-34, -40); c.lineTo(34, -40); c.lineTo(26, -120); c.quadraticCurveTo(0, -150, -26, -120); c.closePath(); c.fill(); c.restore();
        const fp = (ph + 0.75) % 1; if (fp < 0.5) { const q = fp / 0.5; for (let i = 0; i < 6; i++) { c.fillStyle = '#5c3a1c'; c.beginPath(); c.arc(lerp(sx * 360, (hash(i, 30) - 0.5) * 200, q), lerp(150, 250, q) - Math.sin(q * Math.PI) * (170 + i * 12), 16 - i, 0, TAU); c.fill(); } }
      }
      // the gravestone rises: weathered, cracked, mossy
      const rise = eo(seg(t, 5000, 6100));
      if (rise > 0) {
        c.save(); c.beginPath(); c.rect(-500, -900, 1000, 978); c.clip();
        c.translate(Math.sin(t * 0.08) * 5 * (1 - rise), (1 - rise) * 470);
        c.translate(0, 80); c.scale(1.4, 1.4); c.translate(0, -80);
        const slab = inset => { c.beginPath(); c.moveTo(-125 + inset, 62); c.lineTo(-125 + inset, -130); c.quadraticCurveTo(-125 + inset, -250 + inset, 0, -250 + inset); c.quadraticCurveTo(125 - inset, -250 + inset, 125 - inset, -130); c.lineTo(125 - inset, 62); c.closePath(); };
        const pl = c.createLinearGradient(0, 50, 0, 84); pl.addColorStop(0, '#7b7994'); pl.addColorStop(1, '#4a4862');
        rr(c, -152, 52, 304, 32, 6); c.fillStyle = pl; c.fill(); c.strokeStyle = '#2f2d45'; c.lineWidth = 6; c.stroke();
        const sg = c.createLinearGradient(-120, -250, 120, 60); sg.addColorStop(0, '#b6b4cc'); sg.addColorStop(0.45, '#8f8dab'); sg.addColorStop(1, '#5d5b78');
        slab(0); c.fillStyle = sg; c.fill(); c.strokeStyle = '#3b3954'; c.lineWidth = 8; c.stroke();
        c.save(); slab(0); c.clip();
        c.fillStyle = 'rgba(30,28,50,.16)'; for (let i = 0; i < 7; i++) c.fillRect(-110 + i * 36 + hash(i, 90) * 14, -250, 7 + hash(i, 91) * 10, 150 + hash(i, 92) * 160);   // rain stains
        c.fillStyle = 'rgba(255,255,255,.09)'; for (let i = 0; i < 40; i++) { c.beginPath(); c.arc((hash(i, 93) - 0.5) * 240, -240 + hash(i, 94) * 300, 2 + hash(i, 95) * 4, 0, TAU); c.fill(); }   // speckle
        c.fillStyle = 'rgba(74,130,82,.85)'; for (const [mx, my, mr] of [[-112, 40, 34], [-70, 56, 26], [104, 48, 30], [-104, -196, 22], [-80, -222, 16], [118, -60, 12]]) { c.beginPath(); c.ellipse(mx, my, mr, mr * 0.6, 0, 0, TAU); c.fill(); }
        c.fillStyle = 'rgba(120,180,110,.6)'; for (const [mx, my] of [[-116, 34], [-64, 50], [98, 42], [-100, -202]]) { c.beginPath(); c.ellipse(mx, my, 12, 7, 0, 0, TAU); c.fill(); }
        c.restore();
        slab(15); c.strokeStyle = 'rgba(40,38,64,.55)'; c.lineWidth = 3; c.stroke(); slab(19); c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 2; c.stroke();
        // carved skull
        c.fillStyle = '#3d3b58'; c.beginPath(); c.arc(0, -206, 19, 0, TAU); c.fill(); rr(c, -11, -196, 22, 17, 4); c.fill();
        c.fillStyle = '#9997b3'; c.beginPath(); c.arc(-7, -208, 5, 0, TAU); c.arc(7, -208, 5, 0, TAU); c.fill(); c.beginPath(); c.moveTo(0, -202); c.lineTo(-3, -196); c.lineTo(3, -196); c.fill();
        c.strokeStyle = '#9997b3'; c.lineWidth = 1.5; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * 5, -190); c.lineTo(i * 5, -181); c.stroke(); }
        c.strokeStyle = '#3d3b58'; c.lineWidth = 3; for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * 26, -206); c.quadraticCurveTo(sx * 52, -224, sx * 76, -200); c.quadraticCurveTo(sx * 54, -206, sx * 30, -196); c.stroke(); }
        label(c, 'R.I.P.', 0, -152, { size: 44, font: FD, fill: '#33314c', weight: '400' });
        c.strokeStyle = '#3d3b58'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(-70, -128); c.lineTo(-12, -128); c.moveTo(12, -128); c.lineTo(70, -128); c.stroke(); sparkle(c, 0, -128, 8, 0, '#3d3b58');
        label(c, d.name, 1.5, -87, { size: 60, font: FU, fill: 'rgba(255,255,255,.3)', w: 205 });
        label(c, d.name, 0, -89, { size: 60, font: FU, fill: '#2c2a44', w: 205 });
        label(c, 'ran out of luck', 0, -40, { size: 22, font: FU, fill: '#454363', w: 205, weight: '500' });
        // cracks and a chipped corner
        c.strokeStyle = 'rgba(30,28,50,.75)'; c.lineWidth = 3; c.lineJoin = 'round';
        c.beginPath(); c.moveTo(70, -238); c.lineTo(84, -196); c.lineTo(70, -168); c.lineTo(90, -128); c.lineTo(82, -104); c.moveTo(84, -196); c.lineTo(104, -184); c.stroke();
        c.beginPath(); c.moveTo(-124, -10); c.lineTo(-92, -22); c.lineTo(-100, -48); c.lineTo(-76, -58); c.stroke();
        c.fillStyle = '#211c3d'; c.beginPath(); c.moveTo(127, -150); c.lineTo(110, -166); c.lineTo(129, -190); c.fill();
        // ivy creeping up one side
        c.strokeStyle = '#2f6b3c'; c.lineWidth = 4; c.beginPath(); c.moveTo(124, 60); c.bezierCurveTo(96, 10, 136, -40, 108, -96); c.stroke();
        c.fillStyle = '#3f8f4f'; for (let i = 0; i < 7; i++) { const p = i / 6, lx = lerp(122, 108, p) + Math.sin(p * 9) * 10, ly = lerp(52, -96, p); c.save(); c.translate(lx, ly); c.rotate(i % 2 ? 0.8 : -0.9); heart(c, 15); c.fill(); c.restore(); }
        c.restore();
        for (let i = 0; i < 12; i++) { const a = seg(t, 5000 + i * 60, 5900 + i * 60); if (a > 0 && a < 1) { c.fillStyle = `rgba(150,130,110,${0.5 * (1 - a)})`; c.beginPath(); c.arc((hash(i, 40) - 0.5) * 320, 70 - a * 60, 20 + a * 36, 0, TAU); c.fill(); } }
      }
      // a crow lands on the stone; the ghost drifts off; the flower wilts; the arm gives one last wave
      const land = eo(seg(t, 6250, 6650)); if (land > 0) crow(c, lerp(520, 60, land), lerp(-700, -384, land) - Math.sin(land * Math.PI) * 40, 1.15, t);
      if (t > 6300) {
        const gp = seg(t, 6300, 9500); c.save(); c.globalAlpha = Math.sin(Math.min(1, gp * 1.2) * Math.PI) * 0.9 + 0.05;
        label(c, '👻', Math.sin(t * 0.003) * 50 + 270, 200 - gp * 520, { size: 120 }); c.restore();
        label(c, '🥀', -225, 60 - back(seg(t, 6400, 6800)) * 30, { size: 70 * back(seg(t, 6400, 6800)) });
        const wave = back(seg(t, 6900, 7250));
        if (wave > 0.01) { boneArm(c, -110, 300, 0.7, -0.25 + Math.sin(t * 0.013) * 0.4, 0.1, wave); c.fillStyle = '#6b4526'; c.beginPath(); c.ellipse(-110, 304, 40, 14, 0, 0, TAU); c.fill(); }
      }
      // fog + rain over everything
      for (let i = 0; i < 4; i++) { c.fillStyle = 'rgba(190,190,230,.07)'; c.beginPath(); c.ellipse(((t * 0.03 * (i % 2 ? 1 : -1) + i * 500) % 2400) - 1200, 120 + i * 90, 620, 60, 0, 0, TAU); c.fill(); }
      c.restore();
      const c2 = begin(s); c2.strokeStyle = 'rgba(190,200,255,.28)'; c2.lineWidth = 2.5;
      for (let i = 0; i < 70; i++) { const x = (hash(i, 50) - 0.5) * 2 * s.vw, y = ((hash(i, 51) * 2 * s.vh + t * (1.3 + hash(i, 52))) % (2 * s.vh)) - s.vh; c2.beginPath(); c2.moveTo(x, y); c2.lineTo(x - 10, y + 44); c2.stroke(); }
      if (bolt > 0) { c2.fillStyle = `rgba(255,255,255,${bolt * 0.45})`; c2.fillRect(-s.vw, -s.vh, s.vw * 2, s.vh * 2); }
      c2.restore();
    },
  };

  // =====================================================================
  // 5. THE CHAMPION — slow zoom on a jewelled throne, gold name slam
  // =====================================================================
  const GEMS = [[0, -372, '#ff3b5c', 26], [-92, -330, '#3bd0ff', 18], [92, -330, '#3bd0ff', 18], [-142, -240, '#4dff9a', 18], [142, -240, '#4dff9a', 18], [-150, -130, '#c77dff', 18], [150, -130, '#c77dff', 18], [-178, 40, '#ffd23f', 16], [178, 40, '#ffd23f', 16], [-178, 150, '#ff3b5c', 14], [178, 150, '#ff3b5c', 14], [0, -292, '#fff', 14]];
  // The crown, origin at the middle of its band. ang spins it about its vertical axis: the front
  // carries the jewels, the back carries a wide plaque with the winner's name.
  function drawCrown(c, name, ang, t, glow) {
    const cs = Math.cos(ang), front = cs >= 0, plaque = ang > 2.5 * Math.PI, sx = Math.max(0.03, Math.abs(cs));
    c.save(); c.scale(sx, 1);
    const g = c.createLinearGradient(-60, 0, 60, 0); g.addColorStop(0, '#b97800'); g.addColorStop(0.3, '#ffe27a'); g.addColorStop(0.62, '#ffc21a'); g.addColorStop(1, '#9a6200');
    c.fillStyle = g; c.strokeStyle = '#5a3200'; c.lineWidth = 3; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(-52, 12); c.lineTo(-56, -40); c.lineTo(-37, -14); c.lineTo(-27, -36); c.lineTo(-13, -14); c.lineTo(0, -50); c.lineTo(13, -14); c.lineTo(27, -36); c.lineTo(37, -14); c.lineTo(56, -40); c.lineTo(52, 12); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#8f0f2a'; c.beginPath(); c.moveTo(-44, -8); c.quadraticCurveTo(0, -24, 44, -8); c.lineTo(44, -6); c.lineTo(-44, -6); c.fill();   // velvet peeking through
    rr(c, -54, -6, 108, 20, 5); c.fillStyle = g; c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.45)'; c.fillRect(-48, -3, 96, 3);
    for (const [px, py] of [[-56, -40], [-27, -36], [0, -50], [27, -36], [56, -40]]) { c.fillStyle = '#fff2a0'; c.beginPath(); c.arc(px, py - 3, 5, 0, TAU); c.fill(); c.stroke(); }
    if (front) {
      [[-34, '#3bd0ff'], [0, '#ff3b5c'], [34, '#4dff9a']].forEach(([gx, col], i) => { c.save(); c.translate(gx, 4); c.rotate(Math.PI / 4); c.fillStyle = col; rr(c, -6, -6, 12, 12, 2); c.fill(); c.stroke(); c.fillStyle = 'rgba(255,255,255,.8)'; c.fillRect(-4, -4, 4, 4); c.restore(); if (i === 1) sparkle(c, gx, 4, 9 + 3 * Math.sin(t * 0.008), t * 0.003, '#fff'); });
    } else if (plaque) {
      // the name plaque across the back of the crown (only on the last turn, as it comes to rest)
      const PW = 236;
      if (glow > 0) { c.save(); c.globalCompositeOperation = 'lighter'; const hg = c.createRadialGradient(0, 4, 4, 0, 4, 150); hg.addColorStop(0, `rgba(255,220,120,${0.5 * glow})`); hg.addColorStop(1, 'rgba(255,220,120,0)'); c.fillStyle = hg; c.fillRect(-160, -90, 320, 190); c.restore(); }
      rr(c, -PW / 2, -17, PW, 40, 9); c.fillStyle = '#2a0d47'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#ffd23f'; c.stroke();
      rr(c, -PW / 2 + 5, -12, PW - 10, 30, 6); c.lineWidth = 1.2; c.strokeStyle = 'rgba(255,226,122,.7)'; c.stroke();
      const tg = c.createLinearGradient(0, -12, 0, 18); tg.addColorStop(0, '#fffbd0'); tg.addColorStop(0.4, '#ffd23f'); tg.addColorStop(0.6, '#f0a000'); tg.addColorStop(0.68, '#fff2a0'); tg.addColorStop(1, '#c97f00');
      label(c, name, 0, 4.5, { size: 28, font: FD, fill: tg, stroke: '#3a1c00', lw: 3, w: PW - 26, weight: '400' });
      sweep(c, name, 0, 4.5, 28, FD, PW - 26, ((t - 5600) % 1900) / 1100, '400');
      for (const ex of [-PW / 2, PW / 2]) { c.fillStyle = '#ffd23f'; c.strokeStyle = '#5a3200'; c.lineWidth = 2; c.beginPath(); c.arc(ex, 3, 6, 0, TAU); c.fill(); c.stroke(); }
    }
    if (sx < 0.5) { c.fillStyle = `rgba(40,20,0,${(0.5 - sx) * 0.9})`; c.fillRect(-60, -56, 120, 76); }   // edge-on shading
    c.restore();
  }

  // Timeline: 0-4 s the hall, with the throne's jewels lighting one by one; 4-7 s the walk up to the king;
  // from 7 s the crown spin, the name and the wink. u() maps real time onto the close-up's own clock.
  const LATE = 2800, GEM_AT = i => 1000 + i * 222;
  const champU = t => t < 4000 ? 0 : t < 7000 ? (t - 4000) * 1.4 : t - LATE;
  const champion = {
    title: 'THE CHAMPION', sub: 'All hail the winner', icon: '👑', reveal: 8500, thumb: 9750, dur: 10800,
    cues() {
      const q = [], L = [], MAJ = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19];
      const timp = (m, at, v) => s => { s.kick(at, v, { f: N(m) * 2.2, f2: N(m), dur: 0.9, rev: 0.45 }); };
      const tpt = (m, at, len, v, o) => s => { s.brass(N(m), at, len, v, Object.assign({ bright: 6, rev: 0.4 }, o)); };
      // 1. the throne room (0-4 s): a slow procession. Organ-like pedal, timpani on tonic and dominant,
      //    a dotted horn call answered a fifth up, and one bell per jewel as it lights.
      q.push([0, s => s.pad([N(36), N(48), N(55), N(60), N(64)], 0, 4.2, 0.06, { cut: 700, cut2: 1500, a: 0.5, rel: 0.5, rev: 0.6 })]);
      [[0, 36], [500, 36], [1000, 43], [1500, 43], [2000, 36], [2500, 36], [3000, 43], [3500, 43]].forEach(([t, m], i) => q.push([t, timp(m, 0, i % 2 ? 0.1 : 0.17)]));
      // horn call: long, short-short, long (C  C C  G), then the answer (E  E E  C')
      [[0, 60, 0.42], [500, 60, 0.12], [680, 60, 0.12], [1000, 67, 0.8], [2000, 64, 0.42], [2500, 64, 0.12], [2680, 64, 0.12], [3000, 72, 0.8]].forEach(([t, m, len]) => q.push([t, s => { tpt(m, 0, len, 0.075, { pan: -0.25, bright: 4 })(s); tpt(m - 12, 0, len, 0.06, { pan: 0.25, bright: 3 })(s); }]));
      GEMS.forEach(([gx], i) => q.push([GEM_AT(i), s => { const pan = cl(gx / 200, -0.8, 0.8); s.bell(N(72 + MAJ[i]), 0, 1.3, 0.11, { pan, rev: 0.7 }); s.pluck(N(60 + MAJ[i]), 0, 0.5, 0.07, { pan: -pan, rev: 0.5 }); s.noise(0, 0.05, 0.03, 7000, 'highpass', { pan, rev: 0.5 }); }]));
      // every jewel flares together
      q.push([3700, s => { [72, 76, 79, 84, 88, 91].forEach((m, i) => s.bell(N(m), i * 0.018, 1.8, 0.07, { pan: (i - 2.5) * 0.3, rev: 0.8 })); s.cym(0, 1.6, 0.07); }]);
      // 2. the walk up to the king (4-7 s): snare roll tightening, timpani quickening, brass climbing I - IV - V
      for (let t = 4000, gap = 120, k = 0; t < 7000; t += gap, gap = Math.max(38, gap * 0.94), k++) { const v = 0.05 + 0.15 * Math.pow((t - 4000) / 3000, 1.4); q.push([t, s => { s.noise(0, 0.05, v, 1900, 'bandpass', { q: 0.8, rev: 0.18, pan: k % 2 ? 0.12 : -0.12 }); if (k % 4 === 0) s.tone(185, 0, 0.04, 'triangle', v * 0.5, 150); }]); }
      [[4000, 36], [4700, 43], [5300, 36], [5800, 43], [6200, 36], [6500, 43], [6750, 43]].forEach(([t, m]) => q.push([t, timp(m, 0, 0.15)]));
      [[4000, [48, 55, 60, 64], 0.05], [5000, [53, 57, 60, 65], 0.065], [6000, [55, 59, 62, 67, 71], 0.08]].forEach(([t, ch, v]) => q.push([t, s => ch.forEach((m, i) => s.brass(N(m), 0, 0.95, v, { pan: (i - ch.length / 2) * 0.25, bright: 4 + (t - 4000) / 700, rev: 0.4 }))]));
      [[6000, 67], [6250, 67], [6500, 71], [6750, 74]].forEach(([t, m]) => q.push([t, tpt(m, 0, 0.2, 0.09, { pan: 0.2, bright: 7 })]));
      // face to face with the king: everything stops, one low note
      L.push([4200, s => { s.kick(0, 0.4, { f: 90, f2: 34, dur: 0.7, rev: 0.4 }); s.tone(N(36), 0, 1.2, 'sine', 0.1, null, { sus: true, a: 0.02, rel: 0.5, rev: 0.4 }); }]);
      // the crown spins: three whooshes getting faster and higher, with a shimmer rising under them
      [[4500, 0.3, 900], [4800, 0.25, 1400], [5060, 0.2, 2000]].forEach(([t, len, f], i) => L.push([t, s => { s.whoosh(0, len, 0.13, f, f * 3, { pan: i % 2 ? 0.5 : -0.5, q: 2 }); s.bell(N(84 + i * 4), len * 0.5, 0.3, 0.05, { rev: 0.6 }); }]));
      L.push([4500, s => s.riser(0, 0.88, 0.16)]);
      // it stops on the name: crash and fanfare
      L.push([5400, s => {
        s.boom(0, 0.55, 1.9); s.cym(0, 2.8, 0.28);
        [[67, 0, 0.12], [67, 0.15, 0.12], [67, 0.3, 0.12]].forEach(([m, at, len]) => { s.brass(N(m), at, len, 0.12, { pan: -0.2 }); s.brass(N(m - 12), at, len, 0.08, { pan: 0.2 }); });
        [[48, 0.1], [60, 0.1], [64, 0.09], [67, 0.1], [72, 0.15], [76, 0.09]].forEach(([m, v], i) => s.brass(N(m), 0.46, 1.1, v, { pan: (i - 2.5) * 0.22, bright: 7.5 }));
        s.kick(0.46, 0.6, { f: 110, f2: 35, dur: 0.8 }); s.kick(0.46, 0.3, { f: N(36) * 2.2, f2: N(36), dur: 1.2, rev: 0.4 });
        s.pad([N(48), N(55), N(60), N(64), N(67)], 0.46, 3.4, 0.05, { cut: 3000, a: 0.05, rel: 1.2, rev: 0.6 });
      }]);
      // the king looks up... and likes what he sees
      L.push([5560, s => { s.pluck(N(79), 0, 0.2, 0.09, { rev: 0.4 }); s.pluck(N(84), 0.12, 0.3, 0.1, { rev: 0.4 }); }]);
      L.push([6000, s => [72, 76, 79, 84].forEach((m, i) => s.pluck(N(m), i * 0.05, 0.6, 0.1, { pan: (i - 1.5) * 0.3, rev: 0.5 }))]);
      // the wink
      L.push([6620, s => { s.bell(N(103), 0, 0.7, 0.09, { pan: 0.25, rev: 0.7 }); s.bell(N(108), 0.05, 0.7, 0.06, { pan: 0.35, rev: 0.7 }); s.tone(700, 0, 0.06, 'sine', 0.08, 1500); }]);
      // closing cadence: IV, V, I
      L.push([7000, s => {
        [[[53, 60, 65, 69], 0, 0.26], [[55, 62, 67, 71], 0.28, 0.26], [[48, 60, 64, 67, 72, 79], 0.57, 1.5]].forEach(([ch, at, len]) => ch.forEach((m, i) => s.brass(N(m), at, len, i ? 0.09 : 0.1, { pan: (i - ch.length / 2) * 0.22, bright: 7.5 })));
        s.kick(0, 0.3, { f: N(41) * 2.2, f2: N(41), dur: 0.5 }); s.kick(0.28, 0.3, { f: N(43) * 2.2, f2: N(43), dur: 0.5 }); s.kick(0.57, 0.5, { f: N(36) * 2.2, f2: N(36), dur: 1.4, rev: 0.4 }); s.cym(0.57, 2.2, 0.16);
      }]);
      for (let t = 5900; t < 8300; t += 230) L.push([t, s => s.bell(N(96 + MAJ[Math.floor(hash(t) * 8)]), 0, 0.4, 0.026, { pan: hash(t, 1) * 2 - 1, rev: 0.6 })]);
      // after the crown lands: cathedral bells pealing down, and a trumpet flourish up to the wink
      [[8900, 84], [9080, 79], [9260, 76], [9440, 72]].forEach(([t, m], i) => q.push([t, s => { s.bell(N(m), 0, 1.6, 0.07, { pan: i % 2 ? 0.5 : -0.5, rev: 0.8 }); s.bell(N(m - 12), 0, 1.6, 0.05, { pan: i % 2 ? -0.3 : 0.3, rev: 0.8 }); }]));
      [[9200, 67], [9320, 72], [9440, 76]].forEach(([t, m]) => q.push([t, tpt(m, 0, 0.1, 0.07, { pan: -0.3, bright: 7 })]));
      // timpani roll into the last chord
      for (let t = 9800; t < 10360; t += 62) q.push([t, timp(t < 10080 ? 41 : 43, 0, 0.07 + (t - 9800) / 6000)]);
      q.push([10370, s => { s.bell(N(60), 0, 2.4, 0.09, { rev: 0.85 }); s.bell(N(67), 0, 2.4, 0.06, { pan: 0.4, rev: 0.85 }); s.bell(N(72), 0.02, 2.4, 0.06, { pan: -0.4, rev: 0.85 }); s.pad([N(36), N(48), N(55), N(60), N(64), N(72)], 0, 2.6, 0.05, { cut: 2600, a: 0.03, rel: 1.4, rev: 0.7 }); }]);
      for (const [t, f] of L) q.push([t + LATE, f]);
      return q;
    },
    draw(s, T, d) {
      const t = champU(T);
      const zoom = eio(seg(t, 0, 4200)), rev = t >= 5400, rp = seg(t, 5400, 6000), out = eio(seg(t, 4900, 5750));
      vgrad(s.c, s, ['#1a0633', '#3d0f66', '#12041f']);
      const c = begin(s);
      // The camera travels from the whole hall right up to the king's face, then eases back a touch for the name.
      // zf frames face + crown + name plaque; zc is the extreme close-up on his eyes and crown before that.
      const zf = Math.min(4.4, (2 * s.vw - 80) / 236), zc = zf * 1.6;
      const zg = Math.min((2 * s.vw - 50) / 470, (2 * s.vh - 70) / 760), zp = lerp(0.5, zg * 0.9, eio(seg(T, 0, 1100))) + zg * 0.1 * seg(T, 1100, 4000);   // the throne fills the view while its jewels light
      const z = lerp(lerp(zp, zc, zoom), zf, out);
      const camY = lerp(lerp(lerp(40, -85, eio(seg(T, 0, 1100))), -122, zoom), -106, out);
      const shake = rev ? Math.sin(t * 0.1) * 9 * (1 - seg(t, 5400, 6100)) : 0;
      // hall (moves slower than the throne: parallax)
      c.save(); c.translate(shake, 0); c.scale(lerp(1, z, 0.45), lerp(1, z, 0.45));
      for (const sx of [-1, 1]) for (let i = 1; i <= 3; i++) { const px = sx * (260 + i * 250); const pg = c.createLinearGradient(px - 50, 0, px + 50, 0); pg.addColorStop(0, '#2a0d47'); pg.addColorStop(0.5, '#5a2a8a'); pg.addColorStop(1, '#240a3d'); c.fillStyle = pg; c.fillRect(px - 46, -1400, 92, 2800); c.fillStyle = '#c9972a'; c.fillRect(px - 60, 330, 120, 30); c.fillRect(px - 60, -560, 120, 26);
        c.fillStyle = '#a3102e'; c.beginPath(); c.moveTo(px - 130 * sx - 40, -540); c.lineTo(px - 130 * sx + 40, -540); c.lineTo(px - 130 * sx + 40, -260); c.lineTo(px - 130 * sx, -310); c.lineTo(px - 130 * sx - 40, -260); c.fill(); }
      c.restore();
      c.save(); c.translate(shake, 0); c.scale(z, z); c.translate(0, -camY);
      if (rev) rays(c, 0, -140, 900, 18, t * 0.0004, '#ffe27a', 0.22 * rp);
      c.fillStyle = '#8f0f2a'; c.beginPath(); c.moveTo(-130, 250); c.lineTo(130, 250); c.lineTo(420, 1600); c.lineTo(-420, 1600); c.fill();
      c.strokeStyle = '#ffd23f'; c.lineWidth = 8; c.beginPath(); c.moveTo(-112, 250); c.lineTo(-380, 1600); c.moveTo(112, 250); c.lineTo(380, 1600); c.stroke();
      for (let i = 0; i < 3; i++) { c.fillStyle = ['#3a1560', '#4a1c78', '#5a2390'][i]; rr(c, -330 + i * 40, 250 + (2 - i) * 34, 660 - i * 80, 40, 8); c.fill(); }
      // throne
      const gold = c.createLinearGradient(-200, 0, 200, 0); gold.addColorStop(0, '#b97800'); gold.addColorStop(0.3, '#ffe27a'); gold.addColorStop(0.6, '#ffc21a'); gold.addColorStop(1, '#9a6200');
      c.fillStyle = gold; c.strokeStyle = '#5a3200'; c.lineWidth = 8; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(-170, 250); c.lineTo(-170, -230); c.quadraticCurveTo(-170, -330, -60, -340); c.lineTo(0, -420); c.lineTo(60, -340); c.quadraticCurveTo(170, -330, 170, -230); c.lineTo(170, 250); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#b3122a'; c.beginPath(); c.moveTo(-122, 120); c.lineTo(-122, -210); c.quadraticCurveTo(-122, -280, 0, -290); c.quadraticCurveTo(122, -280, 122, -210); c.lineTo(122, 120); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = 'rgba(0,0,0,.18)'; for (let yy = -220; yy < 100; yy += 70) for (let xx = -70; xx <= 70; xx += 70) { c.beginPath(); c.arc(xx + ((yy / 70) % 2 ? 35 : 0), yy, 6, 0, TAU); c.fill(); }
      c.fillStyle = gold; for (const sx of [-1, 1]) { rr(c, sx * 178 - 44, 10, 88, 240, 20); c.fill(); c.stroke(); c.beginPath(); c.arc(sx * 178, 8, 38, 0, TAU); c.fill(); c.stroke(); }
      rr(c, -150, 120, 300, 70, 16); c.fillStyle = '#d4183a'; c.fill(); c.stroke();
      // The jewels: dark at first, then each one catches fire in turn (a ring bursts out of it and its
      // colour washes over the gold), and finally they all flare together before the camera moves in.
      const all = seg(T, 3700, 3850) * (1 - seg(T, 3850, 4700));
      if (T > 600) { c.save(); c.globalCompositeOperation = 'lighter'; GEMS.forEach(([gx, gy, col, r], i) => { const on = seg(T, GEM_AT(i), GEM_AT(i) + 200); if (on <= 0) return; const a2 = 0.16 * on + 0.5 * (1 - seg(T, GEM_AT(i), GEM_AT(i) + 700)) * on + 0.4 * all; const wg = c.createRadialGradient(gx, gy, 2, gx, gy, 190); wg.addColorStop(0, col); wg.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = Math.min(1, a2); c.fillStyle = wg; c.beginPath(); c.arc(gx, gy, 190, 0, TAU); c.fill(); }); c.restore(); }
      GEMS.forEach(([gx, gy, col, r], i) => {
        const at = GEM_AT(i), on = seg(T, at, at + 200), lit = on > 0, pop = lit ? 1 - seg(T, at, at + 650) : 0, pulse = 0.75 + 0.25 * Math.sin(T * 0.008 + i);
        if (lit) { c.save(); c.globalCompositeOperation = 'lighter'; const hg = c.createRadialGradient(gx, gy, 2, gx, gy, r * (3 + 3 * pop + 2 * all) * pulse); hg.addColorStop(0, col); hg.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = 0.9 * on; c.fillStyle = hg; c.beginPath(); c.arc(gx, gy, r * 9, 0, TAU); c.fill(); c.restore(); }
        if (pop > 0 && pop < 1) { const k = 1 - pop; c.save(); c.globalAlpha = pop; c.strokeStyle = col; c.lineWidth = 5 * pop + 1; c.beginPath(); c.arc(gx, gy, r + k * 95, 0, TAU); c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = 3 * pop; for (let j = 0; j < 8; j++) { const a2 = j * TAU / 8 + i; c.beginPath(); c.moveTo(gx + Math.cos(a2) * (r + k * 30), gy + Math.sin(a2) * (r + k * 30)); c.lineTo(gx + Math.cos(a2) * (r + k * 80), gy + Math.sin(a2) * (r + k * 80)); c.stroke(); } c.restore(); }
        const sc2 = 1 + 0.55 * pop + 0.3 * all;
        c.save(); c.translate(gx, gy); c.rotate(Math.PI / 4); c.scale(sc2, sc2); c.fillStyle = lit ? col : '#3a2c45'; c.strokeStyle = '#2a1500'; c.lineWidth = 4; rr(c, -r, -r, r * 2, r * 2, 5); c.fill(); c.stroke(); c.fillStyle = `rgba(255,255,255,${lit ? 0.85 : 0.14})`; c.fillRect(-r * 0.55, -r * 0.55, r * 0.6, r * 0.6); if (pop > 0) { c.fillStyle = `rgba(255,255,255,${pop * 0.9})`; rr(c, -r, -r, r * 2, r * 2, 5); c.fill(); } c.restore();
        if (lit) sparkle(c, gx, gy, r * (1.6 + pop * 4 + all * 3) * pulse, T * 0.003 + i, '#fff');
      });
      // ----- the king: a stick figure with a cape, ermine collar, sceptre, moustache and crown -----
      const look = eio(seg(t, 5450, 5800)), happy = eio(seg(t, 5850, 6350)), wink = eo(seg(t, 6600, 6720)) - eo(seg(t, 7300, 7450));
      const bob = rev ? Math.sin(t * 0.012) * 2.5 * happy : 0, up = back(seg(t, 5900, 6400));
      c.save(); c.translate(0, bob);
      // cape
      const cg = c.createLinearGradient(-110, 0, 110, 0); cg.addColorStop(0, '#7c0a1e'); cg.addColorStop(0.5, '#c4163a'); cg.addColorStop(1, '#6a081a');
      c.fillStyle = cg; c.strokeStyle = '#4a0612'; c.lineWidth = 4; c.beginPath(); c.moveTo(-34, -30); c.quadraticCurveTo(-96, 40, -118, 196); c.quadraticCurveTo(0, 224, 118, 196); c.quadraticCurveTo(96, 40, 34, -30); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#fff8ea'; c.beginPath(); c.moveTo(-118, 196); c.quadraticCurveTo(0, 224, 118, 196); c.lineTo(122, 214); c.quadraticCurveTo(0, 244, -122, 214); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#1a0633'; for (let i = -4; i <= 4; i++) { c.beginPath(); c.ellipse(i * 24, 219 - Math.abs(i) * 1.6, 3, 5, 0, 0, TAU); c.fill(); }
      // body
      c.strokeStyle = '#fff'; c.lineWidth = 13; c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, -34); c.lineTo(0, 90); c.moveTo(0, 90); c.lineTo(-62, 124); c.lineTo(-62, 232); c.moveTo(0, 90); c.lineTo(62, 124); c.lineTo(62, 232); c.stroke();
      const hand = sx => [sx * lerp(172, 150, up), lerp(4, -150, up)];
      for (const sx of [-1, 1]) { const [hx, hy2] = hand(sx); c.beginPath(); c.moveTo(0, 6); c.lineTo(sx * lerp(96, 112, up), lerp(34, -60, up)); c.lineTo(hx, hy2); c.stroke(); }
      // sceptre in his right hand
      { const [hx, hy2] = hand(1); c.strokeStyle = '#5a3200'; c.lineWidth = 12; c.beginPath(); c.moveTo(hx, hy2 + 70); c.lineTo(hx, hy2 - 96); c.stroke(); c.strokeStyle = '#ffd23f'; c.lineWidth = 7; c.beginPath(); c.moveTo(hx, hy2 + 70); c.lineTo(hx, hy2 - 96); c.stroke();
        c.fillStyle = '#3bd0ff'; c.strokeStyle = '#5a3200'; c.lineWidth = 3; c.beginPath(); c.arc(hx, hy2 - 108, 15, 0, TAU); c.fill(); c.stroke(); c.fillStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.arc(hx - 5, hy2 - 113, 4, 0, TAU); c.fill(); }
      // ermine collar
      c.fillStyle = '#fff8ea'; c.strokeStyle = '#4a0612'; c.lineWidth = 3; c.beginPath(); c.ellipse(0, -28, 50, 17, 0, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = '#1a0633'; for (let i = -2; i <= 2; i++) { c.beginPath(); c.ellipse(i * 19, -24 + Math.abs(i) * -1.5, 2.6, 4.5, 0, 0, TAU); c.fill(); }
      // head
      const hy = -86;
      c.fillStyle = '#fff3da'; c.strokeStyle = '#2a1040'; c.lineWidth = 5; c.beginPath(); c.arc(0, hy, 52, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = `rgba(255,96,128,${0.5 * happy})`; c.beginPath(); c.ellipse(-33, hy + 13, 10, 7, 0, 0, TAU); c.ellipse(33, hy + 13, 10, 7, 0, 0, TAU); c.fill();
      // eyebrows: stern at first, lifting when he sees the name
      c.strokeStyle = '#4a3a55'; c.lineWidth = 4.5; c.lineCap = 'round';
      const by = hy - 27 - 6 * look - 2 * happy;
      for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * 32, by - 2 * (1 - happy)); c.quadraticCurveTo(sx * 20, by - 6 * happy, sx * 9, by + 6 * (1 - happy)); c.stroke(); }
      // eyes: he looks up at the crown; the right one winks
      for (const sx of [-1, 1]) {
        const ex = sx * 20, ey = hy - 8, shut = sx > 0 ? cl(wink) : 0;
        if (shut > 0.6) { c.strokeStyle = '#2a1040'; c.lineWidth = 4.5; c.beginPath(); c.moveTo(ex - 11, ey + 3); c.quadraticCurveTo(ex, ey - 9, ex + 11, ey + 3); c.stroke(); }
        else {
          c.fillStyle = '#fff'; c.strokeStyle = '#2a1040'; c.lineWidth = 3; c.beginPath(); c.ellipse(ex, ey, 11, 13 * (1 - shut * 0.9) * (1 - 0.18 * happy), 0, 0, TAU); c.fill(); c.stroke();
          c.fillStyle = '#2a1040'; c.beginPath(); c.arc(ex, ey - 6.5 * look, 5.2, 0, TAU); c.fill();
          c.fillStyle = '#fff'; c.beginPath(); c.arc(ex - 1.8, ey - 6.5 * look - 2, 1.8, 0, TAU); c.fill();
        }
      }
      if (wink > 0.2) sparkle(c, 38, hy - 20, 14 * Math.sin(cl(seg(t, 6620, 7000)) * Math.PI), t * 0.006, '#fff7b0');
      // mouth: a regal straight line that breaks into a grin
      const my = hy + 27, mw = lerp(11, 21, happy);
      if (happy > 0.45) { c.fillStyle = '#7a1f2a'; c.strokeStyle = '#2a1040'; c.lineWidth = 3; c.beginPath(); c.moveTo(-mw, my - 2); c.lineTo(mw, my - 2); c.quadraticCurveTo(mw * 0.8, my + 16 * happy, 0, my + 17 * happy); c.quadraticCurveTo(-mw * 0.8, my + 16 * happy, -mw, my - 2); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#fff'; c.fillRect(-mw * 0.7, my - 1, mw * 1.4, 4); }
      else { c.strokeStyle = '#2a1040'; c.lineWidth = 4; c.beginPath(); c.moveTo(-mw, my); c.quadraticCurveTo(0, my - 3 + 14 * happy, mw, my); c.stroke(); }
      // moustache and little beard
      for (const sx of [-1, 1]) { c.strokeStyle = '#2a1040'; c.lineWidth = 10; c.beginPath(); c.moveTo(sx * 2, hy + 15); c.quadraticCurveTo(sx * 18, hy + 25, sx * 32, hy + 13 - 6 * happy); c.stroke(); c.strokeStyle = '#f2ece0'; c.lineWidth = 6; c.beginPath(); c.moveTo(sx * 2, hy + 15); c.quadraticCurveTo(sx * 18, hy + 25, sx * 32, hy + 13 - 6 * happy); c.stroke(); }
      c.fillStyle = '#f2ece0'; c.strokeStyle = '#2a1040'; c.lineWidth = 3; c.beginPath(); c.moveTo(-9, hy + 46); c.quadraticCurveTo(0, hy + 66, 9, hy + 46); c.quadraticCurveTo(0, hy + 50, -9, hy + 46); c.fill(); c.stroke();
      c.strokeStyle = '#d9b98a'; c.lineWidth = 3; c.beginPath(); c.moveTo(-2, hy + 2); c.quadraticCurveTo(5, hy + 9, -1, hy + 11); c.stroke();
      // the crown: a wobble of anticipation, then it lifts, spins round, and lands showing the name
      const spin = seg(t, 4500, 5400), ang = Math.sin(seg(t, 4250, 4500) * TAU) * 0.3 + 3 * Math.PI * eo(spin);
      c.save(); c.translate(0, hy - 56 - Math.sin(spin * Math.PI) * 16 - (rev ? 2 : 0)); c.rotate(Math.sin(spin * Math.PI) * 0.06);
      drawCrown(c, d.name, ang, t, rp);
      c.restore();
      c.restore();
      if (rev) for (let i = 0; i < 10; i++) { const a2 = t * 0.0014 + i * TAU / 10; sparkle(c, Math.cos(a2) * 150, -146 + Math.sin(a2) * 40, 5 + 4 * Math.sin(t * 0.006 + i), t * 0.003, i % 2 ? '#fff' : '#ffe27a'); }
      c.restore();
      if (rev) {   // gold confetti and the flash as the crown lands
        for (let i = 0; i < 60; i++) { const age = (t - 5400 - hash(i) * 900); if (age < 0) continue; const a2 = age % 2600; const x = (hash(i, 1) - 0.5) * 2 * s.vw + Math.sin(a2 * 0.004 + i) * 40, y = -s.vh - 30 + a2 * (0.35 + hash(i, 2) * 0.3); c.save(); c.translate(x, y); c.rotate(a2 * 0.006 + i); c.fillStyle = ['#ffd23f', '#fff2a0', '#ff5d8f', '#c77dff'][i % 4]; c.fillRect(-10, -5 * Math.cos(a2 * 0.01 + i), 20, 10 * Math.cos(a2 * 0.01 + i)); c.restore(); }
        const fl = 1 - seg(t, 5400, 5750); if (fl > 0) { c.fillStyle = `rgba(255,250,220,${fl * 0.85})`; c.fillRect(-s.vw, -s.vh, s.vw * 2, s.vh * 2); }
      }
      c.restore();
    },
  };

  // =====================================================================
  // 6. THE COMEBACK KID — fire climbs the ranking ladder
  // =====================================================================
  const GAP = 210;
  // The story: a tiny ember at the very bottom wakes up, climbs the ranking ladder head-butting every
  // rival off, slips when a burnt rung snaps, nearly goes out... then rockets past everyone.
  function ladder(d) {
    if (d._l) return d._l;
    const rivals = (d.ladder || []).filter(p => !p.me).map(p => p.name).reverse();   // lowest-ranked rival on the bottom rung
    const R = Math.max(4, rivals.length), names = Array(R - rivals.length).fill(null).concat(rivals);
    const ry = i => -(i + 1) * GAP, top = ry(R - 1) - 150;
    // hops up to the second-highest rung, each one quicker than the last
    const hops = R - 1, ratio = 0.9, total = 3000, first = total * (1 - ratio) / (1 - Math.pow(ratio, hops));
    const start = [], dur = [], land = []; let at = 1300;
    for (let k = 0; k < hops; k++) { const dd = first * Math.pow(ratio, k); start.push(at); dur.push(dd); at += dd; land.push(at); }
    const knock = names.map((n, i) => i < hops ? land[i] - dur[i] * 0.18 : 5560);
    return (d._l = { names, R, ry, top, start, dur, land, knock, hops });
  }
  function emberAt(L, t) {
    const R = L.R, y2 = L.ry(R - 2), y4 = L.ry(R - 4);
    if (t < 1300) return { x: 0, y: 0, sc: lerp(0.22, 0.7, eo(seg(t, 900, 1300))), st: 1 + 0.3 * Math.sin(seg(t, 900, 1300) * Math.PI), mood: t < 520 ? 'sleep' : 'up' };
    if (t < 4300) {
      let k = 0; while (k < L.hops - 1 && t >= L.land[k]) k++;
      const p = cl((t - L.start[k]) / L.dur[k]), y0 = k === 0 ? 0 : L.ry(k - 1), y1 = L.ry(k);
      const st = p < 0.15 ? lerp(0.72, 1.3, p / 0.15) : p > 0.86 ? lerp(1.25, 0.76, (p - 0.86) / 0.14) : 1.25;
      return { x: (k % 2 ? 1 : -1) * 26 * Math.sin(p * Math.PI), y: lerp(y0, y1, eio(p)) - Math.sin(p * Math.PI) * 64, sc: 0.7 + 0.45 * (k + p) / L.hops, st, mood: 'go' };
    }
    if (t < 4450) return { x: 0, y: y2, sc: 1.15, st: 1 - 0.1 * Math.sin(seg(t, 4300, 4450) * Math.PI * 3), mood: 'uhoh' };
    if (t < 4850) { const p = seg(t, 4450, 4850); return { x: Math.sin(p * 9) * 12, y: lerp(y2, y4, p * p), sc: lerp(1.15, 0.42, p), st: 1.3, mood: 'uhoh' }; }
    if (t < 5050) return { x: 0, y: y4, sc: 0.42, st: 0.8, mood: 'sad', dim: 1 };
    if (t < 5200) { const p = seg(t, 5050, 5200); return { x: (hash(Math.floor(t / 25)) - 0.5) * 10 * p, y: y4, sc: lerp(0.42, 0.95, p), st: lerp(0.8, 0.5, p), mood: 'go' }; }
    if (t < 5600) { const p = seg(t, 5200, 5600); return { x: 0, y: lerp(y4, L.top, p * p), sc: 1.25, st: 1.9, mood: 'go', rocket: 1 }; }
    return null;
  }
  // The ember itself: a flame with a face. Origin at its base.
  function drawEmber(c, e, t) {
    c.save(); c.translate(e.x, e.y); c.scale(e.sc, e.sc * e.st);
    const sway = Math.sin(t * 0.02) * 12, dim = e.dim ? 0.55 : 1;
    c.save(); c.globalCompositeOperation = 'lighter'; const hg = c.createRadialGradient(0, -70, 10, 0, -70, 210); hg.addColorStop(0, `rgba(255,150,40,${0.45 * dim})`); hg.addColorStop(1, 'rgba(255,150,40,0)'); c.fillStyle = hg; c.fillRect(-220, -290, 440, 440); c.restore();
    const body = (w, h, tip) => { c.beginPath(); c.moveTo(tip, -h); c.bezierCurveTo(w * 0.5, -h * 0.62, w, -h * 0.3, w * 0.86, -h * 0.1); c.bezierCurveTo(w * 0.72, h * 0.08, -w * 0.72, h * 0.08, -w * 0.86, -h * 0.1); c.bezierCurveTo(-w, -h * 0.3, -w * 0.5, -h * 0.62, tip, -h); c.closePath(); };
    const og = c.createLinearGradient(0, -180, 0, 10); og.addColorStop(0, e.dim ? '#b3401a' : '#ff3b1a'); og.addColorStop(0.55, e.dim ? '#c9661a' : '#ff8a1a'); og.addColorStop(1, e.dim ? '#d9a13a' : '#ffd23f');
    body(78, 180, sway); c.fillStyle = og; c.fill();
    body(46, 108, sway * 0.5); c.fillStyle = e.dim ? '#ffd98a' : '#fff3a0'; c.fill();
    // face
    const ey = -52; c.lineCap = 'round';
    const eye = (sx, open, px, py) => { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(sx * 22, ey, 13, 16 * open, 0, 0, TAU); c.fill(); c.fillStyle = '#3a1200'; c.beginPath(); c.arc(sx * 22 + px, ey + py, 6, 0, TAU); c.fill(); };
    c.strokeStyle = '#3a1200'; c.lineWidth = 5;
    if (e.mood === 'sleep') { for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * 22 - 11, ey); c.lineTo(sx * 22 + 11, ey); c.stroke(); } }
    else if (e.mood === 'happy') { for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * 22 - 12, ey + 4); c.quadraticCurveTo(sx * 22, ey - 12, sx * 22 + 12, ey + 4); c.stroke(); } c.beginPath(); c.moveTo(-16, ey + 22); c.quadraticCurveTo(0, ey + 40, 16, ey + 22); c.stroke(); }
    else if (e.mood === 'uhoh') { eye(-1, 1.15, 0, 5); eye(1, 1.15, 0, 5); c.fillStyle = '#3a1200'; c.beginPath(); c.ellipse(0, ey + 30, 8, 11, 0, 0, TAU); c.fill(); }
    else if (e.mood === 'sad') { eye(-1, 0.55, 0, 4); eye(1, 0.55, 0, 4); c.beginPath(); c.moveTo(-12, ey + 32); c.quadraticCurveTo(0, ey + 22, 12, ey + 32); c.stroke(); }
    else if (e.mood === 'up') { eye(-1, 1, 0, -7); eye(1, 1, 0, -7); }
    else { eye(-1, 0.9, 0, -2); eye(1, 0.9, 0, -2); for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * 36, ey - 22); c.lineTo(sx * 9, ey - 12); c.stroke(); } c.beginPath(); c.moveTo(-11, ey + 28); c.lineTo(11, ey + 28); c.stroke(); }
    c.restore();
  }
  const comeback = {
    title: 'THE COMEBACK KID', sub: 'Rose from the ashes', icon: '🔥', reveal: 6300,
    cues(d) {
      const L = ladder(d), q = [], PENT = [0, 3, 5, 7, 10];
      // night, one ember
      q.push([0, s => s.whoosh(0, 1.6, 0.04, 300, 700, { peak: 0.5, rev: 0.5 })]);
      for (let t = 150; t < 900; t += 190) q.push([t, s => s.noise(0, 0.03, 0.05, 3000 + hash(t) * 3000, 'bandpass', { q: 3 })]);
      q.push([520, s => { s.pluck(N(76), 0, 0.2, 0.08); s.pluck(N(83), 0.11, 0.25, 0.08); }]);   // it opens its eyes
      q.push([900, s => { s.whoosh(0, 0.45, 0.16, 500, 3500, { peak: 0.85 }); s.tone(N(52), 0, 0.4, 'sawtooth', 0.07, N(64), { cut: 1800 }); }]);
      // the climb: each hop is the next note of a rising scale, each landing a drum and a rival sent flying
      q.push([1300, s => s.pad([N(40), N(47), N(52), N(55)], 0, 3.0, 0.05, { cut: 500, cut2: 2600, a: 2.6, rel: 0.05, rev: 0.4 })]);
      for (let k = 0; k < L.hops; k++) {
        const note = 64 + PENT[k % 5] + 12 * Math.floor(k / 5);
        q.push([L.start[k], s => { s.tone(N(note - 12), 0, 0.16, 'sine', 0.12, N(note)); s.pluck(N(note), 0.04, 0.3, 0.1, { rev: 0.3 }); }]);
        q.push([L.land[k] - 20, s => { s.kick(0, 0.36, { f: 130, f2: 46, dur: 0.16 }); s.noise(0, 0.05, 0.12, 2500, 'bandpass', { rev: 0.1 }); }]);
        if (L.names[k]) { const pan = (k % 2 ? 1 : -1) * 0.7; q.push([L.knock[k], s => { s.snare(0, 0.34, { pan: pan * 0.5 }); s.tone(N(52), 0, 0.1, 'square', 0.08, N(45), { pan: pan * 0.5 }); s.slide(1350, 210, 0.05, 0.8, 0.11, { pan, vib: [11, 25], rev: 0.35 }); }]); }
      }
      for (let t = 1300; t < 4300; t += 70) q.push([t, s => s.noise(0, 0.015 + hash(t) * 0.04, (0.05 + hash(t, 1) * 0.12) * (0.4 + 0.6 * (t - 1300) / 3000), 2000 + hash(t, 2) * 5000, 'bandpass', { q: 2, pan: hash(t, 3) * 2 - 1, rev: 0.1 })]);
      // the rung snaps: everything stops, and down it goes
      q.push([4300, s => { s.noise(0, 0.09, 0.4, 1800, 'bandpass', { q: 1 }); s.tone(220, 0, 0.12, 'square', 0.12, 90); s.noise(0.02, 0.2, 0.2, 400, 'lowpass'); }]);
      q.push([4450, s => s.slide(N(84), N(52), 0, 0.42, 0.11, { vib: [12, 30], rev: 0.4 })]);
      q.push([4850, s => { s.kick(0, 0.3, { f: 90, f2: 40, dur: 0.14 }); s.noise(0.02, 0.3, 0.07, 5000, 'highpass', { f2: 1500 }); s.pluck(N(52), 0.05, 0.3, 0.05); }]);
      // not done yet: it winds up and launches
      q.push([5050, s => { s.riser(0, 0.5, 0.2); s.tone(N(40), 0, 0.5, 'sawtooth', 0.08, N(64), { cut: 2500, sus: true, a: 0.3, rel: 0.02 }); }]);
      q.push([5200, s => { s.whoosh(0, 0.42, 0.26, 700, 7000, { peak: 0.9, q: 1 }); s.brass(N(52), 0, 0.4, 0.12, { fall: N(76), bright: 8 }); s.kick(0, 0.45, { f: 150, f2: 40, dur: 0.25 }); }]);
      if (L.names[L.R - 1]) q.push([5560, s => { s.snare(0, 0.36); s.slide(1500, 220, 0.03, 0.8, 0.1, { pan: 0.7, vib: [11, 25], rev: 0.35 }); }]);
      // the explosion and the fanfare
      q.push([5600, s => { s.boom(0, 0.75, 2.5); s.noise(0, 0.25, 0.4, 4000, 'highpass', { rev: 0.5 }); s.noise(0, 2.7, 0.3, 480, 'lowpass', { rev: 0.7 }); s.cym(0, 3.0, 0.18); }]);
      q.push([5950, s => {
        [[52, 0, 0.11], [56, 0.13, 0.11], [59, 0.26, 0.11]].forEach(([m, at, len]) => { s.brass(N(m), at, len, 0.12, { pan: -0.2 }); s.brass(N(m + 12), at, len, 0.07, { pan: 0.2 }); });
        [[40, 0.1], [52, 0.1], [56, 0.09], [59, 0.1], [64, 0.15], [68, 0.09]].forEach(([m, v], i) => s.brass(N(m), 0.4, 1.25, v, { pan: (i - 2.5) * 0.22, bright: 7.5 }));
        s.kick(0.4, 0.55, { f: 115, f2: 38, dur: 0.6 }); s.cym(0.4, 1.8, 0.13);
      }]);
      q.push([6680, s => { s.tone(N(64), 0, 0.14, 'sine', 0.1, N(76)); s.pluck(N(88), 0.08, 0.4, 0.09, { rev: 0.4 }); }]);   // it hops onto its name
      q.push([7350, s => { [[40, 0.1], [52, 0.09], [59, 0.08], [64, 0.1], [68, 0.07], [71, 0.07]].forEach(([m, v], i) => s.brass(N(m), 0, 0.9, v, { pan: (i - 2.5) * 0.22 })); s.boom(0, 0.4, 1.1); s.cym(0, 2.0, 0.14); }]);
      for (let t = 6200; t < 8300; t += 85) q.push([t, s => s.noise(0, 0.03, 0.03 + hash(t) * 0.05, 2500 + hash(t, 1) * 3500, 'bandpass', { q: 2, pan: hash(t, 2) * 2 - 1, rev: 0.15 })]);
      return q;
    },
    draw(s, t, d) {
      const L = ladder(d), R = L.R, e = emberAt(L, t), boom = t >= 5600, bp = seg(t, 5600, 6300), heat = seg(t, 1300, 5600) * (t > 4450 && t < 5200 ? 0.45 : 1);
      vgrad(s.c, s, ['#05061a', '#0d1036', '#1a0d2e']);
      const c0 = s.c; c0.save(); c0.globalAlpha = (boom ? 1 : heat) * 0.75; vgrad(c0, s, ['rgba(120,20,0,0)', '#5a1200', '#c23b00']); c0.restore();
      const c = begin(s);
      const fitZ = Math.min(1.35, s.vw / 340); c.scale(fitZ, fitZ);
      const vh = s.vh / fitZ, vw = s.vw / fitZ, revealY = L.top - 70;
      const follow = e ? e.y - 90 : L.top - 90;
      const camY = boom ? lerp(L.top - 90, revealY + 30, eio(bp)) : lerp(-150, follow, eio(seg(t, 1050, 1700)));
      const shake = boom ? (hash(Math.floor(t / 30)) - 0.5) * 40 * (1 - seg(t, 5600, 6400)) : (t > 4300 && t < 4450 ? (hash(Math.floor(t / 25)) - 0.5) * 12 : 0);
      for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(255,255,255,${0.2 + 0.5 * hash(i, 3)})`; c.beginPath(); c.arc((hash(i) - 0.5) * 2 * vw, (hash(i, 1) - 0.5) * 2 * vh, 2.5, 0, TAU); c.fill(); }
      c.save(); c.translate(shake, -camY + shake * 0.5);
      // ground + the ash pile it starts in
      c.fillStyle = '#0b0a18'; c.fillRect(-vw - 60, 0, vw * 2 + 120, 900);
      c.fillStyle = '#2a2530'; c.beginPath(); c.ellipse(0, 4, 120, 22, 0, 0, TAU); c.fill(); c.fillStyle = '#3a343f'; c.beginPath(); c.ellipse(-14, 0, 70, 12, 0, 0, TAU); c.fill();
      // how high the fire has got so far: everything below is charred
      const peakY = t < 1300 ? 1 : t < 4300 ? e.y : t < 5200 ? L.ry(R - 2) : e ? Math.min(L.ry(R - 2), e.y) : L.top;
      for (const sx of [-1, 1]) { c.lineWidth = 26; c.lineCap = 'butt'; c.strokeStyle = '#8a5a2b'; c.beginPath(); c.moveTo(sx * 190, L.top + 30); c.lineTo(sx * 190, Math.min(0, peakY)); c.stroke(); if (peakY < 0) { c.strokeStyle = '#1c120c'; c.beginPath(); c.moveTo(sx * 190, peakY); c.lineTo(sx * 190, 0); c.stroke(); } }
      for (let i = 0; i < R; i++) {
        const y = L.ry(i), burnt = y >= peakY - 4;
        if (i === R - 2 && t >= 4400) {   // the rung that gives way
          const dt = t - 4400; if (dt > 1400) continue;
          for (const sx of [-1, 1]) { c.save(); c.translate(sx * 95 + sx * dt * 0.05, y + dt * dt * 0.0009); c.rotate(sx * dt * 0.004); c.strokeStyle = '#1c120c'; c.lineWidth = 20; c.beginPath(); c.moveTo(-90, 0); c.lineTo(90, 0); c.stroke(); c.restore(); }
          continue;
        }
        c.strokeStyle = burnt ? '#1c120c' : '#a06a34'; c.lineWidth = 20; c.beginPath(); c.moveTo(-190, y); c.lineTo(190, y); c.stroke();
        if (burnt && !boom) for (let j = 0; j < 3; j++) { const ph = (t * 0.003 + hash(i * 7 + j)) % 1; c.fillStyle = `rgba(255,${130 + j * 40},30,${0.6 * (1 - ph)})`; c.beginPath(); c.arc(-110 + j * 110 + Math.sin(t * 0.01 + j) * 8, y - 14 - ph * 46, 16 * (1 - ph), 0, TAU); c.fill(); }
      }
      rr(c, -250, L.top + 120, 500, 30, 12); c.fillStyle = '#c9972a'; c.fill();
      // rivals' name plates: knocked off as the ember arrives
      const plate = (name, x, y, rot, burnt) => { c.save(); c.translate(x, y); c.rotate(rot); rr(c, -165, -44, 330, 88, 18); c.fillStyle = burnt ? '#2a1a12' : '#fff6dc'; c.fill(); c.lineWidth = 7; c.strokeStyle = burnt ? '#ff6a00' : '#6a431d'; c.stroke(); label(c, name, 0, 3, { size: 50, font: FU, fill: burnt ? '#ff9a3c' : '#3a2410', w: 290 }); c.restore(); };
      L.names.forEach((name, i) => {
        if (!name) return; const y = L.ry(i), dir = i % 2 ? 1 : -1;
        if (t < L.knock[i]) return plate(name, 0, y - 46, 0, false);
        const dt = t - L.knock[i]; if (dt > 2600) return;
        plate(name, dir * dt * (0.42 + hash(i) * 0.25), y - 46 - dt * 0.34 + dt * dt * 0.0011, dir * dt * 0.007, true);
      });
      // its trail, then the ember itself
      if (e && t >= 1250) {
        c.save(); c.globalCompositeOperation = 'lighter'; const n = e.rocket ? 90 : 40, len = e.rocket ? 900 : 260;
        for (let j = 0; j < n; j++) { const ph = (t * (0.0016 + hash(j, 4) * 0.0014) + hash(j)) % 1, yy = e.y + hash(j, 1) * len * ph + 10, x = e.x + (hash(j, 2) - 0.5) * 120 * e.sc * (1 - ph * 0.5);
          const r = (1 - ph) * (18 + hash(j, 3) * 26) * e.sc * (e.dim ? 0.4 : 1); c.fillStyle = ph < 0.3 ? `rgba(255,230,140,${0.45 * (1 - ph)})` : ph < 0.65 ? `rgba(255,140,20,${0.4 * (1 - ph)})` : `rgba(210,40,0,${0.3 * (1 - ph)})`; c.beginPath(); c.arc(x, yy, r, 0, TAU); c.fill(); }
        c.restore();
      }
      if (e) drawEmber(c, e, t);
      if (t > 520 && t < 1250) { const zz = seg(t, 520, 1250); label(c, '!', 46, -150 - zz * 20, { size: 60 * Math.sin(Math.min(1, zz * 3) * Math.PI / 2), font: FD, fill: '#ffd23f', stroke: '#3a1200', lw: 6, weight: '400' }); }
      // explosion + the name
      if (boom) {
        c.save(); c.translate(0, revealY);
        for (let k = 0; k < 3; k++) { const rp = seg(t, 5600 + k * 140, 6500 + k * 140); if (rp > 0 && rp < 1) { c.strokeStyle = `rgba(255,${200 - k * 50},80,${1 - rp})`; c.lineWidth = 30 * (1 - rp); c.beginPath(); c.arc(0, 0, rp * 900, 0, TAU); c.stroke(); } }
        const sk = seg(t, 5600, 6600); if (sk < 1) for (let i = 0; i < 46; i++) { const a = hash(i, 11) * TAU, r0 = sk * (500 + hash(i, 12) * 700); c.strokeStyle = `rgba(255,220,120,${1 - sk})`; c.lineWidth = 6; c.beginPath(); c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); c.lineTo(Math.cos(a) * (r0 + 70), Math.sin(a) * (r0 + 70)); c.stroke(); }
        rays(c, 0, 0, 1400, 14, t * 0.0005, '#ffb347', 0.16 * bp);
        c.save(); c.globalCompositeOperation = 'lighter';
        for (let j = 0; j < 50; j++) { const ph = (t * (0.0011 + hash(j, 14) * 0.001) + hash(j, 13)) % 1; c.fillStyle = ph < 0.4 ? `rgba(255,200,60,${0.4 * (1 - ph)})` : `rgba(230,60,0,${0.32 * (1 - ph)})`; c.beginPath(); c.arc((hash(j, 15) - 0.5) * 820, 90 - ph * 300, (1 - ph) * (40 + hash(j, 16) * 40) * bp, 0, TAU); c.fill(); }
        c.restore();
        const sc = lerp(0.1, 1, elastic(seg(t, 5750, 6500))), size = 170, maxW = Math.min(900, vw * 2 - 60);
        c.save(); c.scale(sc, sc);
        const g = c.createLinearGradient(0, -80, 0, 90); g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#fff27a'); g.addColorStop(0.65, '#ff9a1a'); g.addColorStop(1, '#e02a00');
        c.shadowColor = '#ff6a00'; c.shadowBlur = 50;
        label(c, d.name, 0, 0, { size, font: FD, fill: '#5a0d00', stroke: '#5a0d00', lw: 30, w: maxW, weight: '400' });
        c.shadowBlur = 0;
        label(c, d.name, 0, 0, { size, font: FD, fill: g, stroke: '#7a1500', lw: 8, w: maxW, weight: '400' });
        sweep(c, d.name, 0, 0, size, FD, maxW, ((t - 6400) % 1900) / 1000, '400');
        c.restore();
        // the ember, pleased with itself, hops onto its own name
        const hop = seg(t, 6400, 6750);
        if (hop > 0) drawEmber(c, { x: Math.sin(t * 0.004) * 30, y: -92 - (1 - back(hop)) * 420 - Math.abs(Math.sin(t * 0.008)) * 14 * (hop >= 1 ? 1 : 0), sc: 0.55, st: 1 + 0.08 * Math.sin(t * 0.016), mood: 'happy' }, t);
        c.restore();
      }
      c.restore();
      const fl = boom ? 1 - seg(t, 5600, 6050) : 0; if (fl > 0) { c.fillStyle = `rgba(255,245,220,${fl})`; c.fillRect(-vw, -vh, vw * 2, vh * 2); }
      c.restore();
    },
  };

  const SCENES = { gambler, nerd, luckiest, unluckiest, champion, comeback };

  // ---------- stage + sound + player ----------
  function stage(cv) {
    // cv._fixed lets an off-screen canvas be drawn at a set size (used for the credits thumbnails)
    const dpr = cv._fixed ? (cv._fixed.dpr || 1) : Math.min(window.devicePixelRatio || 1, 2), r = cv._fixed || cv.getBoundingClientRect();
    const W = Math.max(1, r.width), H = Math.max(1, r.height);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Design space is ~1000 units on the short side; on wide screens leave room for the title and controls.
    // The origin sits a little above centre, and vh is the taller half, so fills always cover the screen.
    const u = Math.min(W / 1000, H / 1240);
    return { c, W, H, u, vw: W / u / 2, vh: H / u * 0.53 };
  }
  // ---------- sound design ----------
  // A small synth: every sound is built from oscillators and filtered noise, sent through a
  // shared compressor and a generated-impulse reverb. No audio files.
  const N = m => 440 * Math.pow(2, (m - 69) / 12);   // MIDI note -> Hz
  const ENG = new WeakMap();
  function engineFor(ac) {
    let e = ENG.get(ac); if (e) return e;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 3.5; comp.attack.value = 0.006; comp.release.value = 0.25;
    const master = ac.createGain(); master.gain.value = 2.1;
    const lim = ac.createDynamicsCompressor(); lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.09;
    const trim = ac.createGain(); trim.gain.value = 0.86;
    comp.connect(master); master.connect(lim); lim.connect(trim); trim.connect(ac.destination);
    const len = Math.floor(ac.sampleRate * 2.8), imp = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const dd = imp.getChannelData(ch); for (let i = 0; i < len; i++) { const x = i / len; dd[i] = (Math.random() * 2 - 1) * Math.pow(1 - x, 2.6) * (i < 400 ? i / 400 : 1); } }
    const conv = ac.createConvolver(); conv.buffer = imp;
    const wet = ac.createGain(); wet.gain.value = 0.55; conv.connect(wet); wet.connect(comp);
    const nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    e = { comp, conv, nb, master }; ENG.set(ac, e); return e;
  }
  function sound(ac, fixed) {
    const no = () => {};
    if (!ac) return { tone: no, noise: no, bell: no, pluck: no, brass: no, pad: no, kick: no, boom: no, cym: no, snare: no, whoosh: no, riser: no, slide: no, stop: no, at: no };
    const E = engineFor(ac);
    const out = ac.createGain(); out.connect(E.comp);
    const send = ac.createGain(); send.connect(E.conv);
    let origin = fixed == null ? null : fixed;
    const T = at => (origin == null ? ac.currentTime : origin) + Math.max(0, at);
    const guard = fn => function () { try { return fn.apply(null, arguments); } catch (e) {} };
    function route(node, o) {
      let n = node; const pan = o && o.pan || 0, rev = o && o.rev != null ? o.rev : 0.15;
      if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = cl(pan, -1, 1); n.connect(p); n = p; }
      n.connect(out);
      if (rev > 0) { const g = ac.createGain(); g.gain.value = rev; n.connect(g); g.connect(send); }
    }
    const hit = (g, t0, a, peak, dur) => { g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(dur, a + 0.02)); };
    const hold = (g, t0, a, peak, dur, rel) => { g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + a); g.gain.setValueAtTime(peak, t0 + Math.max(a, dur - rel)); g.gain.linearRampToValueAtTime(0.0001, t0 + dur); };
    const osc = (type, f, t0, dur, detune) => { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t0); if (detune) o.detune.value = detune; o.start(t0); o.stop(t0 + dur + 0.08); return o; };
    const vibrato = (o, t0, dur, rate, cents, delay) => { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = rate; lg.gain.setValueAtTime(0, t0); lg.gain.linearRampToValueAtTime(cents, t0 + (delay || 0.01)); l.connect(lg); lg.connect(o.detune); l.start(t0); l.stop(t0 + dur + 0.08); };
    const S = {
      // plain oscillator with a percussive envelope; f2 glides the pitch; o: {pan, rev, a, cut, vib:[rate, cents]}
      tone(f, at, dur, type, vol, f2, o) {
        o = o || {}; const t0 = T(at), os = osc(type || 'sine', f, t0, dur), g = ac.createGain();
        if (f2) os.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t0 + dur);
        if (o.vib) vibrato(os, t0, dur, o.vib[0], o.vib[1]);
        if (o.sus) hold(g, t0, o.a || 0.02, vol == null ? 0.1 : vol, dur, o.rel || 0.1); else hit(g, t0, o.a || 0.008, vol == null ? 0.1 : vol, dur);
        let n = os; if (o.cut) { const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.cut; n.connect(lp); n = lp; }
        n.connect(g); route(g, o);
      },
      // filtered noise; o: {q, f2 (filter sweep), pan, rev, a, sus}
      noise(at, dur, vol, freq, type, o) {
        o = o || {}; const t0 = T(at), n = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
        n.buffer = E.nb; n.loop = true; f.type = type || 'bandpass'; f.frequency.setValueAtTime(freq || 1000, t0); if (o.q) f.Q.value = o.q;
        if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t0 + dur);
        if (o.sus) hold(g, t0, o.a || 0.05, vol == null ? 0.1 : vol, dur, o.rel || 0.2); else hit(g, t0, o.a || 0.004, vol == null ? 0.1 : vol, dur);
        n.connect(f); f.connect(g); route(g, o); n.start(t0, Math.random() * 1.5); n.stop(t0 + dur + 0.08);
      },
      // struck metal: inharmonic partials that die at different rates
      bell(f, at, dur, vol, o) {
        o = o || {}; const t0 = T(at), bus = ac.createGain(); bus.gain.value = 1;
        [[1, 1], [2.0, 0.45], [2.76, 0.32], [5.4, 0.18], [8.93, 0.08]].forEach(([r, a], i) => {
          if (f * r > 16000) return; const os = osc('sine', f * r, t0, dur), g = ac.createGain(); hit(g, t0, 0.003, vol * a, dur / (1 + i * 0.55)); os.connect(g); g.connect(bus); });
        route(bus, Object.assign({ rev: 0.35 }, o));
      },
      // plucked string / mallet
      pluck(f, at, dur, vol, o) {
        o = o || {}; const t0 = T(at), bus = ac.createGain(), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(Math.min(12000, f * 8), t0); lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.5), t0 + dur);
        [['triangle', 1, 1, 0], ['sine', 2, 0.35, 3], ['sine', 3, 0.12, -4]].forEach(([ty, r, a, det]) => { const os = osc(ty, f * r, t0, dur, det), g = ac.createGain(); hit(g, t0, 0.004, vol * a, dur / r); os.connect(g); g.connect(lp); });
        lp.connect(bus); route(bus, Object.assign({ rev: 0.3 }, o));
      },
      // brass: detuned saws through a filter that opens with the note; o.fall bends the pitch down at the end
      brass(f, at, dur, vol, o) {
        o = o || {}; const t0 = T(at), lp = ac.createBiquadFilter(), g = ac.createGain(); lp.type = 'lowpass'; lp.Q.value = 1.2;
        lp.frequency.setValueAtTime(f * 1.2, t0); lp.frequency.linearRampToValueAtTime(Math.min(9000, f * (o.bright || 6)), t0 + 0.07); lp.frequency.linearRampToValueAtTime(Math.min(7000, f * 3), t0 + dur);
        [-7, 0, 7].forEach((det, i) => { const os = osc(i === 1 ? 'square' : 'sawtooth', f, t0, dur, det); if (o.fall) { os.frequency.setValueAtTime(f, t0 + dur * 0.35); os.frequency.exponentialRampToValueAtTime(o.fall, t0 + dur); }
          vibrato(os, t0, dur, o.vibRate || 5.5, o.vibDepth || 9, 0.25); const og = ac.createGain(); og.gain.value = i === 1 ? 0.25 : 0.5; os.connect(og); og.connect(lp); });
        hold(g, t0, 0.035, vol, dur, Math.min(0.12, dur * 0.3)); lp.connect(g); route(g, Object.assign({ rev: 0.3 }, o));
      },
      // soft sustained chord: detuned saws, low-passed, slow attack
      pad(freqs, at, dur, vol, o) {
        o = o || {}; const t0 = T(at), lp = ac.createBiquadFilter(), g = ac.createGain(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(o.cut || 1200, t0); if (o.cut2) lp.frequency.linearRampToValueAtTime(o.cut2, t0 + dur);
        freqs.forEach(f => [-9, 8].forEach(det => { const os = osc('sawtooth', f, t0, dur, det), og = ac.createGain(); og.gain.value = 1 / Math.sqrt(freqs.length * 2); os.connect(og); og.connect(lp); }));
        hold(g, t0, o.a || dur * 0.35, vol, dur, o.rel || Math.min(1.2, dur * 0.3)); lp.connect(g); route(g, Object.assign({ rev: 0.4 }, o));
      },
      kick(at, vol, o) { o = o || {}; const d = o.dur || 0.24; S.tone(o.f || 150, at, d, 'sine', vol, o.f2 || 42, { pan: o.pan, rev: o.rev == null ? 0.08 : o.rev, a: 0.002 }); S.noise(at, 0.02, vol * 0.5, 2500, 'bandpass', { pan: o.pan, rev: 0 }); },
      boom(at, vol, dur) { S.tone(110, at, dur, 'sine', vol, 26, { rev: 0.3, a: 0.003 }); S.tone(55, at, dur * 0.8, 'triangle', vol * 0.5, 30, { rev: 0.2 }); S.noise(at, dur * 0.7, vol * 0.5, 320, 'lowpass', { rev: 0.5 }); S.noise(at, 0.09, vol * 0.5, 3500, 'highpass', { rev: 0.3 }); },
      cym(at, dur, vol, o) { S.noise(at, dur, vol, 7000, 'highpass', Object.assign({ rev: 0.4 }, o)); S.noise(at, dur * 0.5, vol * 0.6, 10500, 'bandpass', Object.assign({ q: 1.5, rev: 0.3 }, o)); },
      snare(at, vol, o) { S.noise(at, 0.11, vol, 1900, 'bandpass', Object.assign({ q: 0.8, rev: 0.2 }, o)); S.tone(190, at, 0.07, 'triangle', vol * 0.6, 150, o); },
      // air moving: noise whose filter sweeps, swelling to a peak (o.peak = where in the sound, 0..1)
      whoosh(at, dur, vol, f1, f2, o) {
        o = o || {}; const t0 = T(at), n = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), pk = o.peak == null ? 0.7 : o.peak;
        n.buffer = E.nb; n.loop = true; f.type = 'bandpass'; f.Q.value = o.q || 1.4; f.frequency.setValueAtTime(f1, t0); f.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
        g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + dur * pk); g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
        n.connect(f); f.connect(g); route(g, Object.assign({ rev: 0.3 }, o)); n.start(t0, Math.random() * 1.5); n.stop(t0 + dur + 0.08);
      },
      riser(at, dur, vol) { S.whoosh(at, dur, vol, 500, 9000, { peak: 0.95, rev: 0.25 }); const t0 = T(at), os = osc('sawtooth', 110, t0, dur), g = ac.createGain(), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t0); lp.frequency.exponentialRampToValueAtTime(5000, t0 + dur); os.frequency.exponentialRampToValueAtTime(880, t0 + dur); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol * 0.45, t0 + dur * 0.95); g.gain.linearRampToValueAtTime(0.0001, t0 + dur); os.connect(lp); lp.connect(g); route(g, { rev: 0.2 }); },
      // slide whistle / voice-like glide
      slide(f1, f2, at, dur, vol, o) { o = o || {}; S.tone(f1, at, dur, 'sine', vol, f2, Object.assign({ sus: true, a: 0.03, rel: dur * 0.3, vib: o.vib || [7, 18] }, o)); S.tone(f1 * 2, at, dur, 'sine', vol * 0.18, f2 * 2, Object.assign({ sus: true, a: 0.03, rel: dur * 0.3 }, o)); },
      at(sec) { origin = sec; },
      stop() { try { const t = ac.currentTime; out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(0, t + 0.04); send.gain.setValueAtTime(0, t); setTimeout(() => { try { out.disconnect(); send.disconnect(); } catch (e) {} }, 120); } catch (e) {} },
    };
    for (const k of Object.keys(S)) if (k !== 'stop' && k !== 'at') S[k] = guard(S[k]);
    return S;
  }

  // ---------- end-credits music ----------
  // Three moods in 24 seconds: sneaky and teasing, then mock-menacing, then a silly happy ending
  // that signs off with "shave and a haircut, two bits". Loops while the credits are open.
  const CREDITS = (() => {
    const B = 0.46, at = (bar, beat) => (bar * 4 + beat) * B * 1000, BARS = 14;
    return {
      len: BARS * 4 * B * 1000,
      cues() {
        const q = [], add = (bar, beat, fn) => q.push([at(bar, beat), fn]);
        // ===== A. sneaky (D minor): tiptoe bass, finger snaps, a slithery tune, then the playground taunt =====
        for (let bar = 0; bar < 4; bar++) {
          const bass = bar === 3 ? [38, 45, 37, 36] : [38, 45, 38, 45];
          bass.forEach((m, i) => add(bar, i, s => { s.pluck(N(m), 0, 0.2, 0.16, { rev: 0.2 }); s.tone(N(m), 0, 0.12, 'sine', 0.1, null, { rev: 0.1 }); }));
          for (const beat of [1, 3]) add(bar, beat, s => s.noise(0, 0.035, 0.16, 3000, 'bandpass', { q: 3, pan: 0.3, rev: 0.35 }));
        }
        const sneak = [[74, null, 77, null, 76, null, 73, null], [74, null, 77, null, 81, 80, 79, 78], [77, null, 81, null, 80, null, 76, null]];
        sneak.forEach((notes, bar) => notes.forEach((m, i) => { if (m) add(bar, i / 2, s => s.pluck(N(m), 0, 0.16, 0.11, { pan: -0.25, rev: 0.3 })); }));
        add(1, 3.5, s => s.slide(N(84), N(93), 0, 0.2, 0.05, { vib: [14, 20], pan: 0.4, rev: 0.4 }));
        // "nyah nyah nyah-nyah nyah nyah" on a muted, wobbly trombone
        [[72, 0, 0.5], [72, 0.5, 0.5], [69, 1, 1], [74, 2, 0.5], [72, 2.5, 0.5], [69, 3, 1]].forEach(([m, beat, len]) => add(3, beat, s => s.brass(N(m - 12), 0, len * B * 0.9, 0.12, { bright: 3.2, vibDepth: 26, vibRate: 7, rev: 0.3, pan: 0.2 })));
        // ===== B. mock menace (still D minor): low stabs, timpani, a villain's theme, and a big scary run-up... =====
        const chords = [[38, 50, 57, 62], [38, 50, 57, 62], [34, 46, 53, 58], [33, 45, 52, 57]];
        for (let bar = 4; bar < 8; bar++) {
          const ch = chords[bar - 4];
          for (const beat of [0, 1.5, 2.5]) add(bar, beat, s => { ch.forEach((m, i) => s.brass(N(m), 0, 0.2, i ? 0.05 : 0.09, { bright: 4, pan: (i - 1.5) * 0.25, rev: 0.35 })); s.kick(0, 0.3, { f: N(ch[0]) * 2.4, f2: N(ch[0]), dur: 0.5, rev: 0.3 }); });
          for (const beat of [1, 3]) add(bar, beat, s => s.snare(0, 0.1, { pan: -0.1 }));
        }
        [[4, 0, 62, 2], [4, 2, 65, 1], [4, 3, 69, 1], [5, 0, 68, 1.5], [5, 1.5, 65, 0.5], [5, 2, 64, 2], [6, 0, 70, 2], [6, 2, 69, 1], [6, 3, 65, 1], [7, 0, 64, 1], [7, 1, 61, 1]]
          .forEach(([bar, beat, m, len]) => add(bar, beat, s => { s.brass(N(m), 0, len * B * 0.92, 0.11, { bright: 5, rev: 0.4 }); s.brass(N(m - 12), 0, len * B * 0.92, 0.07, { bright: 4, rev: 0.4, pan: -0.2 }); }));
        [69, 70, 71, 72, 73, 74, 75, 76].forEach((m, i) => add(7, 2 + i * 0.1875, s => { s.brass(N(m - 12), 0, 0.08, 0.06 + i * 0.008, { bright: 6 }); s.noise(0, 0.04, 0.04 + i * 0.012, 1900, 'bandpass', { q: 0.8 }); }));
        add(7, 2, s => s.riser(0, 1.5 * B, 0.13));
        // ...that turns out to be nothing: a beat of silence and a little "boing"
        add(7, 3.6, s => s.tone(N(57), 0, 0.16, 'sine', 0.12, N(69), { vib: [22, 40] }));
        // ===== C. the happy ending (D major): oom-pah, a bouncy tune with a whistle on top =====
        const oom = [[38, [62, 66, 69]], [43, [62, 67, 71]], [45, [61, 67, 69]]];
        for (let bar = 8; bar < 11; bar++) {
          const [root, tri] = oom[bar - 8];
          for (const beat of [0, 2]) add(bar, beat, s => { s.brass(N(beat ? root + 7 : root), 0, 0.22, 0.11, { bright: 3, rev: 0.2 }); s.kick(0, 0.2, { f: 110, f2: 44, dur: 0.14 }); });
          for (const beat of [1, 3]) add(bar, beat, s => { tri.forEach((m, i) => s.pluck(N(m), 0, 0.18, 0.1, { pan: (i - 1) * 0.4, rev: 0.25 })); s.noise(0, 0.03, 0.1, 6500, 'highpass', { rev: 0.1 }); });
        }
        [[74, 78, 81, 78, 86, 81, 78, 81], [79, 83, 86, 83, 91, 86, 83, 86], [81, 85, 88, 85, 91, 88, 85, 79]]
          .forEach((notes, k) => notes.forEach((m, i) => add(8 + k, i / 2, s => { s.pluck(N(m), 0, 0.22, 0.13, { pan: 0.2, rev: 0.35 }); s.bell(N(m + 12), 0, 0.18, 0.03, { pan: 0.35, rev: 0.4 }); if (i % 2 === 0) s.tone(N(m + 12), 0, B * 0.9, 'sine', 0.055, null, { sus: true, a: 0.02, rel: 0.1, vib: [6, 14], pan: -0.3, rev: 0.4 }); })));
        // "shave and a haircut..." everyone in unison
        [[11, 0, 74, 1], [11, 1, 69, 0.5], [11, 1.5, 69, 0.5], [11, 2, 71, 1], [11, 3, 69, 1]].forEach(([bar, beat, m, len]) => add(bar, beat, s => { s.brass(N(m), 0, len * B * 0.8, 0.12, { bright: 6, rev: 0.3 }); s.brass(N(m - 12), 0, len * B * 0.8, 0.09, { bright: 4, pan: -0.2 }); s.pluck(N(m + 12), 0, 0.2, 0.08, { pan: 0.3 }); s.kick(0, 0.22, { f: 110, f2: 44, dur: 0.12 }); }));
        // "...two bits!"
        add(12, 1, s => { [45, 57, 61, 64, 67, 73].forEach((m, i) => s.brass(N(m), 0, B * 0.7, i ? 0.07 : 0.1, { bright: 7, pan: (i - 2.5) * 0.2 })); s.kick(0, 0.4, { f: 120, f2: 40, dur: 0.2 }); s.snare(0, 0.2); });
        add(12, 2, s => { [38, 50, 62, 66, 69, 74].forEach((m, i) => s.brass(N(m), 0, B * 2.2, i ? 0.08 : 0.11, { bright: 7.5, pan: (i - 2.5) * 0.2, rev: 0.45 })); s.boom(0, 0.35, 1.0); s.cym(0, 2.0, 0.14); s.bell(N(98), 0.02, 1.4, 0.06, { rev: 0.6 }); s.slide(N(74), N(98), 0.05, 0.3, 0.05, { vib: [16, 20], pan: 0.4, rev: 0.4 }); });
        return q;
      },
    };
  })();
  // Start the credits tune; it repeats until stopped. audio: () => AudioContext | null
  function music(audio) {
    const cues = CREDITS.cues(); let snd = null, timer = null, dead = false, muted = false;
    const go = () => {
      if (dead) return;
      if (snd) { snd.stop(); snd = null; }
      const ac = muted ? null : audio();
      if (ac) { const t0 = ac.currentTime + 0.1; snd = sound(ac, t0); for (const [ms, fn] of cues) { snd.at(t0 + ms / 1000); try { fn(snd); } catch (e) {} } }
      timer = setTimeout(go, CREDITS.len);
    };
    go();
    return { stop() { dead = true; clearTimeout(timer); if (snd) snd.stop(); }, setMuted(m) { muted = !!m; clearTimeout(timer); go(); } };
  }

  // Render a scene's whole soundtrack offline (used to measure levels; nothing is played).
  async function renderAudio(key, data, seconds) {
    const sr = 44100, oc = new OfflineAudioContext(2, Math.floor(sr * (seconds || 10)), sr), s = sound(oc, 0);
    for (const [ms, fn] of (key === 'credits' ? CREDITS : SCENES[key]).cues(data)) { s.at(ms / 1000); try { fn(s); } catch (e) {} }
    return oc.startRendering();
  }

  // ---------- end credits: one picture of the whole night, ready to save or share ----------
  // opts: { awards: [{key, name, stat}], players: [{name, emoji, total}] (best first), sub, foot }
  async function poster(opts) {
    try { await Promise.all([document.fonts.load('400 40px Bangers'), document.fonts.load('700 40px Fredoka')]); } catch (e) {}
    const awards = opts.awards || [], players = opts.players || [];
    const W = 1080, pad = 48, gap = 26, cw = (W - pad * 2 - gap) / 2, th = Math.round(cw * 0.64), cardH = th + 156;
    const headH = 262, rows = Math.ceil(awards.length / 2), standY = headH + rows * (cardH + gap) + 20, rowH = 84;
    const H = standY + 86 + players.length * rowH + 110;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const left = (text, x, y, o) => { c.save(); c.textAlign = 'left'; c.textBaseline = 'middle'; fit(c, text, o.w, o.size, o.font || FU, o.weight || '700'); c.fillStyle = o.fill || '#fff'; c.fillText(text, x, y); c.restore(); };
    // backdrop
    const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1b2a7a'); bg.addColorStop(0.25, '#0f1a4d'); bg.addColorStop(1, '#0a0f2c'); c.fillStyle = bg; c.fillRect(0, 0, W, H);
    rays(c, W / 2, 110, 1500, 22, 0.07, '#ffd23f', 0.05);
    for (let i = 0; i < 120; i++) { c.fillStyle = `rgba(255,255,255,${0.08 + 0.25 * hash(i, 3)})`; c.beginPath(); c.arc(hash(i) * W, hash(i, 1) * H, 1 + hash(i, 2) * 2.2, 0, TAU); c.fill(); }
    // header
    const gg = c.createLinearGradient(0, 30, 0, 140); gg.addColorStop(0, '#fff6b0'); gg.addColorStop(0.5, '#ffd23f'); gg.addColorStop(1, '#e08a00');
    label(c, 'FLIP 7', W / 2, 92, { size: 128, font: FD, weight: '400', fill: gg, stroke: '#3a1c00', lw: 14 });
    label(c, 'THE AWARDS', W / 2, 178, { size: 56, font: FD, weight: '400', fill: '#fff', stroke: '#0a0f2c', lw: 8 });
    if (opts.sub) label(c, opts.sub, W / 2, 228, { size: 27, font: FU, weight: '500', fill: '#aab6f0', w: W - 120 });
    // award cards, each with a still from its own reveal
    const ladder = players.map(p => ({ name: p.name }));
    cv._cards = [];
    awards.forEach((a, i) => {
      const sc = SCENES[a.key], x = pad + (i % 2) * (cw + gap), y = headH + Math.floor(i / 2) * (cardH + gap);
      cv._cards.push({ i, x: x / W, y: y / H, w: cw / W, h: cardH / H });
      c.save(); c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 24; c.shadowOffsetY = 8; rr(c, x, y, cw, cardH, 26); c.fillStyle = '#17245c'; c.fill(); c.restore();
      const tmp = document.createElement('canvas'), tw = cw - 20; tmp._fixed = { width: tw, height: th, dpr: 1.5 };
      try { sc.draw(stage(tmp), sc.thumb || 7600, { name: a.name, stat: a.stat, ladder: ladder.map(p => ({ name: p.name, me: p.name === a.name })) }); } catch (e) {}
      c.save(); rr(c, x + 10, y + 10, tw, th, 18); c.clip(); c.drawImage(tmp, x + 10, y + 10, tw, th); c.restore();
      rr(c, x, y, cw, cardH, 26); c.lineWidth = 3; c.strokeStyle = '#ffd23f'; c.stroke();
      left(sc.icon + '  ' + sc.title, x + 24, y + th + 46, { size: 33, font: FD, weight: '400', fill: '#ffd23f', w: cw - 48 });
      left(a.name, x + 24, y + th + 90, { size: 40, w: cw - 48 });
      left(a.stat, x + 24, y + th + 130, { size: 23, weight: '500', fill: '#aab6f0', w: cw - 48 });
    });
    // everyone, in finishing order, with the awards they took home
    label(c, 'FINAL STANDINGS', W / 2, standY + 34, { size: 46, font: FD, weight: '400', fill: '#ffd23f', stroke: '#0a0f2c', lw: 8 });
    players.forEach((p, i) => {
      const y = standY + 86 + i * rowH, won = awards.filter(a => a.name === p.name).map(a => SCENES[a.key].icon).join(' ');
      rr(c, pad, y, W - pad * 2, rowH - 12, 18); c.fillStyle = i === 0 ? 'rgba(255,210,63,.22)' : 'rgba(23,36,92,.9)'; c.fill(); if (i === 0) { c.lineWidth = 3; c.strokeStyle = '#ffd23f'; c.stroke(); }
      const cy = y + (rowH - 12) / 2;
      label(c, ['🥇', '🥈', '🥉'][i] || String(i + 1), pad + 44, cy + 2, { size: i < 3 ? 40 : 32, font: FU, fill: '#aab6f0' });
      c.fillStyle = `hsl(${(i * 67 + 200) % 360} 70% 60%)`; c.beginPath(); c.arc(pad + 118, cy, 27, 0, TAU); c.fill();
      label(c, p.emoji || '🙂', pad + 118, cy + 3, { size: 32 });
      c.save(); c.font = `700 36px ${FU}`; const nameW = Math.min(W - pad * 2 - 420, c.measureText(p.name).width); c.restore();
      left(p.name, pad + 164, cy + 2, { size: 36, w: W - pad * 2 - 420 });
      if (won) left(won, pad + 164 + nameW + 18, cy + 3, { size: 30, w: 230 });
      c.save(); c.textAlign = 'right'; c.textBaseline = 'middle'; c.font = `700 40px ${FU}`; c.fillStyle = '#fff'; c.fillText(String(p.total), W - pad - 26, cy + 2); c.restore();
    });
    label(c, opts.foot || 'Flip 7 online', W / 2, H - 56, { size: 26, font: FU, weight: '500', fill: '#7f8bd0', w: W - 120 });
    return cv;
  }

  // Draw one still frame (used for reduced motion and for tests).
  function frame(cv, key, data, t) { SCENES[key].draw(stage(cv), t, data); }

  // Play a scene. opts: { canvas, key, data, offset, audio: () => AudioContext|null, onReveal, onEnd, still }
  function play(opts) {
    const sc = SCENES[opts.key], data = opts.data, DUR = sc.dur || 8000;
    let t0 = performance.now() - (opts.offset || 0), raf = 0, dead = false, revealed = false, ended = false;
    let snd = sound(opts.audio ? opts.audio() : null);
    const cues = sc.cues(data).sort((a, b) => a[0] - b[0]);
    let ci = 0; while (ci < cues.length && cues[ci][0] < (opts.offset || 0) - 60) ci++;
    const reveal = () => { if (!revealed) { revealed = true; if (opts.onReveal) opts.onReveal(); } };
    if (opts.still) {   // reduced motion: the finished picture, no movement, one soft chime
      sc.draw(stage(opts.canvas), DUR, data); reveal(); snd.tone(784, 0, 0.5, 'sine', 0.08); snd.tone(1175, 0.08, 0.6, 'sine', 0.06);
      const onR = () => { if (!dead) sc.draw(stage(opts.canvas), DUR, data); }; addEventListener('resize', onR);
      const timer = setTimeout(() => { if (opts.onEnd) opts.onEnd(); }, 4000);
      return { skip() {}, stop() { dead = true; clearTimeout(timer); removeEventListener('resize', onR); snd.stop(); } };
    }
    const loop = now => {
      if (dead) return;
      const t = now - t0;
      while (ci < cues.length && cues[ci][0] <= t) { try { cues[ci][1](snd); } catch (e) {} ci++; }
      try { sc.draw(stage(opts.canvas), t, data); } catch (e) { if (!loop.err) { loop.err = 1; console.error('award scene', opts.key, e); } }
      if (t >= sc.reveal) reveal();
      if (t >= DUR + 1300 && !ended) { ended = true; if (opts.onEnd) opts.onEnd(); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return {
      skip() {   // jump straight to the finished reveal, silently
        const now = performance.now(); if (now - t0 >= DUR - 600) return;
        t0 = now - (DUR - 600); while (ci < cues.length && cues[ci][0] < DUR - 600) ci++;
        snd.stop(); snd = sound(opts.audio ? opts.audio() : null); snd.tone(880, 0, 0.3, 'sine', 0.07);
      },
      setMuted(m) { snd.stop(); snd = sound(m ? null : (opts.audio ? opts.audio() : null)); },
      stop() { dead = true; cancelAnimationFrame(raf); snd.stop(); },
    };
  }

  return { SCENES, DUR, play, frame, poster, music, renderAudio, ORDER: ['gambler', 'nerd', 'luckiest', 'unluckiest', 'comeback', 'champion'] };
})();
