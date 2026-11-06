// Model Lab, step 6. Ported from the approved design draft docs/design/HouseLabStep6.html:
// the markup, then mount(), which runs the step's interactive code once its markup is on the page.
import katex from 'katex';
import { LabBowl } from '../bowl.js';

export const html = `<div id="main" class="skel" aria-busy="true">
    <div class="skonly" aria-hidden="true">
      <section class="card"><div class="sk" style="width:90px;height:14px;margin-bottom:12px"></div><div class="sk" style="width:36%;height:30px;margin-bottom:12px"></div><div class="sk" style="width:70%;height:16px;margin-bottom:22px"></div>
        <div class="sk" style="height:64px;border-radius:14px;margin-bottom:16px"></div>
        <div class="two"><div class="sk" style="height:470px;border-radius:14px"></div><div class="sk" style="height:470px;border-radius:14px"></div></div></section>
    </div>
    <div class="live">
    <section class="card" aria-labelledby="st">
      <span class="tag">Step 6 of 14</span>
      <h2 id="st">Gradient descent</h2>
      <p class="goal">Take a small step downhill, recompute the slope, repeat. Drag the start on the bowl, choose a step size, and press Start: the line, the path and the cost all move together.</p>

      <div class="player" role="group" aria-label="Training controls">
        <div class="prow">
          <button id="play" class="play" type="button" aria-label="Start training"><svg id="playIcon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg></button>
          <button id="step" class="ibtn" type="button" title="One step" aria-label="One step"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l10 7-10 7zM17 5h3v14h-3z" fill="currentColor"/></svg><span>Step</span></button>
          <button id="reset" class="ibtn" type="button" title="Back to the start" aria-label="Reset: back to the start"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v5h5"/></svg><span>Reset</span></button>
          <div class="scrub"><input id="scrub" type="range" min="0" max="300" value="0" aria-label="Step in the training"><div class="slab"><span>step <b id="sk">0</b> of <b id="sn">300</b></span><span id="conv"></span></div></div>
        </div>
        <div class="prow opts">
          <div class="opt"><span>Learning rate α</span><div class="seg" role="group" aria-label="Learning rate"><button data-a="0.01" type="button">0.01</button><button data-a="0.1" type="button">0.1</button><button class="on" data-a="0.5" type="button">0.5</button><button data-a="1.05" type="button">1.05</button><button data-a="custom" type="button">Custom</button></div>
            <span class="custom hidden2"><input id="a" type="range" min="0" max="1" step="0.001" aria-label="Custom learning rate"><b id="av"></b></span></div>
          <div class="opt"><span>Steps</span><div class="seg iters" role="group" aria-label="Number of steps"><button data-n="100" type="button">100</button><button class="on" data-n="300" type="button">300</button><button data-n="1000" type="button">1,000</button></div></div>
          <span class="sandbox">Sandbox: the live model is not changed</span>
        </div>
      </div>

      <div class="two">
        <figure class="plot">
          <div class="phead"><b>The line, as it learns</b></div>
          <div class="pbox"><canvas id="dots" aria-hidden="true"></canvas><svg id="plot" viewBox="0 0 520 380" width="100%" role="img" aria-label="Training ads and the current line"></svg><div class="hud" aria-live="off"><span>step</span><b id="hS"></b><span>w</span><b id="hW"></b><span>b</span><b id="hB"></b><span>cost</span><b class="jv" id="hJ"></b></div></div>
          <figcaption class="note">Faint lines are where the line was a few steps ago.</figcaption>
        </figure>
        <figure class="plot">
            <div class="phead"><b>Down the bowl</b><div class="seg" role="group" aria-label="Bowl view"><button class="on" data-v="bowl" type="button">3D bowl</button><button data-v="map" type="button">Top view</button><button data-v="curve" type="button">Cost by w</button></div></div>
            <div class="pbox"><canvas id="heat" aria-hidden="true"></canvas><svg id="cost" viewBox="0 0 520 380" width="100%" role="img" aria-label="Top view of the cost bowl with the path of gradient descent"></svg></div>
            <figcaption class="note" id="pnote2"></figcaption>
          </figure>
      </div>
      <div class="wide"><figure class="plot">
            <div class="phead"><b>Cost after each step</b></div>
            <div class="pbox"><svg id="hist" viewBox="0 0 1060 190" width="100%" role="img" aria-label="Cost after each step"></svg></div>
          <figcaption class="note">Cost is on a log scale, so small changes near the bottom stay visible. The number at the tip is the current cost, and in brackets its change from the step before.</figcaption>
          </figure></div>

      <div class="meter" aria-live="polite">
        <div class="box"><h3>Where it stands</h3><p id="status" style="margin:0;font-size:15px;line-height:1.55"></p>
          <span class="hidden2" id="kIt"></span><span class="hidden2" id="kW"></span><span class="hidden2" id="kB"></span><span class="hidden2" id="kJ"></span></div>
        <div class="box"><h3>The last update</h3><div class="formula" id="f"></div></div>
      </div>
      <div class="chips" role="group" aria-label="Presets"><span class="try">Try:</span><button class="chip" data-p="good" type="button">A good step size</button><button class="chip" data-p="small" type="button">Too small</button><button class="chip" data-p="big" type="button">Too large</button></div>
      <p class="pnote" id="pnote"></p>
    </section>
    </div>
  </div>`;

