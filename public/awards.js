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
      const L = slotLayout(d), q = [];
      q.push([280, s => { s.noise(0, 0.1, 0.3, 500); s.tone(180, 0.05, 0.25, 'sawtooth', 0.12, 60); }]);
      for (let t = 650; t < 5200; t += 85) q.push([t, s => s.tone(900 + (t % 340), 0, 0.03, 'square', 0.035)]);
      L.reels.forEach((r, i) => q.push([r.stop, s => { s.noise(0, 0.07, 0.35, 300); s.tone(330 + i * 40, 0, 0.16, 'triangle', 0.16); }]));
      q.push([5400, s => { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => s.tone(f, i * 0.085, 0.35, 'square', 0.09)); s.noise(0, 0.5, 0.2, 6000, 'highpass'); }]);
      for (let t = 5500; t < 8000; t += 110) q.push([t, s => s.tone(1800 + hash(t) * 1600, 0, 0.09, 'sine', 0.06)]);
      return q;
    },
    draw(s, t, d) {
      const L = slotLayout(d), jack = t >= 5400, jp = seg(t, 5400, 6000);
      vgrad(s.c, s, jack && Math.floor(t / 110) % 2 ? ['#5a0a1c', '#a8102e', '#3a0512'] : ['#2a0410', '#7a0c24', '#1c030b']);
      const c = begin(s);
      const k = Math.min(1.5, (2 * s.vw - 40) / (L.mw + 170), (s.vh - 262) / (L.mh / 2 + 150)); c.translate(0, -34); c.scale(k, k); s = Object.assign({}, s, { vw: s.vw / k, vh: s.vh / k });
      if (jack) { rays(c, 0, 0, 1500, 16, t * 0.0006, '#ffd23f', 0.16 + 0.08 * Math.sin(t * 0.02)); }
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

  // =====================================================================
  // 2. THE SAFE NERD — glasses push, anime lens glint, polished name
  // =====================================================================
  const nerd = {
    title: 'THE SAFE NERD', sub: 'Played it safest', icon: '🤓', reveal: 5400,
    cues() {
      return [
        [150, s => s.tone(300, 0, 0.14, 'sine', 0.16, 700)],
        [950, s => s.tone(500, 0, 0.3, 'sine', 0.1, 260)],
        [1550, s => s.tone(420, 0, 0.32, 'square', 0.05, 980)],
        [2350, s => { s.tone(2200, 0, 0.5, 'sine', 0.12, 5200); s.noise(0, 0.45, 0.12, 7000, 'highpass'); }],
        [2900, s => s.tone(3200, 0, 0.35, 'sine', 0.09, 6400)],
        [3600, s => [523, 659, 784].forEach((f, i) => s.tone(f, i * 0.02, 0.7, 'triangle', 0.1))],
        [5200, s => { s.tone(1500, 0, 0.7, 'sine', 0.09, 3800); s.noise(0, 0.5, 0.07, 8000, 'highpass'); }],
        [6100, s => [1047, 1319, 1568, 2093].forEach((f, i) => s.tone(f, i * 0.07, 0.25, 'sine', 0.07))],
      ];
    },
    draw(s, t, d) {
      const glint = seg(t, 2300, 3300), dark = Math.sin(seg(t, 2200, 3500) * Math.PI);
      vgrad(s.c, s, ['#bfe6ff', '#dff3ff', '#a9d4ff']);
      const c = begin(s);
      const k0 = Math.min(1.25, (2 * s.vw - 40) / 960); c.scale(k0, k0); s = Object.assign({}, s, { vw: s.vw / k0, vh: s.vh / k0 });
      // notebook grid + drifting maths
      c.strokeStyle = 'rgba(70,130,220,.18)'; c.lineWidth = 2;
      for (let x = -Math.ceil(s.vw / 80) * 80; x <= s.vw; x += 80) { c.beginPath(); c.moveTo(x, -s.vh); c.lineTo(x, s.vh); c.stroke(); }
      for (let y = -Math.ceil(s.vh / 80) * 80; y <= s.vh; y += 80) { c.beginPath(); c.moveTo(-s.vw, y); c.lineTo(s.vw, y); c.stroke(); }
      const M = ['π', '∑', '√', '∞', '%', '÷', '≈', 'x²', '∫', '7'];
      for (let i = 0; i < 16; i++) {
        const x = (hash(i) - 0.5) * 2 * s.vw, y = ((hash(i, 1) * 2 * s.vh - t * (0.02 + hash(i, 2) * 0.03)) % (2 * s.vh) + 2 * s.vh) % (2 * s.vh) - s.vh;
        label(c, M[i % M.length], x, y, { size: 54 + hash(i, 3) * 40, font: FU, fill: 'rgba(40,90,190,.2)' });
      }
      if (dark > 0) {   // anime moment: darken + speed lines
        c.fillStyle = `rgba(8,12,40,${dark * 0.8})`; c.fillRect(-s.vw, -s.vh, s.vw * 2, s.vh * 2);
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
        const fg = c.createRadialGradient(-60, -70, 20, 0, 0, R); fg.addColorStop(0, '#fff07a'); fg.addColorStop(1, '#f7b500');
        c.fillStyle = fg; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill(); c.lineWidth = 8; c.strokeStyle = '#a86b00'; c.stroke();
        const k = R / 200;
        // smile + teeth
        c.strokeStyle = '#5a3200'; c.lineWidth = 9 * k; c.lineCap = 'round'; c.beginPath(); c.arc(0, 40 * k, 78 * k, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
        c.fillStyle = '#fff'; rr(c, -26 * k, 106 * k, 24 * k, 30 * k, 5 * k); c.fill(); c.stroke(); rr(c, 2 * k, 106 * k, 24 * k, 30 * k, 5 * k); c.fill(); c.stroke();
        // glasses: slip down, then get pushed back up
        const slip = eo(seg(t, 900, 1400)) * 34 - back(seg(t, 1600, 2000)) * 44;
        const gy = -42 * k + slip * k;
        c.fillStyle = '#3a2a1a';   // eyes (behind lenses)
        if (glint < 0.05 || glint > 0.98) { c.beginPath(); c.arc(-74 * k, -40 * k, 15 * k, 0, TAU); c.arc(74 * k, -40 * k, 15 * k, 0, TAU); c.fill(); }
        for (const sx of [-1, 1]) {
          const lx = sx * 76 * k;
          rr(c, lx - 62 * k, gy - 48 * k, 124 * k, 96 * k, 26 * k);
          const white = Math.sin(glint * Math.PI) > 0 ? cl(Math.sin(glint * Math.PI) * 1.6) : 0;
          c.fillStyle = `rgba(${lerp(200, 255, white)},${lerp(235, 255, white)},255,${lerp(0.28, 1, white)})`; c.fill();
          c.save(); c.clip();
          const bx = lx - 150 * k + glint * 300 * k;   // the travelling shine
          if (glint > 0 && glint < 1) { c.fillStyle = 'rgba(255,255,255,1)'; c.beginPath(); c.moveTo(bx - 20 * k, gy - 60 * k); c.lineTo(bx + 30 * k, gy - 60 * k); c.lineTo(bx - 10 * k, gy + 60 * k); c.lineTo(bx - 60 * k, gy + 60 * k); c.fill();
            c.fillStyle = 'rgba(120,200,255,.9)'; c.beginPath(); c.moveTo(bx + 44 * k, gy - 60 * k); c.lineTo(bx + 58 * k, gy - 60 * k); c.lineTo(bx + 18 * k, gy + 60 * k); c.lineTo(bx + 4 * k, gy + 60 * k); c.fill(); }
          c.restore();
          rr(c, lx - 62 * k, gy - 48 * k, 124 * k, 96 * k, 26 * k); c.lineWidth = 13 * k; c.strokeStyle = '#1d1d2b'; c.stroke();
        }
        c.strokeStyle = '#1d1d2b'; c.lineWidth = 13 * k; c.beginPath(); c.moveTo(-14 * k, gy - 6 * k); c.lineTo(14 * k, gy - 6 * k); c.stroke();
        // lens-corner star
        const st = Math.sin(seg(t, 2700, 3400) * Math.PI);
        if (st > 0) { sparkle(c, 150 * k, gy - 52 * k, 120 * st * k, t * 0.004, '#fff'); sparkle(c, 150 * k, gy - 52 * k, 60 * st * k, -t * 0.006, '#9fe0ff'); }
        // the finger that pushes them up
        const up = seg(t, 1450, 1750), dn = seg(t, 2050, 2350), hp = eo(up) - eo(dn);
        if (hp > 0.01) { const hx = 0, hy = lerp(330, gy / k + 16, hp) * k; c.fillStyle = '#f7b500'; c.strokeStyle = '#a86b00'; c.lineWidth = 7 * k; rr(c, hx - 22 * k, hy, 44 * k, 300 * k, 22 * k); c.fill(); c.stroke(); }
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
        pts.push([lerp(0, ex, b) + Math.sin(p * 30 + k) * 5, lerp(330, ey, b)]);
      }
      vs.push(pts);
    }
    return (d._v = vs);
  }
  const luckiest = {
    title: 'THE LUCKIEST', sub: 'Fortune smiled on them', icon: '🍀', reveal: 5600,
    cues() {
      const q = [[200, s => s.tone(196, 0, 0.5, 'sine', 0.12, 392)], [700, s => s.tone(660, 0, 0.12, 'triangle', 0.1)]];
      const P = [392, 440, 523, 587, 659, 784, 880, 1047, 1175, 1319];
      for (let i = 0; i < 20; i++) q.push([1300 + i * 185, s => { s.tone(P[i % 10] * (i > 9 ? 1.5 : 1), 0, 0.3, 'triangle', 0.07); if (i % 3 === 0) s.tone(1700 + i * 60, 0.05, 0.08, 'sine', 0.05); }]);
      q.push([5300, s => { [784, 988, 1175, 1568, 1976].forEach((f, i) => s.tone(f, i * 0.06, 0.9, 'sine', 0.09)); s.noise(0, 0.9, 0.06, 9000, 'highpass'); }]);
      for (let t = 5800; t < 8000; t += 240) q.push([t, s => s.tone(2000 + hash(t) * 1800, 0, 0.2, 'sine', 0.04)]);
      return q;
    },
    draw(s, t, d) {
      vgrad(s.c, s, ['#03231a', '#0a4a30', '#04180f']);
      const c = begin(s), big = seg(t, 5200, 6200);
      const k0 = Math.min(1.3, (2 * s.vw - 30) / 1080); c.scale(k0, k0); s = Object.assign({}, s, { vw: s.vw / k0, vh: s.vh / k0 });
      // light shafts + fireflies
      c.save(); c.globalCompositeOperation = 'lighter';
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
      // soil + sprout
      c.fillStyle = '#3b2412'; c.beginPath(); c.ellipse(0, 372, 190 * eo(seg(t, 0, 500)), 46, 0, 0, TAU); c.fill();
      c.fillStyle = '#5a3a1e'; c.beginPath(); c.ellipse(0, 362, 150 * eo(seg(t, 0, 500)), 30, 0, 0, TAU); c.fill();
      const sp = eo(seg(t, 300, 1200)), wig = Math.sin(t * 0.012) * 0.12 * (1 - seg(t, 900, 1600));
      if (sp > 0) { c.save(); c.translate(0, 350); c.rotate(wig); c.strokeStyle = '#2fae5b'; c.lineWidth = 12; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(14, -40 * sp, 0, -80 * sp); c.stroke();
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

  // =====================================================================
  // 4. THE UNLUCKIEST — casket, dirt, gravestone, sad trombone
  // =====================================================================
  const unluckiest = {
    title: 'THE UNLUCKIEST', sub: 'Gone too soon (again and again)', icon: '⚰️', reveal: 6200,
    cues(d) {
      const bell = s => { [98, 196, 294, 392].forEach((f, i) => s.tone(f, 0, 2.2 - i * 0.3, 'sine', 0.12 / (i + 1))); };
      const q = [[80, bell], [1500, bell]];
      [[233, 0.55], [233, 0.4], [233, 0.15], [233, 0.55], [277, 0.4], [262, 0.15], [262, 0.4], [233, 0.15], [233, 0.4], [220, 0.15], [233, 0.7]]
        .reduce((at, [f, len]) => { q.push([at, s => s.tone(f / 2, 0, len * 0.95, 'triangle', 0.13)]); return at + len * 520; }, 250);
      const n = graphemes(d.name).length;
      for (let i = 0; i < n; i++) q.push([1500 + i * (1000 / n), s => { s.noise(0, 0.03, 0.2, 3000, 'highpass'); s.tone(1400, 0, 0.03, 'square', 0.04); }]);
      for (let i = 0; i < 7; i++) q.push([2950 + i * 320, s => { s.noise(0, 0.16, 0.35, 220, 'lowpass'); s.tone(70, 0, 0.12, 'sine', 0.2, 40); }]);
      q.push([5000, s => s.noise(0, 1.0, 0.3, 120, 'lowpass')]);
      q.push([6000, s => { s.noise(0, 0.9, 0.3, 400, 'lowpass'); s.tone(50, 0, 0.6, 'sine', 0.2, 28); }]);
      q.push([6300, s => { [[311, 0.36], [293, 0.36], [277, 0.36]].forEach(([f, l], i) => s.tone(f, i * 0.4, l, 'sawtooth', 0.09, f * 0.97)); s.tone(262, 1.2, 1.1, 'sawtooth', 0.1, 205); }]);
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
      // moon, hills, trees
      c.fillStyle = 'rgba(255,250,210,.12)'; c.beginPath(); c.arc(-300, -520, 150, 0, TAU); c.fill();
      c.fillStyle = '#f6efc0'; c.beginPath(); c.arc(-300, -520, 92, 0, TAU); c.fill(); c.fillStyle = '#ddd4a0'; c.beginPath(); c.arc(-330, -540, 18, 0, TAU); c.arc(-270, -490, 26, 0, TAU); c.fill();
      c.fillStyle = '#17142e'; c.beginPath(); c.moveTo(-2000, -30); for (let x = -2000; x <= 2000; x += 100) c.lineTo(x, -40 - 60 * Math.sin(x * 0.004) - 30 * Math.sin(x * 0.011)); c.lineTo(2000, 2000); c.lineTo(-2000, 2000); c.fill();
      c.strokeStyle = '#0a0818'; c.lineCap = 'round';
      for (const [tx, sc] of [[-470, 1], [520, 0.85]]) { c.save(); c.translate(tx, -30); c.scale(sc, sc); c.lineWidth = 26; c.beginPath(); c.moveTo(0, 60); c.quadraticCurveTo(-10, -100, 20, -230); c.stroke(); c.lineWidth = 12; for (const [a, b, e, f] of [[8, -120, -90, -200], [14, -170, 110, -260], [18, -210, -40, -330], [-2, -60, 90, -120]]) { c.beginPath(); c.moveTo(a, b); c.lineTo(e, f); c.stroke(); } c.restore(); }
      c.fillStyle = '#211c3d'; c.fillRect(-2000, 40, 4000, 2000);
      // other, older graves
      for (const [gx, gy, gs] of [[-420, 70, 0.5], [430, 90, 0.6], [-640, 150, 0.7]]) { c.fillStyle = '#4a4863'; rr(c, gx - 50 * gs, gy - 130 * gs, 100 * gs, 140 * gs, 46 * gs); c.fill(); }
      // the grave
      const fill = seg(t, 2900, 5000);
      c.fillStyle = '#0a0612'; c.beginPath(); c.moveTo(-175, 70); c.lineTo(175, 70); c.lineTo(275, 410); c.lineTo(-275, 410); c.closePath(); c.fill();
      c.fillStyle = '#2b1c10'; c.beginPath(); c.moveTo(-175, 70); c.lineTo(175, 70); c.lineTo(190, 120); c.lineTo(-190, 120); c.closePath(); c.fill();
      // casket with the engraved name
      const wood = c.createLinearGradient(-200, 0, 200, 0); wood.addColorStop(0, '#5a3418'); wood.addColorStop(0.5, '#8a5327'); wood.addColorStop(1, '#4e2c13');
      c.fillStyle = wood; c.beginPath(); c.moveTo(-120, 108); c.lineTo(120, 108); c.lineTo(168, 180); c.lineTo(212, 390); c.lineTo(-212, 390); c.lineTo(-168, 180); c.closePath(); c.fill();
      c.strokeStyle = '#d9a441'; c.lineWidth = 6; c.stroke();
      c.strokeStyle = 'rgba(40,20,5,.5)'; c.lineWidth = 3; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(-150 + i * 60, 120); c.lineTo(-190 + i * 76, 385); c.stroke(); }
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
        if (fill >= 1) { c.fillStyle = '#5c3a1c'; c.beginPath(); c.moveTo(-190, 80); c.quadraticCurveTo(0, 20, 190, 80); c.lineTo(285, 415); c.quadraticCurveTo(0, 450, -285, 415); c.closePath(); c.fill(); c.fillStyle = '#6b4526'; for (let i = 0; i < 14; i++) { c.beginPath(); c.ellipse((hash(i, 20) - 0.5) * 380, 110 + hash(i, 21) * 280, 34, 14, 0, 0, TAU); c.fill(); } }
      }
      // shovels + flying clumps
      if (t > 2700 && t < 5200) for (const sx of [-1, 1]) {
        const ph = ((t - 2700) / 640 + (sx > 0 ? 0.5 : 0)) % 1, sw = Math.sin(ph * TAU);
        c.save(); c.translate(sx * 400, 250); c.rotate(sx * (-0.5 + sw * 0.5)); c.strokeStyle = '#9a6a3a'; c.lineWidth = 14; c.beginPath(); c.moveTo(0, 150); c.lineTo(0, -40); c.stroke(); c.fillStyle = '#b9bccb'; c.beginPath(); c.moveTo(-34, -40); c.lineTo(34, -40); c.lineTo(26, -120); c.quadraticCurveTo(0, -150, -26, -120); c.closePath(); c.fill(); c.restore();
        const fp = (ph + 0.75) % 1; if (fp < 0.5) { const q = fp / 0.5; for (let i = 0; i < 6; i++) { c.fillStyle = '#5c3a1c'; c.beginPath(); c.arc(lerp(sx * 360, (hash(i, 30) - 0.5) * 200, q), lerp(150, 250, q) - Math.sin(q * Math.PI) * (170 + i * 12), 16 - i, 0, TAU); c.fill(); } }
      }
      // the gravestone rises
      const rise = eo(seg(t, 5000, 6100));
      if (rise > 0) {
        c.save(); c.beginPath(); c.rect(-500, -900, 1000, 978); c.clip();
        c.translate(Math.sin(t * 0.08) * 5 * (1 - rise), (1 - rise) * 470);
        c.translate(0, 80); c.scale(1.4, 1.4); c.translate(0, -80);
        const sg = c.createLinearGradient(-120, 0, 120, 0); sg.addColorStop(0, '#6f6d8a'); sg.addColorStop(0.5, '#a9a7c2'); sg.addColorStop(1, '#5d5b78');
        c.fillStyle = sg; c.beginPath(); c.moveTo(-125, 80); c.lineTo(-125, -130); c.quadraticCurveTo(-125, -250, 0, -250); c.quadraticCurveTo(125, -250, 125, -130); c.lineTo(125, 80); c.closePath(); c.fill(); c.strokeStyle = '#3b3954'; c.lineWidth = 8; c.stroke();
        c.strokeStyle = 'rgba(40,38,60,.6)'; c.lineWidth = 4; c.beginPath(); c.moveTo(60, -230); c.lineTo(80, -180); c.lineTo(66, -150); c.stroke();
        label(c, 'R.I.P.', 0, -180, { size: 54, font: FD, fill: '#33314c', weight: '400' });
        label(c, d.name, 0, -100, { size: 62, font: FU, fill: '#33314c', w: 215 });
        label(c, 'ran out of luck', 0, -40, { size: 24, font: FU, fill: '#4a4868', w: 215, weight: '500' });
        c.restore();
        for (let i = 0; i < 12; i++) { const a = seg(t, 5000 + i * 60, 5900 + i * 60); if (a > 0 && a < 1) { c.fillStyle = `rgba(150,130,110,${0.5 * (1 - a)})`; c.beginPath(); c.arc((hash(i, 40) - 0.5) * 320, 70 - a * 60, 20 + a * 36, 0, TAU); c.fill(); } }
      }
      if (t > 6300) {   // ghost drifts away, flower wilts
        const gp = seg(t, 6300, 9500); c.save(); c.globalAlpha = Math.sin(Math.min(1, gp * 1.2) * Math.PI) * 0.9 + 0.05;
        label(c, '👻', Math.sin(t * 0.003) * 50 + 250, 200 - gp * 520, { size: 120 }); c.restore();
        label(c, '🥀', -215, 60 - back(seg(t, 6400, 6800)) * 30, { size: 70 * back(seg(t, 6400, 6800)) });
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
  const champion = {
    title: 'THE CHAMPION', sub: 'All hail the winner', icon: '👑', reveal: 5800,
    cues() {
      const q = [];
      for (let t = 0, gap = 120; t < 5150; t += gap, gap = Math.max(34, gap * 0.955)) q.push([t, s => s.noise(0, 0.05, 0.05 + 0.2 * (t / 5150), 1800, 'bandpass')]);
      const P = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760, 2093, 2349];
      GEMS.forEach((_, i) => q.push([3000 + i * 170, s => s.tone(P[i], 0, 0.3, 'sine', 0.11)]));
      q.push([5200, s => { s.noise(0, 1.4, 0.3, 5000, 'highpass'); s.tone(60, 0, 0.5, 'sine', 0.25, 30);
        [[523, 0], [523, 0.16], [523, 0.32], [659, 0.5], [784, 0.75], [1047, 1.0]].forEach(([f, at]) => { s.tone(f, at, at === 1.0 ? 1.2 : 0.22, 'sawtooth', 0.07); s.tone(f * 1.5, at, at === 1.0 ? 1.2 : 0.22, 'triangle', 0.06); s.tone(f / 2, at, at === 1.0 ? 1.2 : 0.22, 'square', 0.04); }); }]);
      for (let t = 6400; t < 8000; t += 300) q.push([t, s => s.tone(2100 + hash(t) * 1500, 0, 0.15, 'sine', 0.04)]);
      return q;
    },
    draw(s, t, d) {
      const rev = t >= 5200, rp = seg(t, 5200, 5800);
      vgrad(s.c, s, ['#1a0633', '#3d0f66', '#12041f']);
      const c = begin(s);
      const z = lerp(0.52, 1.12, eio(seg(t, 0, 5100))) * lerp(1, 0.78, eio(seg(t, 5200, 5900)));
      const camY = lerp(60, -70, eio(seg(t, 0, 5100))) + eio(seg(t, 5200, 5900)) * 120;
      const shake = rev ? Math.sin(t * 0.1) * 10 * (1 - seg(t, 5200, 5900)) : 0;
      // hall (moves slower than the throne: parallax)
      c.save(); c.translate(shake, 0); c.scale(lerp(1, z, 0.45), lerp(1, z, 0.45));
      for (const sx of [-1, 1]) for (let i = 1; i <= 3; i++) { const px = sx * (260 + i * 250); const pg = c.createLinearGradient(px - 50, 0, px + 50, 0); pg.addColorStop(0, '#2a0d47'); pg.addColorStop(0.5, '#5a2a8a'); pg.addColorStop(1, '#240a3d'); c.fillStyle = pg; c.fillRect(px - 46, -1400, 92, 2800); c.fillStyle = '#c9972a'; c.fillRect(px - 60, 330, 120, 30); c.fillRect(px - 60, -560, 120, 26);
        c.fillStyle = '#a3102e'; c.beginPath(); c.moveTo(px - 130 * sx - 40, -540); c.lineTo(px - 130 * sx + 40, -540); c.lineTo(px - 130 * sx + 40, -260); c.lineTo(px - 130 * sx, -310); c.lineTo(px - 130 * sx - 40, -260); c.fill(); }
      c.restore();
      c.save(); c.translate(shake, 0); c.scale(z, z); c.translate(0, -camY);
      if (rev) { rays(c, 0, -120, 1700, 18, t * 0.0004, '#ffe27a', 0.2 * rp); }
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
      // gems
      GEMS.forEach(([gx, gy, col, r], i) => {
        const on = seg(t, 3000 + i * 170, 3000 + i * 170 + 260), lit = on > 0, pulse = 0.75 + 0.25 * Math.sin(t * 0.008 + i);
        if (lit) { c.save(); c.globalCompositeOperation = 'lighter'; const hg = c.createRadialGradient(gx, gy, 2, gx, gy, r * (3 + (rev ? 2 : 0)) * pulse); hg.addColorStop(0, col); hg.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = 0.85 * on; c.fillStyle = hg; c.beginPath(); c.arc(gx, gy, r * 5.5, 0, TAU); c.fill(); c.restore(); }
        c.save(); c.translate(gx, gy); c.rotate(Math.PI / 4); c.fillStyle = lit ? col : '#4a3a55'; c.strokeStyle = '#2a1500'; c.lineWidth = 4; rr(c, -r, -r, r * 2, r * 2, 5); c.fill(); c.stroke(); c.fillStyle = `rgba(255,255,255,${lit ? 0.85 : 0.2})`; c.fillRect(-r * 0.55, -r * 0.55, r * 0.6, r * 0.6); c.restore();
        if (lit) sparkle(c, gx, gy, r * (1.6 + (1 - on) * 3) * pulse, t * 0.003 + i, '#fff');
      });
      // the stick-figure monarch
      const up = back(rp), bob = rev ? Math.sin(t * 0.012) * 6 : 0;
      c.save(); c.translate(0, bob); c.strokeStyle = '#fff'; c.lineWidth = 13; c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, -34); c.lineTo(0, 90); c.moveTo(0, 90); c.lineTo(-62, 124); c.lineTo(-62, 232); c.moveTo(0, 90); c.lineTo(62, 124); c.lineTo(62, 232); c.stroke();
      for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(0, 6); c.lineTo(sx * lerp(96, 120, up), lerp(34, -90, up)); c.lineTo(sx * lerp(172, 150, up), lerp(4, -210, up)); c.stroke(); }
      c.fillStyle = '#1a0633'; c.beginPath(); c.arc(0, -86, 52, 0, TAU); c.fill(); c.stroke();
      c.lineWidth = 7; c.beginPath(); c.arc(0, -78, 24, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(-19, -98, 6, 0, TAU); c.arc(19, -98, 6, 0, TAU); c.fill();
      c.fillStyle = '#ffd23f'; c.strokeStyle = '#5a3200'; c.lineWidth = 5; c.beginPath(); c.moveTo(-44, -128); c.lineTo(-52, -190); c.lineTo(-24, -160); c.lineTo(0, -202); c.lineTo(24, -160); c.lineTo(52, -190); c.lineTo(44, -128); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#ff3b5c'; c.beginPath(); c.arc(0, -150, 8, 0, TAU); c.fill();
      c.restore();
      c.restore();
      // huge gold name
      if (rev) {
        c.save(); const sc = lerp(3.4, 1, eo(rp)); c.translate(0, 330); c.scale(sc, sc); c.globalAlpha = cl(rp * 3);
        const size = 240, g = c.createLinearGradient(0, -110, 0, 110); g.addColorStop(0, '#fffbd0'); g.addColorStop(0.35, '#ffd23f'); g.addColorStop(0.55, '#f0a000'); g.addColorStop(0.62, '#fff2a0'); g.addColorStop(1, '#c97f00');
        label(c, d.name, 0, 10, { size, font: FD, fill: '#3a1c00', stroke: '#3a1c00', lw: 34, w: 920, weight: '400' });
        label(c, d.name, 0, 0, { size, font: FD, fill: g, stroke: '#7a4300', lw: 10, w: 920, weight: '400' });
        sweep(c, d.name, 0, 0, size, FD, 920, ((t - 5700) % 1700) / 1000, '400');
        c.restore();
        for (let i = 0; i < 12; i++) { const a = t * 0.0012 + i * TAU / 12; sparkle(c, Math.cos(a) * 520, 330 + Math.sin(a) * 120, 22 + 14 * Math.sin(t * 0.006 + i), t * 0.003, i % 2 ? '#fff' : '#ffe27a'); }
        for (let i = 0; i < 60; i++) { const age = (t - 5200 - hash(i) * 900); if (age < 0) continue; const a2 = age % 2600; const x = (hash(i, 1) - 0.5) * 2 * s.vw + Math.sin(a2 * 0.004 + i) * 40, y = -s.vh - 30 + a2 * (0.35 + hash(i, 2) * 0.3); c.save(); c.translate(x, y); c.rotate(a2 * 0.006 + i); c.fillStyle = ['#ffd23f', '#fff2a0', '#ff5d8f', '#c77dff'][i % 4]; c.fillRect(-10, -5 * Math.cos(a2 * 0.01 + i), 20, 10 * Math.cos(a2 * 0.01 + i)); c.restore(); }
        const fl = 1 - seg(t, 5200, 5600); if (fl > 0) { c.fillStyle = `rgba(255,250,220,${fl})`; c.fillRect(-s.vw, -s.vh, s.vw * 2, s.vh * 2); }
      }
      c.restore();
    },
  };

  // =====================================================================
  // 6. THE COMEBACK KID — fire climbs the ranking ladder
  // =====================================================================
  const GAP = 210;
  function ladder(d) {
    if (d._l) return d._l;
    const names = (d.ladder || []).slice().reverse();          // last place at the bottom, 1st at the top
    while (names.length < 4) names.unshift(null);
    const top = -(names.length) * GAP - 40;
    const F = t => lerp(330, top, eio(seg(t, 900, 5600)));
    const rungs = names.map((n, i) => {
      const y = -i * GAP; let lo = 900, hi = 5600;
      for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2; if (F(m) > y + 30) lo = m; else hi = m; }
      return { name: n ? n.name : null, me: n ? n.me : false, y, hit: hi, dir: i % 2 ? 1 : -1 };
    });
    return (d._l = { rungs, top, F });
  }
  const comeback = {
    title: 'THE COMEBACK KID', sub: 'Rose from the ashes', icon: '🔥', reveal: 6300,
    cues(d) {
      const L = ladder(d), q = [[500, s => { s.noise(0, 0.25, 0.25, 4000, 'highpass'); s.tone(200, 0.1, 0.3, 'sawtooth', 0.05, 500); }]];
      for (let t = 900; t < 5600; t += 75) q.push([t, s => s.noise(0, 0.03 + hash(t) * 0.05, 0.08 + hash(t, 1) * 0.12, 1500 + hash(t, 2) * 3000, 'bandpass')]);
      q.push([900, s => s.tone(70, 0, 4.7, 'sawtooth', 0.05, 320)]);
      L.rungs.forEach((r, i) => { if (r.name && !r.me) q.push([r.hit, s => { s.noise(0, 0.08, 0.3, 500, 'lowpass'); s.tone(900 + i * 60, 0.03, 0.7, 'sine', 0.08, 180); }]); });
      q.push([5600, s => { s.noise(0, 1.3, 0.5, 700, 'lowpass'); s.noise(0, 0.5, 0.25, 5000, 'highpass'); s.tone(140, 0, 1.0, 'sine', 0.3, 28); }]);
      q.push([5950, s => [[392, 0], [523, 0.13], [659, 0.26], [784, 0.39], [1047, 0.6]].forEach(([f, at]) => { s.tone(f, at, at === 0.6 ? 1.1 : 0.18, 'sawtooth', 0.08); s.tone(f * 2, at, at === 0.6 ? 1.1 : 0.18, 'triangle', 0.05); })]);
      for (let t = 6200; t < 8000; t += 90) q.push([t, s => s.noise(0, 0.04, 0.06, 2500 + hash(t) * 2500, 'bandpass')]);
      return q;
    },
    draw(s, t, d) {
      const L = ladder(d), F = L.F(t), heat = seg(t, 900, 5600), boom = t >= 5600, bp = seg(t, 5600, 6300);
      vgrad(s.c, s, ['#05061a', '#0d1036', '#1a0d2e']);
      const c0 = s.c; c0.save(); c0.globalAlpha = heat * 0.75; vgrad(c0, s, ['rgba(120,20,0,0)', '#5a1200', '#c23b00']); c0.restore();
      const c = begin(s);
      const fitZ = Math.min(1, s.vw / 420);
      c.scale(fitZ, fitZ);
      const vh = s.vh / fitZ, vw = s.vw / fitZ;
      const revealY = L.top - 150;
      const camY = boom ? lerp(Math.min(-90, F - 60), revealY + 40, eio(bp)) : Math.min(-90, F - 60);
      const shake = boom ? (hash(Math.floor(t / 30)) - 0.5) * 40 * (1 - seg(t, 5600, 6400)) : 0;
      for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(255,255,255,${0.2 + 0.5 * hash(i, 3)})`; c.beginPath(); c.arc((hash(i) - 0.5) * 2 * vw, (hash(i, 1) - 0.5) * 2 * vh, 2.5, 0, TAU); c.fill(); }
      c.save(); c.translate(shake, -camY + shake * 0.5);
      // rails + rungs (charred below the fire)
      const bottom = 420;
      for (const sx of [-1, 1]) { c.lineWidth = 26; c.lineCap = 'butt'; c.strokeStyle = '#8a5a2b'; c.beginPath(); c.moveTo(sx * 190, L.top + 30); c.lineTo(sx * 190, Math.min(bottom, F)); c.stroke(); if (F < bottom) { c.strokeStyle = '#1c120c'; c.beginPath(); c.moveTo(sx * 190, F); c.lineTo(sx * 190, bottom); c.stroke(); } }
      for (const r of L.rungs) { c.strokeStyle = r.y > F ? '#1c120c' : '#a06a34'; c.lineWidth = 20; c.beginPath(); c.moveTo(-190, r.y); c.lineTo(190, r.y); c.stroke(); }
      rr(c, -250, L.top - 6, 500, 36, 12); c.fillStyle = '#c9972a'; c.fill();
      // name plates
      const plate = (name, x, y, rot, burnt, glow) => {
        c.save(); c.translate(x, y); c.rotate(rot);
        rr(c, -165, -44, 330, 88, 18); c.fillStyle = burnt ? '#2a1a12' : '#fff6dc'; c.fill(); c.lineWidth = 7; c.strokeStyle = glow ? '#ffd23f' : burnt ? '#ff6a00' : '#6a431d'; c.stroke();
        label(c, name, 0, 3, { size: 50, font: FU, fill: burnt ? '#ff9a3c' : '#3a2410', w: 290 });
        c.restore();
      };
      let kidY = null;
      L.rungs.forEach((r, i) => {
        if (!r.name) return;
        if (r.me) { const riding = t >= r.hit; kidY = riding ? Math.min(r.y, F - 20) : r.y; if (!boom) plate('? ? ?', riding ? Math.sin(t * 0.03) * 10 : 0, kidY - 46, riding ? Math.sin(t * 0.02) * 0.08 : 0, false, true); return; }
        if (t < r.hit) return plate(r.name, 0, r.y - 46, 0, false, false);
        const dt = t - r.hit; if (dt > 2600) return;
        plate(r.name, r.dir * dt * (0.42 + hash(i) * 0.25), r.y - 46 - dt * 0.34 + dt * dt * 0.0011, r.dir * dt * 0.007, true, false);
      });
      // the fire
      c.save(); c.globalCompositeOperation = 'lighter';
      if (t > 500) for (let j = 0; j < 170; j++) {
        const ph = (t * (0.0012 + hash(j, 4) * 0.0012) + hash(j)) % 1;
        const baseY = F + hash(j, 1) * hash(j, 1) * 900; if (baseY > bottom + 60) continue;
        const yy = baseY - ph * 260, x = (hash(j, 2) - 0.5) * 420 * (1 - ph * 0.6) + Math.sin(t * 0.006 + j) * 14;
        if (Math.abs(yy - camY) > vh + 120) continue;
        const r = (1 - ph) * (26 + hash(j, 3) * 36) * seg(t, 500, 1100);
        c.fillStyle = ph < 0.25 ? `rgba(255,240,150,${0.5 * (1 - ph)})` : ph < 0.6 ? `rgba(255,140,20,${0.42 * (1 - ph)})` : `rgba(210,40,0,${0.34 * (1 - ph)})`;
        c.beginPath(); c.arc(x, yy, r, 0, TAU); c.fill();
      }
      for (let j = 0; j < 40; j++) { const ph = (t * 0.0006 * (1 + hash(j, 6)) + hash(j, 5)) % 1; c.fillStyle = `rgba(255,${160 + hash(j, 7) * 80},60,${1 - ph})`; c.beginPath(); c.arc((hash(j, 8) - 0.5) * 700 + Math.sin(ph * 9 + j) * 40, F + 200 - ph * 1000, 4, 0, TAU); c.fill(); }
      c.restore();
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
        c.scale(sc, sc);
        const g = c.createLinearGradient(0, -80, 0, 90); g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#fff27a'); g.addColorStop(0.65, '#ff9a1a'); g.addColorStop(1, '#e02a00');
        c.shadowColor = '#ff6a00'; c.shadowBlur = 50;
        label(c, d.name, 0, 0, { size, font: FD, fill: '#5a0d00', stroke: '#5a0d00', lw: 30, w: maxW, weight: '400' });
        c.shadowBlur = 0;
        label(c, d.name, 0, 0, { size, font: FD, fill: g, stroke: '#7a1500', lw: 8, w: maxW, weight: '400' });
        sweep(c, d.name, 0, 0, size, FD, maxW, ((t - 6400) % 1900) / 1000, '400');
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
    const dpr = Math.min(window.devicePixelRatio || 1, 2), r = cv.getBoundingClientRect();
    const W = Math.max(1, r.width), H = Math.max(1, r.height);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Design space is ~1000 units on the short side; on wide screens leave room for the title and controls.
    // The origin sits a little above centre, and vh is the taller half, so fills always cover the screen.
    const u = Math.min(W / 1000, H / 1240);
    return { c, W, H, u, vw: W / u / 2, vh: H / u * 0.53 };
  }
  let NOISE = null;
  function sound(ac) {
    if (!ac) { const no = () => {}; return { tone: no, noise: no, stop: no }; }
    const out = ac.createGain(); out.gain.value = 0.9; out.connect(ac.destination);
    if (!NOISE || NOISE.sampleRate !== ac.sampleRate) { NOISE = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const dd = NOISE.getChannelData(0); for (let i = 0; i < dd.length; i++) dd[i] = Math.random() * 2 - 1; }
    return {
      tone(f, at, dur, type = 'sine', vol = 0.1, f2) { try { const o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime + at; o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t0 + dur); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.connect(g).connect(out); o.start(t0); o.stop(t0 + dur + 0.05); } catch (e) {} },
      noise(at, dur, vol = 0.1, freq = 1000, type = 'bandpass') { try { const n = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), t0 = ac.currentTime + at; n.buffer = NOISE; n.loop = true; f.type = type; f.frequency.value = freq; g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); n.connect(f).connect(g).connect(out); n.start(t0, Math.random()); n.stop(t0 + dur + 0.05); } catch (e) {} },
      stop() { try { out.gain.setValueAtTime(0, ac.currentTime); out.disconnect(); } catch (e) {} },
    };
  }

  // Draw one still frame (used for reduced motion and for tests).
  function frame(cv, key, data, t) { SCENES[key].draw(stage(cv), t, data); }

  // Play a scene. opts: { canvas, key, data, offset, audio: () => AudioContext|null, onReveal, onEnd, still }
  function play(opts) {
    const sc = SCENES[opts.key], data = opts.data;
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

  return { SCENES, DUR, play, frame, ORDER: ['gambler', 'nerd', 'luckiest', 'unluckiest', 'comeback', 'champion'] };
})();
