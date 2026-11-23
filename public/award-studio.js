/* Flip 7 — Award Studio
   Bespoke illustrated scenes. Keeps the original server timing, audio cues,
   accessibility, and replay interface; replaces only canvas scene artwork.
   No dependency, no network assets, nothing changed in the game engine. */
(function () {
  'use strict';
  if (!window.Awards || !window.Awards.SCENES) return;

  const SCENES = window.Awards.SCENES;
  const TWO_PI = Math.PI * 2;
  const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
  const phase = (t, a, b) => clamp((t - a) / (b - a));
  const ease = x => 1 - Math.pow(1 - x, 3);
  const smooth = x => x * x * (3 - 2 * x);
  const spring = x => 1 + 2.1 * Math.pow(x - 1, 3) + 1.1 * Math.pow(x - 1, 2);
  const mix = (a, b, x) => a + (b - a) * x;
  const rand = (n, seed = 0) => { const x = Math.sin(n * 127.1 + seed * 313.7) * 43758.5453; return x - Math.floor(x); };
  const glyphs = s => { try { return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].map(a => a.segment); } catch (_) { return Array.from(s); } };
  const palettes = {
    gambler: ['#080613','#1b0c23','#4b0d2c','#ffc56c','#fff0bc'],
    nerd: ['#081126','#142349','#26457b','#b9eeff','#f3feff'],
    luckiest: ['#041a14','#073b2c','#0c7753','#74f0b5','#d9ffe6'],
    unluckiest: ['#090b1c','#171c32','#332c49','#a9adcb','#e3e9fa'],
    champion: ['#0e0925','#311038','#672548','#ffd47a','#fff1ba'],
    comeback: ['#090d1b','#1a2036','#543044','#ff9b55','#fff1cc']
  };
  const svgStart = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">';
  const defs = '<defs>'+
    '<linearGradient id="gold" x2=".9" y2="1"><stop stop-color="#fff5b5"/><stop offset=".24" stop-color="#ffcc53"/><stop offset=".51" stop-color="#9d581e"/><stop offset=".75" stop-color="#f0b54b"/><stop offset="1" stop-color="#6b381d"/></linearGradient>'+
    '<linearGradient id="red" x2=".8" y2="1"><stop stop-color="#ff8892"/><stop offset=".28" stop-color="#a6294a"/><stop offset=".7" stop-color="#58102f"/><stop offset="1" stop-color="#240a21"/></linearGradient>'+
    '<linearGradient id="wood" x2=".85" y2="1"><stop stop-color="#d99452"/><stop offset=".22" stop-color="#94572e"/><stop offset=".65" stop-color="#572f20"/><stop offset="1" stop-color="#2b1817"/></linearGradient>'+
    '<linearGradient id="mint" x2=".9" y2="1"><stop stop-color="#d5ffe7"/><stop offset=".3" stop-color="#51d99c"/><stop offset=".65" stop-color="#168b62"/><stop offset="1" stop-color="#06523b"/></linearGradient>'+
    '<linearGradient id="violet" x2="1" y2="1"><stop stop-color="#eecbff"/><stop offset=".5" stop-color="#7558ad"/><stop offset="1" stop-color="#251a57"/></linearGradient>'+
    '<radialGradient id="shine"><stop stop-color="#fff" stop-opacity=".9"/><stop offset=".2" stop-color="#ffe78b" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>'+
    '<filter id="shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="18" stdDeviation="15" flood-color="#000" flood-opacity=".56"/></filter>'+
    '<filter id="glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="8"/></filter>'+
    '<pattern id="woodgrain" width="80" height="70" patternUnits="userSpaceOnUse"><path d="M7 0 Q-8 24 12 52 M30 -8 Q47 25 24 80 M68 0 Q42 40 72 76" stroke="#29190d" stroke-opacity=".3" stroke-width="3" fill="none"/></pattern>'+
    '</defs>';
  const wrap = art => svgStart + defs + art + '</svg>';
  const coin = (x,y,r) => '<g transform="translate('+x+' '+y+')"><circle r="'+r+'" fill="url(#gold)" stroke="#633410" stroke-width="5"/><circle r="'+(r-8)+'" fill="none" stroke="#fff5ad" stroke-opacity=".6" stroke-width="3"/><path d="M-8 -10 Q0 -18 8 -10 Q-8 0 8 10 Q0 18 -8 10" stroke="#86431f" fill="none" stroke-width="5"/></g>';
  const gem = (x,y,s,color) => '<g transform="translate('+x+' '+y+')"><path d="M0 '+(-s)+' L'+s+' 0 0 '+s+' '+(-s)+' 0Z" fill="'+color+'" stroke="#ffe9ae" stroke-width="4"/><path d="M0 '+(-s)+' L0 '+s+' M'+(-s)+' 0L'+s+' 0" stroke="#fff" stroke-opacity=".6" stroke-width="2"/></g>';
  const ornaments = '<path d="M113 443 Q70 360 122 301 Q151 274 186 311 Q211 341 186 359 Q160 381 143 348 M787 443 Q830 360 778 301 Q749 274 714 311 Q689 341 714 359 Q740 381 757 348" fill="none" stroke="url(#gold)" stroke-width="11" stroke-linecap="round"/>'+
    '<path d="M125 435 Q100 395 151 370 M775 435 Q800 395 749 370" fill="none" stroke="#fff3b1" stroke-opacity=".5" stroke-width="4"/>';
  const illustrations = {
    gambler: wrap(
      '<g filter="url(#shadow)"><path d="M205 170 Q205 110 265 110 H635 Q695 110 695 170 L723 258 740 715 Q740 772 679 786 H221 Q160 772 160 715 L177 258Z" fill="url(#red)" stroke="url(#gold)" stroke-width="20"/>'+
      '<path d="M221 185 Q221 142 267 141 H631 Q677 141 677 185 L693 263 H207Z" fill="#2b0a24" stroke="#ffe9a4" stroke-width="8"/>'+
      '<path d="M243 180 Q450 135 657 180" fill="none" stroke="#ffcf77" stroke-opacity=".6" stroke-width="5"/>'+
      '<path d="M190 280 H710 V638 Q710 678 668 678 H232 Q190 678 190 638Z" fill="#210e23" stroke="#dd9d36" stroke-width="14"/>'+
      '<path d="M228 700 H670 L648 752 H252Z" fill="#571f32" stroke="#ffc15a" stroke-width="8"/>'+
      '<path d="M315 773 L278 849 H622 L585 773Z" fill="#250d23" stroke="url(#gold)" stroke-width="12"/>'+
      '<path d="M702 332 L783 277 Q816 258 821 296" fill="none" stroke="url(#gold)" stroke-width="22" stroke-linecap="round"/>'+
      '<circle cx="820" cy="280" r="31" fill="url(#red)" stroke="#ffe39b" stroke-width="10"/>'+
      '<path d="M218 195 H682 M215 684 H685 M264 732 H636" stroke="#ffe4a4" stroke-opacity=".55" stroke-width="4"/></g>'+
      '<path d="M207 392 V610 M693 392 V610" fill="none" stroke="#a34b3f" stroke-width="11"/>'+
      '<path d="M235 315 H665" stroke="#ffe9b3" stroke-width="6"/>'+ornaments+
      '<path d="M318 226 L342 202 366 226 342 250Z M534 226 L558 202 582 226 558 250Z" fill="url(#gold)"/>'+
      '<text x="450" y="245" text-anchor="middle" font-size="93" font-weight="900" fill="#ffefb5" stroke="#8c3e2d" stroke-width="3" paint-order="stroke">777</text>'+
      '<path d="M255 712 Q451 733 644 712" stroke="#ffd596" stroke-width="4" fill="none"/>'+
      coin(236,760,28)+coin(664,760,28)+gem(450,743,21,'#fa2958')+
      '<g fill="#ffe3a5">'+Array.from({length:24},(_,i)=>{let a=i*Math.PI/12;return '<circle cx="'+(450+260*Math.cos(a)).toFixed(1)+'" cy="'+(500+259*Math.sin(a)).toFixed(1)+'" r="5"/>';}).join('')+'</g>'
    ),
    nerd: wrap(
      '<g filter="url(#shadow)"><ellipse cx="455" cy="790" rx="310" ry="49" fill="#020d2a" opacity=".5"/>'+
      '<path d="M204 720 Q212 556 330 515 L570 517 Q691 561 704 720 L708 805 H193Z" fill="url(#violet)" stroke="#171845" stroke-width="14"/>'+
      '<path d="M343 534 L450 646 556 534 L615 798 H286Z" fill="#e9f4ff" stroke="#8eacdb" stroke-width="10"/>'+
      '<path d="M448 628 L407 694 450 776 492 694Z" fill="#4f90ca" stroke="#284a91" stroke-width="7"/>'+
      '<path d="M312 323 Q303 146 445 131 Q603 123 613 320 L592 477 Q559 572 449 589 Q330 574 310 472Z" fill="#efb833" stroke="#5b431f" stroke-width="13"/>'+
      '<path d="M319 300 Q291 149 396 125 Q420 55 521 113 Q615 88 632 218 Q655 274 603 340 L590 253 Q527 277 495 233 Q414 300 328 270Z" fill="#2e2440" stroke="#1a1832" stroke-width="13"/>'+
      '<path d="M341 285 Q389 240 441 264 M472 264 Q543 228 585 285" stroke="#4a3351" stroke-width="12" fill="none" stroke-linecap="round"/>'+
      '<ellipse cx="319" cy="410" rx="30" ry="48" fill="#e5a32b" stroke="#785023" stroke-width="8"/><ellipse cx="605" cy="408" rx="29" ry="48" fill="#e5a32b" stroke="#785023" stroke-width="8"/>'+
      '<path d="M427 448 Q451 464 479 447" fill="none" stroke="#a56a25" stroke-width="8" stroke-linecap="round"/>'+
      '<path d="M400 497 Q452 542 516 493" fill="none" stroke="#71392b" stroke-width="11" stroke-linecap="round"/>'+
      '<path d="M415 502 Q451 521 497 501" fill="none" stroke="#fff7d6" stroke-width="10" stroke-linecap="round"/>'+
      '<path d="M288 351 Q274 325 294 312 H430 Q453 317 453 345 L463 345 Q472 317 493 312 H618 Q640 330 622 389 Q615 461 550 463 H510 Q462 453 457 395 Q449 385 445 397 Q436 458 384 463 H348 Q289 458 288 396Z" fill="#c9f2ff" fill-opacity=".21" stroke="#151931" stroke-width="22"/>'+
      '<path d="M300 345 H437 M484 345 H620" stroke="#f1fcff" stroke-opacity=".86" stroke-width="9"/>'+
      '<ellipse cx="373" cy="392" rx="13" ry="19" fill="#1b263b"/><ellipse cx="550" cy="392" rx="13" ry="19" fill="#1b263b"/>'+
      '<circle cx="378" cy="383" r="5" fill="#fff"/><circle cx="555" cy="383" r="5" fill="#fff"/>'+
      '<path d="M665 580 Q707 545 712 491 L683 423 Q671 403 650 414 Q629 425 647 459 L660 485 Q636 461 617 480 Q606 494 623 512 L636 528 Q613 517 602 540 Q597 559 617 572 Q635 587 665 580Z" fill="#f5c444" stroke="#63432a" stroke-width="12"/>'+
      '<path d="M661 491 L612 428" stroke="#fbe1a7" stroke-width="13" stroke-linecap="round"/>'+
      '<path d="M209 730 H301 L319 795 H190Z" fill="#14365e" stroke="#7cb1d8" stroke-width="8"/>'+
      '<path d="M208 754 H298 M205 782 H309" stroke="#9ecbdf" stroke-width="5"/></g>'+
      gem(205,645,16,'#abdcfa')+gem(691,682,14,'#e7e3ff')
    ),
    luckiest: wrap(
      '<g filter="url(#shadow)"><circle cx="450" cy="440" r="302" fill="#0b4b3c" stroke="url(#gold)" stroke-width="17"/>'+
      '<circle cx="450" cy="440" r="275" fill="#06382e" stroke="#83e3a3" stroke-width="5"/>'+
      '<circle cx="450" cy="440" r="253" fill="none" stroke="url(#gold)" stroke-opacity=".52" stroke-width="4" stroke-dasharray="5 19"/>'+
      '<path d="M450 402 Q425 258 332 252 Q221 262 230 375 Q237 452 450 458 Q332 443 267 495 Q211 556 277 617 Q340 667 448 470 Q437 586 516 641 Q599 681 657 606 Q719 514 468 459 Q608 465 666 400 Q722 331 651 264 Q570 196 456 441Z" fill="url(#mint)" stroke="#d9ffa8" stroke-width="19" stroke-linejoin="round"/>'+
      '<path d="M444 436 Q329 324 287 338 M454 440 Q547 322 608 333 M453 466 Q545 578 600 586 M445 467 Q322 580 295 570" fill="none" stroke="#e8ffba" stroke-opacity=".67" stroke-width="10" stroke-linecap="round"/>'+
      '<path d="M450 459 Q466 635 431 740" fill="none" stroke="#84e39c" stroke-width="20" stroke-linecap="round"/>'+
      '<circle cx="450" cy="453" r="29" fill="url(#gold)" stroke="#fff8bc" stroke-width="8"/>'+
      '<path d="M203 285 Q95 193 174 134 Q249 105 295 204 M698 285 Q821 190 737 132 Q677 100 611 206" stroke="#2fab78" stroke-width="19" fill="none" stroke-linecap="round"/>'+
      '<path d="M224 713 Q121 778 207 836 Q307 853 338 757 M672 710 Q781 777 688 835 Q590 852 562 757" stroke="#2fab78" stroke-width="18" fill="none" stroke-linecap="round"/></g>'+
      Array.from({length:24},(_,i)=>{const a=i*Math.PI/12,r=i%2?346:360,x=450+Math.cos(a)*r,y=440+Math.sin(a)*r;return '<path d="M'+x.toFixed(1)+' '+(y-14).toFixed(1)+' q-20 12 0 32 q20 -20 0 -32" fill="'+(i%3?'#4ec78d':'#e6f8b2')+'" stroke="#125c42" stroke-width="3"/>';}).join('')+
      gem(450,91,28,'#baf4d7')+gem(450,793,23,'#d8ffa2')+
      '<path d="M350 838 Q450 875 550 838" stroke="url(#gold)" stroke-width="8" fill="none"/>'
    ),
    grave: wrap(
      '<g><circle cx="680" cy="174" r="118" fill="#f8e9b8" opacity=".1" filter="url(#glow)"/><circle cx="680" cy="174" r="89" fill="#b2b4d5"/>'+
      '<path d="M0 580 Q170 385 304 503 Q474 367 590 488 Q720 411 900 555 V900 H0Z" fill="#181b38"/>'+
      '<g fill="#3d405c" stroke="#85819b" stroke-width="7"><path d="M80 605 V425 Q130 368 175 430 V605Z"/><path d="M702 626 V385 Q765 323 825 385 V626Z"/></g>'+
      '<path d="M0 664 Q250 564 450 667 Q671 574 900 658 V900 H0Z" fill="#27243e"/>'+
      '<path d="M170 682 Q245 612 306 683 M629 672 Q703 608 785 675" fill="none" stroke="#62617a" stroke-width="12"/>'+
      '<path d="M95 539 H159 M128 508 V571 M743 514 H804 M774 480 V545" stroke="#c0bfd0" stroke-width="11" stroke-linecap="round"/></g>'+
      '<g filter="url(#shadow)"><path d="M270 610 L633 610 800 845 H110Z" fill="#090b18" stroke="#5f4c62" stroke-width="14"/>'+
      '<path d="M277 615 L623 615 713 820 H191Z" fill="#151226" stroke="#30243b" stroke-width="10"/></g>'+
      '<g fill="#97a8c2" opacity=".35"><circle cx="128" cy="300" r="5"/><circle cx="194" cy="177" r="3"/><circle cx="488" cy="123" r="4"/></g>'
    ),
    coffin: wrap(
      '<g filter="url(#shadow)"><path d="M450 170 L614 284 672 536 596 756 305 756 228 536 284 284Z" fill="url(#wood)" stroke="#140c17" stroke-width="26"/>'+
      '<path d="M450 209 L583 309 635 539 572 710 328 710 265 539 317 309Z" fill="url(#wood)" stroke="url(#gold)" stroke-width="11"/>'+
      '<path d="M450 224 L450 704 M319 315 L575 694 M577 316 L327 694" stroke="#2b1a1a" stroke-opacity=".3" stroke-width="8"/>'+
      '<path d="M355 354 Q450 307 544 354 L551 542 Q449 610 349 542Z" fill="#3b1f25" stroke="#ba8c59" stroke-width="8"/>'+
      '<path d="M355 379 Q450 350 544 379 M360 515 Q450 545 540 515" fill="none" stroke="#ffdca2" stroke-opacity=".34" stroke-width="4"/>'+
      '<path d="M438 267 H464 M438 661 H464" stroke="url(#gold)" stroke-width="12" stroke-linecap="round"/>'+
      '<circle cx="450" cy="451" r="35" fill="none" stroke="#e8ba74" stroke-width="5"/>'+
      '<path d="M450 417 V483 M417 450 H483" stroke="#e8ba74" stroke-width="6"/></g>'
    ),
    gravestone: wrap(
      '<g filter="url(#shadow)"><path d="M245 690 V324 Q245 149 450 138 Q655 149 655 324 V690Z" fill="#9e9baa" stroke="#423c52" stroke-width="22"/>'+
      '<path d="M278 654 V324 Q278 183 450 173 Q622 183 622 324 V654Z" fill="#5a5a73" stroke="#c7c6d2" stroke-width="8"/>'+
      '<path d="M317 304 Q450 223 583 304" stroke="#c7c6d2" stroke-opacity=".6" stroke-width="6" fill="none"/>'+
      '<path d="M450 220 V286 M420 255 H480" stroke="#dde0eb" stroke-width="14" stroke-linecap="round"/>'+
      '<path d="M218 681 Q450 710 682 681 L724 747 H175Z" fill="#74738b" stroke="#413d54" stroke-width="18"/></g>'
    ),
    champion: wrap(
      '<g filter="url(#shadow)"><path d="M220 180 L294 238 310 605 214 675 195 310Z M680 180 L606 238 590 605 686 675 705 310Z" fill="url(#gold)" stroke="#6b351f" stroke-width="14"/>'+
      '<path d="M195 214 L255 245 M705 214 L645 245" stroke="#fff2b0" stroke-width="9"/>'+
      '<path d="M285 219 Q278 92 365 122 L450 57 535 122 Q622 92 615 219 L622 613 H277Z" fill="url(#gold)" stroke="#5a2717" stroke-width="18"/>'+
      '<path d="M332 244 Q336 160 391 180 L450 142 509 180 Q564 160 568 244 V588 H332Z" fill="url(#red)" stroke="#fff0aa" stroke-width="12"/>'+
      '<path d="M340 300 Q450 270 560 300 M340 410 Q450 390 560 410" fill="none" stroke="#ffa6a1" stroke-opacity=".45" stroke-width="5"/>'+
      '<path d="M270 535 H630 V689 Q630 735 580 747 H320 Q270 735 270 689Z" fill="url(#gold)" stroke="#6b351f" stroke-width="18"/>'+
      '<path d="M305 534 Q450 482 595 534 L580 625 H320Z" fill="#8b2149" stroke="#ffc975" stroke-width="11"/>'+
      '<path d="M226 519 Q203 489 222 466 L318 457 Q337 475 325 501 L318 653 H219Z M674 519 Q697 489 678 466 L582 457 Q563 475 575 501 L582 653 H681Z" fill="url(#gold)" stroke="#64311c" stroke-width="14"/>'+
      '<path d="M290 707 L262 845 H337 L366 733 M610 707 L638 845 H563 L534 733" fill="url(#gold)" stroke="#6b351f" stroke-width="13"/>'+
      '<path d="M320 785 H580" stroke="#ffefaa" stroke-width="9"/>'+
      Array.from({length:11},(_,i)=>{const a=i*Math.PI/5.5,r=160,x=450+r*Math.cos(a),y=280+r*Math.sin(a);return gem(x.toFixed(1),y.toFixed(1),i%3?12:18,['#ed4d71','#69e6f1','#a79cff'][i%3]);}).join('')+
      gem(450,100,28,'#fb547a')+gem(296,215,18,'#69e6f1')+gem(604,215,18,'#69e6f1')+
      '<path d="M335 170 Q450 80 565 170" stroke="#fff5b1" stroke-width="8" fill="none"/></g>'+
      '<g stroke="#1c1422" stroke-linecap="round" stroke-width="17" fill="none"><circle cx="450" cy="363" r="35" fill="#1b1727"/><path d="M450 400 L450 541 M450 442 L385 496 M450 442 L515 496 M450 540 L402 595 M450 540 L498 595"/></g>'+
      '<path d="M420 318 L434 277 449 300 465 275 480 318Z" fill="url(#gold)" stroke="#6d421d" stroke-width="7"/>'
    ),
    comeback: wrap(
      '<g><path d="M0 790 L195 485 280 540 401 220 530 502 665 360 900 730 V900 H0Z" fill="#20223d"/>'+
      '<path d="M0 820 L200 650 339 730 507 500 642 710 900 570 V900 H0Z" fill="#302741"/>'+
      '<path d="M0 900 L155 719 255 761 381 625 531 808 750 705 900 843 V900Z" fill="#463044"/>'+
      '<path d="M330 852 L357 67 399 67 418 852 M569 852 L543 67 501 67 482 852" fill="url(#wood)" stroke="#221319" stroke-width="13"/>'+
      '<path d="M357 67 L420 852 M543 67 L480 852" stroke="#1d0e0c" stroke-opacity=".25" stroke-width="12"/>'+
      Array.from({length:9},(_,i)=>{let y=140+i*74;return '<g><path d="M'+(359+i*3)+' '+y+' H'+(541-i*3)+' V'+(y+26)+' H'+(359+i*3)+'Z" fill="url(#wood)" stroke="#1f1519" stroke-width="9"/><path d="M'+(371+i*3)+' '+(y+9)+' H'+(529-i*3)+'" stroke="#f1aa67" stroke-opacity=".45" stroke-width="3"/><circle cx="'+(378+i*3)+'" cy="'+(y+13)+'" r="5" fill="#d3bd8a"/><circle cx="'+(522-i*3)+'" cy="'+(y+13)+'" r="5" fill="#d3bd8a"/></g>';}).join('')+
      '<path d="M353 75 Q450 -13 547 75" fill="none" stroke="#e9aa70" stroke-width="10"/></g>'
    )
  };
  const images = {};
  Object.keys(illustrations).forEach(k => {
    const im = new Image();
    images[k] = im;
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(illustrations[k]);
  });

  function text(c, str, x, y, opt = {}) {
    c.save(); c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    const font = opt.font || '"Bangers","Fredoka",sans-serif';
    let size = opt.size || 90, max = opt.width || 790;
    c.font = (opt.weight || '900') + ' ' + size + 'px ' + font;
    const measured = c.measureText(str).width;
    if (measured > max) size *= max / measured;
    c.font = (opt.weight || '900') + ' ' + size + 'px ' + font;
    if (opt.shadow) { c.shadowColor = opt.shadow; c.shadowBlur = 25; }
    if (opt.stroke) { c.lineWidth = opt.line || 10; c.strokeStyle = opt.stroke; c.strokeText(str, x, y); }
    if (opt.gradient) { const g = c.createLinearGradient(0, y - size*.65, 0, y + size*.65); opt.gradient.forEach((v,i)=>g.addColorStop(i/(opt.gradient.length-1),v)); c.fillStyle=g; }
    else c.fillStyle = opt.fill || '#fff';
    c.fillText(str,x,y); c.restore();
  }
  function asset(c, key, x, y, w, h, alpha = 1) {
    const im = images[key]; if (!im || !im.complete || !im.naturalWidth) return;
    c.save(); c.globalAlpha = alpha; c.drawImage(im, x, y, w, h); c.restore();
  }
  function stage(s,key,t) {
    const c = s.c, W = s.W, H = s.H, p = palettes[key];
    c.save(); c.setTransform(1,0,0,1,0,0); c.clearRect(0,0,c.canvas.width,c.canvas.height); c.restore();
    const b = c.createLinearGradient(0,0,W,H); b.addColorStop(0,p[0]); b.addColorStop(.53,p[1]); b.addColorStop(1,p[2]); c.fillStyle=b; c.fillRect(0,0,W,H);
    const cx = W*.5, cy = H*.48;
    let haze = c.createRadialGradient(cx,cy,0,cx,cy,H*.85); haze.addColorStop(0,p[3]+'33'); haze.addColorStop(1,p[0]+'00'); c.fillStyle=haze; c.fillRect(0,0,W,H);
    c.save(); c.translate(W*.5,H*.5); const u=s.u; c.scale(u,u);
    // Deep theater curtains, atmospheric architecture, floating dust.
    c.globalAlpha=.17; c.strokeStyle=p[3]; c.lineWidth=4;
    for(let i=0;i<8;i++){let x=(i-3.5)*180;c.beginPath();c.moveTo(x,-1000);c.bezierCurveTo(x+70,-650,x-100,-260,x+42,700);c.stroke();}
    c.globalAlpha=1;
    for(let i=0;i<100;i++){let x=(rand(i)-.5)*1900, y=(rand(i,2)-.5)*1500, r=1+3*rand(i,4);
      c.fillStyle=i%4===0?p[4]:'#ffffff'; c.globalAlpha=.07 + .17*(.5+.5*Math.sin(t*.0007+i)); c.beginPath(); c.arc(x,y,r,0,TWO_PI);c.fill();}
    c.globalAlpha=1;
    return c;
  }
  function finish(c,s,key,t) {
    const p=palettes[key];c.restore();
    // Engraved widescreen framing, vignette, film grain and restrained lens bloom.
    const W=s.W,H=s.H;
    let v=c.createRadialGradient(W*.5,H*.48,H*.19,W*.5,H*.48,Math.max(W,H)*.72); v.addColorStop(0,'#00000000');v.addColorStop(1,'#02020ecc');c.fillStyle=v;c.fillRect(0,0,W,H);
    const flick= .25+.12*Math.sin(t*.004);
    c.fillStyle=p[3];c.globalAlpha=flick;
    c.fillRect(0,0,W,3);c.fillRect(0,H-3,W,3);c.globalAlpha=1;
    // Corner flourishes stay quiet behind HUD elements.
    c.strokeStyle=p[3];c.globalAlpha=.45;c.lineWidth=2;
    for(let side of [-1,1]){c.save();c.translate(side===1?W-25:25,55);c.scale(side,1);c.beginPath();c.moveTo(0,50);c.lineTo(0,0);c.lineTo(50,0);c.stroke();c.restore();}
    c.globalAlpha=1;
  }
  function shine(c,x,y,t,p,size) {
    if(p<=0||p>=1)return;
    c.save(); c.translate(x,y);c.rotate(-.3);
    const xx=mix(-size,size,p),g=c.createLinearGradient(xx-70,0,xx+70,0);
    g.addColorStop(0,'#fff0');g.addColorStop(.45,'#fff2');g.addColorStop(.5,'#ffff');g.addColorStop(.55,'#fff5');g.addColorStop(1,'#fff0');
    c.fillStyle=g;c.globalCompositeOperation='screen';c.fillRect(-size,-70,size*2,140);c.restore();
  }
  function glitters(c,t,n,range,col) {
    c.save();c.globalCompositeOperation='screen';
    for(let i=0;i<n;i++){let a=rand(i,4)*TWO_PI, r=range*Math.sqrt(rand(i,5));let x=Math.cos(a)*r,y=Math.sin(a)*r*.7+30;
      let q=.35+.65*Math.sin(t*.004+i*2.7),sz=(4+9*rand(i,7))*q;c.strokeStyle=col;c.globalAlpha=q*.7;c.lineWidth=2;
      c.beginPath();c.moveTo(x-sz,y);c.lineTo(x+sz,y);c.moveTo(x,y-sz);c.lineTo(x,y+sz);c.stroke();}
    c.restore();
  }
  function name(c,d,y,progress,key,opts={}) {
    if(progress<=0)return;
    const p=palettes[key], appear=spring(phase(progress,0,1));
    c.save();c.translate(0,y+(1-appear)*45);c.scale(1,clamp(appear,0,1.12));
    c.globalAlpha=clamp(progress*3);
    text(c,d.name,0,0,{size:opts.size||100,width:opts.width||780,stroke:p[0],line:14,gradient:opts.gradient||[p[4],p[3],p[2]],shadow:p[3]});
    if(progress>.4)shine(c,0,0,0,phase(progress,.4,1),380);
    c.restore();
  }
  function gambler(s,t,d){
    const c=stage(s,'gambler',t), enter=ease(phase(t,0,950)), jack=phase(t,5200,6100);
    c.save(); c.translate(0,mix(540,-34,enter)); const z=1+.045*Math.sin(t*.0017);
    c.scale(z,z);asset(c,'gambler',-450,-470,900,900);
    // Reels are glass, brass-rimmed, and actually roll to each grapheme.
    const letters=glyphs(d.name).slice(0,18), rows=letters.length>10?2:1, per=Math.ceil(letters.length/rows), cw=Math.min(77,520/per);
    c.save();c.beginPath();c.roundRect(-307,-76,614,224,17);c.clip();c.fillStyle='#100b1b';c.fillRect(-307,-76,614,224);
    letters.forEach((v,i)=>{let row=Math.floor(i/per), cols=row===rows-1?letters.length-(rows-1)*per:per;
      let j=i%per; let x=(j-(cols-1)/2)*cw,y=rows===1?32:row*99-20;
      let stop=1150+(i+1)*3900/letters.length,q=phase(t,stop-460,stop),roll=(1-q)*(1-q);
      c.save();c.beginPath();c.roundRect(x-cw*.44,y-46,cw*.88,93,6);c.clip();
      let rg=c.createLinearGradient(0,y-45,0,y+46);rg.addColorStop(0,'#cab78e');rg.addColorStop(.5,'#fffce7');rg.addColorStop(1,'#c4b9a1');c.fillStyle=rg;c.fillRect(x-cw*.44,y-46,cw*.88,93);
      for(let k=-1;k<=1;k++){c.save();c.globalAlpha=k===0?1:.4;text(c,k===0?v:'7',x,y+k*95+roll*95,{size:Math.min(73,cw*.8),width:cw*.8,font:'"Fredoka",sans-serif',stroke:'#f4ead5',line:3,fill:'#7b2441'});c.restore();}
      c.restore();
      c.strokeStyle='#ffd98c';c.lineWidth=4;c.strokeRect(x-cw*.44,y-46,cw*.88,93);
    });c.restore();
    // Big jackpot only after the letters settle.
    if(jack>0){glitters(c,t,42,440,'#ffdb75');for(let i=0;i<19;i++){let px=(rand(i)-.5)*880,py=((t*.24+i*93)%650)-350;
      c.save();c.translate(px,py);c.rotate(t*.002+i);c.fillStyle=i%3?'#fbc96b':'#fff2b5';c.fillRect(-8,-11,16,22);c.restore();}
      text(c,'J A C K P O T',0,-400,{size:80,width:680,stroke:'#671530',gradient:['#fff5bc','#ffd366','#9e461c'],shadow:'#ffc253'});}
    c.restore(); if(jack>.25)name(c,d,395,phase(t,5500,6300),'gambler',{size:89});
    finish(c,s,'gambler',t);
  }
  function nerd(s,t,d){
    const c=stage(s,'nerd',t), pop=spring(phase(t,0,850)), close=phase(t,1800,2800), settle=phase(t,3000,3900);
    c.save(); c.translate(0,20+35*(1-pop));let z=(.68+.32*pop)*(1+.16*smooth(close)-.13*smooth(settle));c.scale(z,z);
    asset(c,'nerd',-450,-470,900,900);
    // Animated specular reflection across BOTH lenses (masked to each lens).
    let glint=phase(t,2100,3100);
    if(glint>0&&glint<1){c.save();c.beginPath();c.ellipse(-82,-41,70,55,-.1,0,TWO_PI);c.ellipse(100,-41,70,55,.1,0,TWO_PI);c.clip();shine(c,0,-40,t,glint,260);c.restore();}
    if(t>3000){glitters(c,t,23,365,'#d5f3ff');}
    c.restore();
    const p=phase(t,3650,4550);name(c,d,388,p,'nerd',{gradient:['#fff','#c6edff','#6999d9']});
    if(p>.85)shine(c,0,386,t,phase(t,4700,5500),380);
    finish(c,s,'nerd',t);
  }
  function luckiest(s,t,d){
    const c=stage(s,'luckiest',t), plant=spring(phase(t,250,2100)), bloom=phase(t,2600,5400);
    c.save();c.translate(0,10);c.rotate((1-plant)*-.35);c.scale(Math.max(.01,plant)*(.85+.16*smooth(bloom)),Math.max(.01,plant)*(.85+.16*smooth(bloom)));
    asset(c,'luckiest',-450,-470,900,900);
    c.restore();
    // Unfurling ornamental vines drawn as smooth strokes (not geometric dots).
    for(let k=0;k<6;k++){let side=k%2?-1:1,dy=k<2?-35:k<4?90:190,progress=ease(phase(t,900+k*140,4100+k*110));
      if(!progress)continue;c.save();c.strokeStyle=k%2?'#a2ffba':'#3fcc81';c.lineWidth=8-k*.4;c.lineCap='round';c.beginPath();
      for(let n=0;n<=80*progress;n++){let u=n/80, a=u*Math.PI*2.8+k*.6,rx=260+75*u,ry=100+125*u;let x=side*(250+Math.cos(a)*rx*.55),y=dy+Math.sin(a)*ry;
        if(n===0)c.moveTo(x,y);else c.lineTo(x,y);}
      c.stroke();c.restore();}
    const rev=phase(t,4600,5550);
    name(c,d,360,rev,'luckiest',{size:105,gradient:['#f4ffe5','#8bffba','#278d68']});
    if(rev>.65){glitters(c,t,38,480,'#aaffc5');let g=c.createRadialGradient(0,10,0,0,10,340);g.addColorStop(0,'#d5ffbc24');g.addColorStop(1,'#d5ffbc00');c.fillStyle=g;c.fillRect(-440,-420,880,880);}
    finish(c,s,'luckiest',t);
  }
  function unluckiest(s,t,d){
    const c=stage(s,'unluckiest',t), descend=phase(t,0,1600), fill=phase(t,2950,5100), rise=phase(t,5150,6350);
    c.save();asset(c,'grave',-450,-470,900,900);
    c.save();c.translate(0,40+180*smooth(descend));c.scale(mix(.7,.57,descend),mix(.7,.57,descend));c.rotate(.035);
    asset(c,'coffin',-450,-470,900,900);
    if(t>1200&&fill<1)text(c,d.name,0,-10,{size:82,width:300,font:'"Fredoka",sans-serif',fill:'#e9be81',stroke:'#381b23',line:6});
    c.restore();
    // Earth rises as the coffin disappears; dust follows gravity.
    if(fill>0){c.save();c.beginPath();c.moveTo(-370,205);c.lineTo(365,205);c.lineTo(410,540);c.lineTo(-420,540);c.closePath();c.clip();
      const dirt=mix(525,180,smooth(fill));const earth=c.createLinearGradient(0,dirt,0,540);earth.addColorStop(0,'#8a5e4b');earth.addColorStop(.15,'#4c302e');earth.addColorStop(1,'#180f1d');c.fillStyle=earth;c.fillRect(-450,dirt,900,550);
      for(let i=0;i<90;i++){let x=(rand(i)-.5)*800,y=200+((t*.14+i*79)%440);if(y<dirt)continue;c.fillStyle=i%2?'#98765e':'#221824';c.beginPath();c.ellipse(x,y,4+rand(i,3)*8,3,0,0,TWO_PI);c.fill();}c.restore();}
    if(rise>0){c.save();c.translate(0,285-mix(0,380,ease(rise)));c.scale(.82,.82);asset(c,'gravestone',-450,-470,900,900);
      text(c,d.name,0,-10,{size:95,width:450,fill:'#e5ebfa',stroke:'#414154',line:7,font:'"Fredoka",sans-serif'});c.restore();}
    if(rise>.5)for(let i=0;i<22;i++){let x=(rand(i)-.5)*750,y=315+rand(i,4)*150,curl=Math.sin(t*.001+i)*10;c.fillStyle=i%2?'#a9adcb':'#746e87';c.globalAlpha=.4;c.beginPath();c.arc(x+curl,y,2+rand(i,7)*3,0,TWO_PI);c.fill();}
    c.globalAlpha=1;c.restore();
    finish(c,s,'unluckiest',t);
  }
  function champion(s,t,d){
    const c=stage(s,'champion',t), zoom=ease(phase(t,0,5200)), rev=phase(t,5100,5900);
    // A real camera move: background is slower than the hero, focus on the engraving.
    c.save();let z=mix(.73,1.18,zoom)*(1-.18*smooth(rev));c.translate(0,-28-85*zoom+78*rev);c.scale(z,z);
    asset(c,'champion',-450,-470,900,900);
    if(t>2600)for(let i=0;i<16;i++){let a=i*TWO_PI/16,x=Math.cos(a)*245,y=Math.sin(a)*200-130,q=phase(t,2650+i*130,3050+i*130);
      if(!q)continue; c.save();c.globalAlpha=q;c.fillStyle='#fff7b8';c.shadowColor='#ffe68a';c.shadowBlur=20;c.beginPath();c.arc(x,y,5+8*q,0,TWO_PI);c.fill();c.restore();}
    if(rev>0){glitters(c,t,54,490,'#ffe9a5');
      let g=c.createRadialGradient(0,-90,0,0,-90,470);g.addColorStop(0,'#ffd27b33');g.addColorStop(1,'#ffd27b00');c.fillStyle=g;c.fillRect(-500,-550,1000,1000);}
    c.restore();
    if(rev>0){name(c,d,385,rev,'champion',{size:112,gradient:['#fffbe0','#ffe29a','#c7782d']});
      if(rev>.6){c.save();c.globalAlpha=(rev-.6)*1.7;glitters(c,t,20,450,'#ffe7ac');c.restore();}}
    finish(c,s,'champion',t);
  }
  function comeback(s,t,d){
    const c=stage(s,'comeback',t), climb=phase(t,950,5500), boom=phase(t,5450,6320);
    const order=(d.ladder||[]).slice().reverse();
    const rising=-climb*700, n=Math.min(order.length,10);
    // The camera follows the fire, not the ladder.
    c.save();c.translate(0,climb*250-80);asset(c,'comeback',-450,-470,900,900);
    const positions=order.slice(0,n).map((pl,i)=>({pl, y:270-i*70}));
    for(let i=0;i<positions.length;i++){const item=positions[i],hit=phase(t,1250+i*(3400/Math.max(1,n)),1750+i*(3400/Math.max(1,n))),fall=smooth(hit);
      c.save();c.translate((i%2?-1:1)*fall*380,item.y+fall*250);c.rotate((i%2?-1:1)*fall*1.1);c.globalAlpha=1-.85*fall;
      c.fillStyle='#281e2a';c.strokeStyle='#ffb96a';c.lineWidth=5;c.beginPath();c.roundRect(-170,-27,340,54,8);c.fill();c.stroke();
      text(c,item.pl.name,0,2,{size:37,width:310,font:'"Fredoka",sans-serif',fill:item.pl.me?'#ffeeb1':'#fff4e1'});
      c.restore();}
    // Flame tongues form an upward travelling column with layered color and flow.
    const tip=300-700*climb;
    for(let l=0;l<3;l++){c.save();c.globalAlpha=(.33+l*.15)*(1-.2*boom);c.fillStyle=['#ff4d27','#ff9b27','#fff0ab'][l];
      for(let i=0;i<24;i++){const x=(rand(i,l)-.5)*(170-l*25),y=tip+rand(i,9+l)*340;let h=(38+rand(i,10)*80)*(1+climb);
        c.beginPath();c.moveTo(x-19,y+30);c.quadraticCurveTo(x-5,y-h*.1,x+Math.sin(t*.004+i)*20,y-h);c.quadraticCurveTo(x+42,y-h*.14,x+20,y+30);c.closePath();c.fill();}
      c.restore();}
    c.restore();
    if(boom>0){let flash=1-phase(t,5580,6020);if(flash>0){c.fillStyle='#ffe9b0';c.globalAlpha=flash*.68;c.fillRect(-s.vw,-s.vh,s.vw*2,s.vh*2);c.globalAlpha=1;}
      name(c,d,370,boom,'comeback',{size:100,gradient:['#fff5c6','#ffb653','#db4d24']});glitters(c,t,45,470,'#ffc16c');}
    finish(c,s,'comeback',t);
  }
  const painters = {gambler, nerd, luckiest, unluckiest, champion, comeback};
  for (const [key, fn] of Object.entries(painters)) {
    SCENES[key].draw = (stage, t, data) => {
      try { fn(stage, Math.max(0,t),data); }
      catch(err) { console.error('Award Studio illustration failed for '+key,err); }
    };
  }
  window.AwardStudio = { version: '1.0', images, painters };
})();