export const mathHtml = `<div class="mrow" tabindex="0"><span id="m1"></span><p>Subtract the slope, because the slope points uphill. α sets how big each step is.</p></div>
        <div class="mrow" tabindex="0"><span id="m2"></span><p>Both slopes are computed from the old w and b before either changes (a simultaneous update). Near the bottom the slopes shrink, so the steps shrink too, even with the same α.</p></div>`;

export const skHtml = ``;

/** Runs the step. `ctx.load(name)` gives its data; the returned function stops everything it started. */
export function mount(ctx) {
  const { setTimeout, requestAnimationFrame, cancelAnimationFrame, win, dispose } = ctx.scope();

  const ns = 'http://www.w3.org/2000/svg',
    svg = document.getElementById('plot'),
    csv = document.getElementById('cost'),
    hsv = document.getElementById('hist'),
    cv = document.getElementById('dots'),
    hv = document.getElementById('heat');
  const L = 52,
    R = 505,
    T = 14,
    B = 330,
    XM = 3,
    YM = 80,
    YN = -20,
    WR = [-10, 60],
    BR = [-50, 40],
    CB = 330;
  const fx = (x) => L + (x / XM) * (R - L),
    fy = (y) => B - ((y - YN) / (YM - YN)) * (B - T);
  const gw = (v) => L + ((v - WR[0]) / (WR[1] - WR[0])) * (R - L),
    gb = (v) => CB - ((v - BR[0]) / (BR[1] - BR[0])) * (CB - T),
    igw = (X) => WR[0] + ((X - L) / (R - L)) * (WR[1] - WR[0]),
    igb = (Y) => BR[0] + ((CB - Y) / (CB - T)) * (BR[1] - BR[0]);
  const PRE = {
    good: [
      0.5,
      'A good step size: big enough to get there in a few hundred steps, small enough to stay steady. The path first drops into the valley, then slides along it to the bottom.',
    ],
    small: [
      0.01,
      'Too small: every step is tiny, so after hundreds of steps the line has barely moved and the cost is still high.',
    ],
    big: [
      1.05,
      'Too large: each step overshoots the bottom and lands higher on the other side, so the cost grows instead of falling and the run is stopped.',
    ],
  };
  let conv = -1,
    P = [],
    S = null,
    Jmin = 0,
    wBest = 0,
    bBest = 0,
    w0 = 0,
    b0 = 20,
    alpha = 0.5,
    N = 300,
    hist = [],
    k = 0,
    playing = false,
    timer = 0,
    drag = null,
    stopped = '';
  const clamp = (v, a, c) => Math.max(a, Math.min(c, v));
  function el(par, t, a, txt) {
    const e = document.createElementNS(ns, t);
    for (const kk in a) e.setAttribute(kk, a[kk]);
    if (txt !== undefined) e.textContent = txt;
    par.appendChild(e);
    return e;
  }
  function stats() {
    let n = 0,
      sx = 0,
      sy = 0,
      sxx = 0,
      sxy = 0,
      syy = 0;
    for (const [a, p] of P) {
      const x = a / 100;
      n++;
      sx += x;
      sy += p;
      sxx += x * x;
      sxy += x * p;
      syy += p * p;
    }
    S = { n, sx, sy, sxx, sxy, syy };
    wBest = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    bBest = (sy - wBest * sx) / n;
    Jmin = J(wBest, bBest);
  }
  const J = (w, b) =>
    (w * w * S.sxx + 2 * w * b * S.sx + S.n * b * b - 2 * w * S.sxy - 2 * b * S.sy + S.syy) / (2 * S.n);
  const dJw = (w, b) => (w * S.sxx + b * S.sx - S.sxy) / S.n,
    dJb = (w, b) => (w * S.sx + S.n * b - S.sy) / S.n;
  // alpha slider is log scale 0.001..1.2
  const a2s = (a) => Math.log10(a / 0.001) / Math.log10(1200),
    s2a = (s) => +(0.001 * Math.pow(1200, s)).toPrecision(2);
  function run() {
    hist = [{ w: w0, b: b0, J: J(w0, b0) }];
    stopped = '';
    conv = -1;
    let w = w0,
      b = b0;
    for (let i = 0; i < N; i++) {
      const gw_ = dJw(w, b),
        gb_ = dJb(w, b);
      const nw = w - alpha * gw_,
        nb = b - alpha * gb_;
      const j = J(nw, nb);
      if (!isFinite(j) || j > 1e7) {
        stopped = 'Stopped after ' + (i + 1) + ' steps: the cost was growing without limit.';
        break;
      }
      hist.push({ w: nw, b: nb, J: j, gw: gw_, gb: gb_, pw: w, pb: b });
      if (conv < 0 && i > 2 && Math.abs(hist[i].J - j) / j < 0.001) conv = i + 1;
      w = nw;
      b = nb;
    }
    const sc = document.getElementById('scrub');
    sc.max = hist.length - 1;
    document.getElementById('sn').textContent = (hist.length - 1).toLocaleString('en-US');
  }
  function fit(canvas, svgEl, H) {
    const r = svgEl.getBoundingClientRect(),
      dpr = window.devicePixelRatio || 1,
      s = r.width / 520;
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    const c = canvas.getContext('2d');
    c.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
    c.clearRect(0, 0, 520, H);
    return c;
  }
  function paintDots() {
    const c = fit(cv, svg, 380);
    c.fillStyle = getComputedStyle(document.getElementById('main')).getPropertyValue('--ac').trim();
    c.globalAlpha = 0.06;
    for (const [a, p] of P) {
      const x = a / 100;
      if (x > XM || p > YM) continue;
      c.beginPath();
      c.arc(fx(x), fy(p), 1.9, 0, 6.283);
      c.fill();
    }
  }
  function paintHeat() {
    const c = fit(hv, csv, 380);
    const dark = document.documentElement.dataset.theme === 'dark',
      NX = 160,
      NY = 90,
      lo = Math.log(Jmin),
      hi = Math.log(J(WR[0], BR[1]) + J(WR[1], BR[1]));
    const off = document.createElement('canvas');
    off.width = NX;
    off.height = NY;
    const o = off.getContext('2d'),
      img = o.createImageData(NX, NY);
    const col = dark ? [95, 216, 171] : [20, 122, 85];
    for (let j = 0; j < NY; j++)
      for (let i = 0; i < NX; i++) {
        const wv = WR[0] + ((i + 0.5) / NX) * (WR[1] - WR[0]),
          bv = BR[1] - ((j + 0.5) / NY) * (BR[1] - BR[0]);
        const tt = Math.min(1, Math.max(0, (Math.log(J(wv, bv)) - lo) / (hi - lo)));
        const g = Math.pow(1 - tt, 1.6);
        const q = (j * NX + i) * 4;
        img.data[q] = col[0];
        img.data[q + 1] = col[1];
        img.data[q + 2] = col[2];
        img.data[q + 3] = Math.round(255 * (dark ? 0.05 + 0.85 * g : 0.04 + 0.8 * g));
      }
    o.putImageData(img, 0, 0);
    c.drawImage(off, L, T, R - L, CB - T);
  }
  function pt(s, e) {
    const p = s.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(s.getScreenCTM().inverse());
  }
  function drawLine() {
    svg.innerHTML = '';
    [-20, 0, 20, 40, 60, 80].forEach((v) => {
      el(svg, 'line', { x1: L, x2: R, y1: fy(v), y2: fy(v), stroke: v === 0 ? 'var(--mut)' : 'var(--rule)' });
      el(svg, 'text', { x: L - 8, y: fy(v) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--mut)' }, v);
    });
    [0, 50, 100, 150, 200, 250, 300].forEach((v) =>
      el(svg, 'text', { x: fx(v / 100), y: B + 18, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--mut)' }, v),
    );
    el(
      svg,
      'text',
      { x: (L + R) / 2, y: B + 40, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--mut)' },
      'Area (m²)',
    );
    el(
      svg,
      'text',
      {
        x: 14,
        y: (T + B) / 2,
        'text-anchor': 'middle',
        'font-size': 13,
        fill: 'var(--mut)',
        transform: 'rotate(-90 14 ' + (T + B) / 2 + ')',
      },
      'Asking price (billion toman)',
    );
    const cp = el(svg, 'clipPath', { id: 'clp' });
    el(cp, 'rect', { x: L, y: T, width: R - L, height: B - T });
    for (let g = 1; g <= 4; g++) {
      const s = hist[Math.max(0, k - g * Math.max(1, Math.round(k / 12)))];
      if (!s || k === 0) break;
      el(svg, 'line', {
        x1: fx(0),
        y1: fy(s.b),
        x2: fx(XM),
        y2: fy(s.w * XM + s.b),
        stroke: 'var(--line)',
        'stroke-width': 1.5,
        opacity: 0.12 + 0.04 * (4 - g),
        'clip-path': 'url(#clp)',
      });
    }
    const s = hist[k];
    el(svg, 'line', {
      x1: fx(0),
      y1: fy(s.b),
      x2: fx(XM),
      y2: fy(s.w * XM + s.b),
      stroke: 'var(--line)',
      'stroke-width': 3,
      'stroke-linecap': 'round',
      'clip-path': 'url(#clp)',
    });
  }
  let pview = 'bowl',
    yaw = -0.75,
    pitch = 0.62,
    B3 = null,
    d3 = null;
  const PNOTES = {
    bowl: 'The path in 3D, running down the surface of the bowl. Drag the hollow start dot to choose where to begin; drag anywhere else to turn the bowl. Each small dot is one step.',
    map: 'The same path seen from above: each small dot is one step, the cross is the bottom. Drag the hollow dot to choose where to start.',
    curve:
      'A slice through the bowl at the current b, with the current w on it. As b changes during training, the slice changes with it.',
  };
  function drawPath() {
    document.getElementById('pnote2').textContent = PNOTES[pview];
    if (pview === 'bowl') {
      csv.innerHTML = '';
      const r = el(csv, 'rect', { x: 0, y: 0, width: 520, height: 380, fill: 'transparent', style: 'cursor:move' });
      const s = hist[k];
      B3 = LabBowl.draw(hv, csv, {
        J,
        WR,
        BR,
        Jmin,
        wBest,
        bBest,
        yaw,
        pitch,
        w: s.w,
        b: s.b,
        path: hist.slice(0, k + 1),
        start: { w: w0, b: b0 },
        hideDot: k === 0,
      });
      const near = (e) => {
        const q = pt(csv, e);
        return B3.start && Math.hypot(q.x - B3.start[0], q.y - B3.start[1]) < 20;
      };
      r.addEventListener('pointermove', (e) => {
        if (!d3) r.style.cursor = near(e) ? 'grab' : 'move';
      });
      r.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        d3 = near(e) ? { k: 'start' } : { k: 'rot', x: e.clientX, y: e.clientY, yaw, pitch };
      });
      return;
    }
    if (pview === 'curve') {
      const c = hv.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, hv.width, hv.height);
      csv.innerHTML = '';
      const s = hist[k];
      const f = (v) => J(v, s.b),
        vals = Array.from({ length: 161 }, (_, i) => WR[0] + (i / 160) * (WR[1] - WR[0])),
        lo = Math.min(...vals.map(f)),
        hi = Math.max(f(WR[0]), f(WR[1]));
      const Y = (v) => CB - ((v - lo) / (hi - lo)) * (CB - T);
      [-10, 0, 10, 20, 30, 40, 50, 60].forEach((v) =>
        el(csv, 'text', { x: gw(v), y: CB + 18, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--mut)' }, v),
      );
      el(
        csv,
        'text',
        { x: (L + R) / 2, y: CB + 40, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--mut)' },
        'Weight w (b at ' + s.b.toFixed(1) + ')',
      );
      el(
        csv,
        'text',
        {
          x: 14,
          y: (T + CB) / 2,
          'text-anchor': 'middle',
          'font-size': 13,
          fill: 'var(--mut)',
          transform: 'rotate(-90 14 ' + (T + CB) / 2 + ')',
        },
        'Cost J',
      );
      el(csv, 'line', { x1: L, x2: R, y1: CB, y2: CB, stroke: 'var(--rule)' });
      el(csv, 'path', {
        d: vals.map((v, i) => (i ? 'L' : 'M') + gw(v).toFixed(1) + ' ' + Y(f(v)).toFixed(1)).join(''),
        fill: 'none',
        stroke: 'var(--mut)',
        'stroke-width': 2.5,
      });
      el(csv, 'circle', {
        cx: gw(s.w),
        cy: Y(f(s.w)),
        r: 9,
        fill: 'var(--ac)',
        stroke: 'var(--sf)',
        'stroke-width': 3,
      });
      el(
        csv,
        'text',
        {
          x: gw(s.w) + 12,
          y: Y(f(s.w)) - 10,
          'font-size': 12,
          'font-family': 'Geist Mono Variable, monospace',
          fill: 'var(--ink)',
        },
        'w = ' + s.w.toFixed(2),
      );
      return;
    }
    paintHeat();
    csv.innerHTML = '';
    [-10, 0, 10, 20, 30, 40, 50, 60].forEach((v) =>
      el(csv, 'text', { x: gw(v), y: CB + 18, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--mut)' }, v),
    );
    [-40, -20, 0, 20, 40].forEach((v) =>
      el(csv, 'text', { x: L - 8, y: gb(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--mut)' }, v),
    );
    el(
      csv,
      'text',
      { x: (L + R) / 2, y: CB + 40, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--mut)' },
      'Weight w',
    );
    el(
      csv,
      'text',
      {
        x: 14,
        y: (T + CB) / 2,
        'text-anchor': 'middle',
        'font-size': 13,
        fill: 'var(--mut)',
        transform: 'rotate(-90 14 ' + (T + CB) / 2 + ')',
      },
      'Bias b',
    );
    el(csv, 'path', {
      d: `M${gw(wBest) - 6} ${gb(bBest)} h12 M${gw(wBest)} ${gb(bBest) - 6} v12`,
      stroke: 'var(--ink)',
      'stroke-width': 2,
    });
    const cp = el(csv, 'clipPath', { id: 'clp2' });
    el(cp, 'rect', { x: L, y: T, width: R - L, height: CB - T });
    let d = '';
    for (let i = 0; i <= k; i++) {
      const s = hist[i];
      d += (i ? 'L' : 'M') + gw(s.w).toFixed(1) + ' ' + gb(s.b).toFixed(1);
    }
    el(csv, 'path', { d, fill: 'none', stroke: 'var(--warn)', 'stroke-width': 1.8, 'clip-path': 'url(#clp2)' });
    const every = Math.max(1, Math.ceil(k / 60));
    for (let i = 1; i <= k; i += every) {
      const s = hist[i];
      el(csv, 'circle', { cx: gw(s.w), cy: gb(s.b), r: 2.6, fill: 'var(--warn)', 'clip-path': 'url(#clp2)' });
    }
    const s = hist[k];
    if (k > 0) {
      const px = clamp(gw(s.w), L, R),
        py = clamp(gb(s.b), T, CB);
      el(csv, 'circle', { cx: px, cy: py, r: 7, fill: 'var(--ac)', stroke: 'var(--sf)', 'stroke-width': 2.5 });
      el(
        csv,
        'text',
        {
          x: px + 10,
          y: py + 16,
          'font-size': 11,
          'font-family': 'Geist Mono Variable, monospace',
          fill: 'var(--ink)',
        },
        '(' + s.w.toFixed(1) + ', ' + s.b.toFixed(1) + ')',
      );
    }
    const hit = el(csv, 'rect', {
      x: L,
      y: T,
      width: R - L,
      height: CB - T,
      fill: 'transparent',
      style: 'cursor:crosshair',
    });
    hit.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      drag = true;
      moveStart(e);
    });
    const g = el(csv, 'g', {
      class: 'handle',
      tabindex: 0,
      role: 'slider',
      'aria-label': 'Starting w and b',
      style: 'cursor:grab',
    });
    el(g, 'circle', { cx: gw(w0), cy: gb(b0), r: 20, fill: 'transparent' });
    el(g, 'circle', {
      cx: gw(w0),
      cy: gb(b0),
      r: 9,
      fill: 'var(--sf)',
      stroke: 'var(--ac)',
      'stroke-width': 3.5,
      class: 'knob',
    });
    el(g, 'text', { x: gw(w0) + 13, y: gb(b0) - 10, 'font-size': 12, 'font-weight': 600, fill: 'var(--ac)' }, 'start');
    g.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      drag = true;
    });
  }
  function drawHist() {
    hsv.innerHTML = '';
    const l = 56,
      r = 1040,
      t = 12,
      bt = 140;
    const top = Math.max(...hist.slice(0, Math.max(2, hist.length)).map((h) => h.J));
    const X = (i) => l + (i / N) * (r - l),
      Y = (v) => bt - (Math.log((v / Jmin) * 1.0001) / Math.log((top / Jmin) * 1.0001)) * (bt - t);
    el(hsv, 'line', { x1: l, x2: r, y1: bt, y2: bt, stroke: 'var(--rule)' });
    el(hsv, 'line', {
      x1: l,
      x2: r,
      y1: Y(Jmin * 1.02),
      y2: Y(Jmin * 1.02),
      stroke: 'var(--ac)',
      'stroke-dasharray': '4 3',
      opacity: 0.7,
    });
    el(hsv, 'line', {
      x1: r - 200,
      x2: r - 176,
      y1: t + 6,
      y2: t + 6,
      stroke: 'var(--ac)',
      'stroke-dasharray': '4 3',
      'stroke-width': 1.5,
    });
    el(
      hsv,
      'text',
      { x: r - 170, y: t + 10, 'font-size': 12, fill: 'var(--ac)' },
      'best possible cost: ' + Jmin.toFixed(1),
    );
    [0, N / 2, N].forEach((v) =>
      el(
        hsv,
        'text',
        { x: X(v), y: bt + 16, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--mut)' },
        Math.round(v),
      ),
    );
    el(hsv, 'text', { x: l - 8, y: t + 8, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--mut)' }, 'cost');
    let d = '';
    for (let i = 0; i <= k; i++) d += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + clamp(Y(hist[i].J), t, bt).toFixed(1);
    el(hsv, 'path', { d, fill: 'none', stroke: 'var(--warn)', 'stroke-width': 2.2 });
    if (conv > 0 && k >= conv) {
      el(hsv, 'line', {
        x1: X(conv),
        x2: X(conv),
        y1: t,
        y2: bt,
        stroke: 'var(--ac)',
        'stroke-width': 1.5,
        'stroke-dasharray': '3 3',
      });
      el(
        hsv,
        'text',
        { x: X(conv) + 5, y: t + 24, 'font-size': 11, 'font-weight': 600, fill: 'var(--ac)' },
        'converged at step ' + conv,
      );
    }
    const hx = X(k),
      hy = clamp(Y(hist[k].J), t, bt);
    el(hsv, 'circle', { cx: hx, cy: hy, r: 5, fill: 'var(--warn)' });
    const ch = k > 0 ? hist[k].J - hist[k - 1].J : 0;
    const lab =
      hist[k].J.toFixed(2) +
      (k > 0
        ? '  (' + (ch <= 0 ? '−' : '+') + Math.abs(ch).toFixed(ch !== 0 && Math.abs(ch) < 0.01 ? 4 : 2) + ')'
        : '');
    const right = hx > r - 170;
    el(
      hsv,
      'text',
      {
        x: right ? hx - 10 : hx + 10,
        y: Math.max(t + 34, hy - 12),
        'text-anchor': right ? 'end' : 'start',
        'font-size': 12,
        'font-weight': 600,
        fill: 'var(--warn)',
        'font-family': 'Geist Mono Variable, monospace',
      },
      lab,
    );
    el(
      hsv,
      'text',
      { x: (l + r) / 2, y: bt + 30, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--mut)' },
      'Step',
    );
  }
  function moveStart(e) {
    const q = pt(csv, e);
    w0 = clamp(Math.round(igw(q.x) * 2) / 2, ...WR);
    b0 = clamp(Math.round(igb(q.y) * 2) / 2, ...BR);
    stop();
    run();
    k = 0;
    render();
  }
  win.addEventListener('pointermove', (e) => {
    if (drag) {
      moveStart(e);
      return;
    }
    if (!d3) return;
    if (d3.k === 'rot') {
      yaw = d3.yaw + (e.clientX - d3.x) * 0.01;
      pitch = Math.max(0.15, Math.min(1.35, d3.pitch + (e.clientY - d3.y) * 0.006));
      drawPath();
      return;
    }
    const q = pt(csv, e);
    [w0, b0] = LabBowl.pick(B3.proj, J, WR, BR, q.x, q.y);
    stop();
    run();
    k = 0;
    render();
  });
  win.addEventListener('pointerup', () => {
    drag = false;
    d3 = null;
  });
  const f2 = (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(3);
  function render() {
    drawLine();
    drawPath();
    drawHist();
    const s = hist[k];
    document.getElementById('hS').textContent = k;
    document.getElementById('hW').textContent = s.w.toFixed(3);
    document.getElementById('hB').textContent = s.b.toFixed(3);
    document.getElementById('hJ').textContent = s.J.toFixed(3);
    document.getElementById('scrub').value = k;
    document.getElementById('sk').textContent = k.toLocaleString('en-US');
    document.getElementById('conv').textContent =
      stopped && k === hist.length - 1 ? 'diverged' : conv > 0 && k >= conv ? 'converged at step ' + conv : '';
    document.getElementById('kIt').textContent = k + ' of ' + (hist.length - 1);
    document.getElementById('kW').textContent = s.w.toFixed(2);
    document.getElementById('kB').textContent = s.b.toFixed(2);
    document.getElementById('kJ').textContent = s.J.toFixed(1);
    const done = k === hist.length - 1;
    const gap = s.J / Jmin;
    document.getElementById('status').textContent =
      stopped && done
        ? stopped
        : k === 0
          ? 'Press play, take one step at a time, or drag the timeline.'
          : conv > 0 && k >= conv
            ? 'Converged at step ' +
              conv +
              ': each further step changes the cost by less than 0.1%. Cost ' +
              s.J.toFixed(2) +
              (gap < 1.01 ? ', the best possible.' : ', ' + gap.toFixed(2) + ' times the best possible.')
            : done
              ? 'Not converged yet after ' +
                (hist.length - 1) +
                ' steps: cost ' +
                gap.toFixed(gap < 10 ? 2 : 0) +
                ' times the best possible. More steps or a larger α would get there.'
              : 'Walking downhill…';
    document.getElementById('f').innerHTML =
      k === 0
        ? 'No step yet.'
        : 'w = ' +
          f2(s.pw) +
          ' − ' +
          alpha +
          ' × (' +
          f2(s.gw) +
          ')<br>&nbsp;&nbsp;= <span class="hl">' +
          f2(s.w) +
          '</span><br>b = ' +
          f2(s.pb) +
          ' − ' +
          alpha +
          ' × (' +
          f2(s.gb) +
          ')<br>&nbsp;&nbsp;= <span class="hl">' +
          f2(s.b) +
          '</span>';
  }
  function setPlay(on) {
    playing = on;
    document.getElementById('playIcon').innerHTML = on
      ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor"/>'
      : '<path d="M7 4l13 8-13 8z" fill="currentColor"/>';
    document.getElementById('play').setAttribute('aria-label', on ? 'Pause' : 'Start training');
  }
  function stop() {
    cancelAnimationFrame(timer);
    setPlay(false);
  }
  let lastT = 0;
  function tick(ts) {
    if (!playing) return;
    if (ts && ts - lastT < 16) {
      timer = requestAnimationFrame(tick);
      return;
    }
    lastT = ts || 0;
    const per = Math.max(1, Math.round(N / 240));
    k = Math.min(hist.length - 1, k + per);
    render();
    if (k >= hist.length - 1) {
      setPlay(false);
      return;
    }
    timer = requestAnimationFrame(tick);
  }
  document.getElementById('play').onclick = () => {
    if (playing) {
      stop();
      return;
    }
    if (k >= hist.length - 1) k = 0;
    setPlay(true);
    tick();
  };
  document.getElementById('step').onclick = () => {
    stop();
    k = Math.min(hist.length - 1, k + 1);
    render();
    setPlay(false);
  };
  document.getElementById('reset').onclick = () => {
    stop();
    k = 0;
    render();
    setPlay(false);
  };
  const aIn = document.getElementById('a');
  function setAlpha(a) {
    alpha = a;
    aIn.value = a2s(a);
    document.getElementById('av').textContent = a;
    const seg = document.querySelectorAll('.seg[aria-label="Learning rate"] button');
    let hit = false;
    seg.forEach((x) => {
      const on = x.dataset.a !== 'custom' && +x.dataset.a === a;
      x.classList.toggle('on', on);
      hit = hit || on;
    });
    if (!hit) document.querySelector('[data-a="custom"]').classList.add('on');
    document.querySelector('.custom').classList.toggle('hidden2', hit);
  }
  aIn.oninput = () => {
    setAlpha(s2a(+aIn.value));
    document.querySelector('.custom').classList.remove('hidden2');
    chip(null);
    stop();
    run();
    k = 0;
    render();
  };
  document.querySelectorAll('.seg[aria-label="Learning rate"] button').forEach(
    (x) =>
      (x.onclick = () => {
        if (x.dataset.a === 'custom') {
          document
            .querySelectorAll('.seg[aria-label="Learning rate"] button')
            .forEach((y) => y.classList.toggle('on', y === x));
          document.querySelector('.custom').classList.remove('hidden2');
          return;
        }
        setAlpha(+x.dataset.a);
        chip(null);
        stop();
        run();
        k = 0;
        render();
      }),
  );
  document.getElementById('scrub').oninput = (e) => {
    stop();
    k = +e.target.value;
    render();
  };
  document.querySelectorAll('.seg.iters button').forEach(
    (x) =>
      (x.onclick = () => {
        N = +x.dataset.n;
        document.querySelectorAll('.seg.iters button').forEach((y) => y.classList.toggle('on', y === x));
        stop();
        run();
        k = 0;
        render();
      }),
  );
  function chip(kk) {
    document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.p === kk));
    document.getElementById('pnote').textContent = kk ? PRE[kk][1] : '';
  }
  document.querySelectorAll('.chip').forEach(
    (c) =>
      (c.onclick = () => {
        setAlpha(PRE[c.dataset.p][0]);
        chip(c.dataset.p);
        stop();
        run();
        k = 0;
        render();
        setPlay(true);
        tick();
      }),
  );
  document.querySelectorAll('.seg[aria-label="Bowl view"] button').forEach(
    (x) =>
      (x.onclick = () => {
        pview = x.dataset.v;
        document
          .querySelectorAll('.seg[aria-label="Bowl view"] button')
          .forEach((y) => y.classList.toggle('on', y === x));
        drawPath();
      }),
  );
  const K = (s, id) => katex.render(s, document.getElementById(id), { throwOnError: false, displayMode: true });
  K(
    'w := w - \\alpha\\,\\frac{\\partial J}{\\partial w} \\qquad b := b - \\alpha\\,\\frac{\\partial J}{\\partial b}',
    'm1',
  );
  K(
    '\\text{tmp}_w = w - \\alpha\\,\\tfrac{\\partial J}{\\partial w},\\;\\; \\text{tmp}_b = b - \\alpha\\,\\tfrac{\\partial J}{\\partial b},\\;\\; w = \\text{tmp}_w,\\;\\; b = \\text{tmp}_b',
    'm2',
  );
  const main = document.getElementById('main');
  ctx.load('house-train-points.json').then((d) => {
    P = d;
    stats();
    setAlpha(0.5);
    run();
    setTimeout(() => {
      main.classList.remove('skel');
      main.setAttribute('aria-busy', 'false');
      paintDots();
      paintHeat();
      render();
      setPlay(false);
    }, 400);
  });
  win.addEventListener('resize', () => {
    if (P.length) {
      paintDots();
      paintHeat();
      render();
    }
  });

  return dispose;
}
