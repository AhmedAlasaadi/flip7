'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const awardStudio = fs.readFileSync(path.join(__dirname, '../public/award-studio.js'), 'utf8');
const keys = ['gambler', 'nerd', 'luckiest', 'unluckiest', 'comeback', 'champion'];
const images = [];
class MockImage {
  constructor() { this.complete = true; this.naturalWidth = 900; }
  set src(src) {
    assert.match(src, /^data:image\/svg\+xml;charset=utf-8,/);
    const svg = decodeURIComponent(src.slice(src.indexOf(',') + 1));
    assert.match(svg, /^<svg\s/);
    assert.match(svg, /<\/svg>$/);
    images.push(svg);
  }
}
let originalFallbacks = 0;
const scenes = Object.fromEntries(keys.map(key => [key, {
  draw() { originalFallbacks++; }
}]));
const errors = [];
const sandbox = { window: { Awards: { SCENES: scenes } }, Image: MockImage,
  console: { error(...a) { errors.push(a.join(' ')); } }, Intl, Math };
vm.runInNewContext(awardStudio, sandbox, { filename: 'award-studio.js', timeout: 5000 });
assert.equal(images.length, 8);
assert.deepEqual(Object.keys(sandbox.window.AwardStudio.painters).sort(), keys.slice().sort());
const noop = () => {};
const ctx = new Proxy({
  canvas: { width: 1080, height: 1440 },
  save: noop, restore: noop, clearRect: noop, setTransform: noop,
  createLinearGradient() { return { addColorStop: noop }; },
  createRadialGradient() { return { addColorStop: noop }; },
  measureText(str) { return { width: String(str).length * 44 }; }
}, {
  get(obj, key) { if (key in obj) return obj[key]; return noop; },
  set(obj, key, value) { obj[key] = value; return true; }
});
const player = { name: 'SUPA AHMED',
  ladder: [{ name: 'MOHAMMED', me: false }, { name: 'SULTAN', me: false },
    { name: 'FERAS', me: false }, { name: 'SUPA AHMED', me: true }] };
for (const key of keys) {
  for (const t of [0, 200, 650, 1400, 2600, 4000, 5300, 6200, 8000]) {
    const stage = { c: ctx, W: 1080, H: 1440, u: 1, vw: 540, vh: 720 };
    scenes[key].draw(stage, t, player);
  }
}
assert.deepEqual(errors, [], 'Each scene should complete without runtime errors');
assert.equal(originalFallbacks, 0, 'All prepared SVGs should use the new studio');
// Verify that delayed image loading falls back instead of drawing empty frames.
sandbox.window.AwardStudio.images.gambler.naturalWidth = 0;
scenes.gambler.draw({ c: ctx, W: 1080, H: 1440, u: 1 }, 250, player);
assert.equal(originalFallbacks, 1);
console.log('  ok six illustrated award reveals, nine timeline checkpoints each, SVG assets, and loading fallback');
