// Model Lab, step 5. Ported from the approved design draft docs/design/HouseLabStep5.html:
// the markup, then mount(), which runs the step's interactive code once its markup is on the page.
import katex from 'katex';
import { LabBowl } from '../bowl.js';

export const html = `<div id="main" class="skel" aria-busy="true">
    <div class="skonly" aria-hidden="true">
      <section class="card"><div class="sk" style="width:90px;height:14px;margin-bottom:12px"></div><div class="sk" style="width:30%;height:30px;margin-bottom:12px"></div><div class="sk" style="width:70%;height:16px;margin-bottom:22px"></div>
        <div class="two"><div class="sk" style="height:470px;border-radius:14px"></div><div class="sk" style="height:470px;border-radius:14px"></div></div>
        <div class="meter"><div class="sk" style="height:150px;border-radius:14px"></div><div class="sk" style="height:150px;border-radius:14px"></div></div></section>
    </div>
    <div class="live">
    <section class="card" aria-labelledby="st">
      <span class="tag">Step 5 of 14</span>
      <h2 id="st">Gradient</h2>
      <p class="goal">The gradient is the slope of the cost bowl where your line is. It says which way is downhill for w and for b, and how steep it is. Drag the dot in any chart.</p>
      <div class="two">
        <figure class="plot">
          <div class="phead"><b>The slope for w, and for b</b></div>
          <div class="pbox"><svg id="sw" viewBox="0 0 520 190" width="100%" role="group" aria-label="Cost by w with the slope at the current w"></svg></div>
          <div class="pbox"><svg id="sb" viewBox="0 0 520 190" width="100%" role="group" aria-label="Cost by b with the slope at the current b"></svg></div>
          <figcaption class="note">Each curve is a slice through the bowl, with the other value fixed. The straight line touching the curve is the slope at your dot; the arrow points downhill.</figcaption>
        </figure>
        <figure class="plot">
          <div class="phead"><b>The cost bowl</b><div class="seg" role="group" aria-label="Bowl view"><button class="on" data-v="bowl" type="button">3D bowl</button><button data-v="map" type="button">Top view</button><button data-v="curve" type="button">Cost by w</button></div></div>
          <div class="pbox"><canvas id="heat" aria-hidden="true"></canvas><svg id="cost" viewBox="0 0 520 380" width="100%" role="img" aria-label="The cost bowl with the downhill direction at the current w and b"></svg></div>
          <figcaption class="note" id="bnote">Brighter is lower cost. The arrow at your dot is the downhill direction from the gradient: it points to lower cost, though not always straight to the bottom. Drag the dot anywhere.</figcaption>
        </figure>
      </div>
      <div class="meter" aria-live="polite">
        <div class="box"><h3>Slope for w</h3><div class="big" id="gw"></div><p class="small" id="gwt"></p></div>
        <div class="box"><h3>Slope for b</h3><div class="big" id="gb"></div><p class="small" id="gbt"></p></div>
      </div>
      <div class="chips" role="group" aria-label="Presets"><span class="try">Try:</span><button class="chip" data-p="left" type="button">Left of the bottom</button><button class="chip" data-p="right" type="button">Right of the bottom</button><button class="chip" data-p="best" type="button">At the bottom</button></div>
      <p class="pnote" id="pnote"></p>
    </section>
    </div>
  </div>`;

export const mathHtml = `<div class="mrow" tabindex="0"><span id="m1"></span><p>The slope for w: every error times its ad's x, averaged. (Squaring the error in the cost brings down a 2, which cancels the 2 in 2m.)</p></div>
        <div class="mrow" tabindex="0"><span id="m2"></span><p>The slope for b: the same without the x, because b is not multiplied by x in the model.</p></div>
        <div class="mrow" tabindex="0"><span id="m3"></span><p>Positive slope: lowering the value lowers the cost. Negative slope: raising it lowers the cost. Zero for both: you are at the bottom.</p></div>`;

export const skHtml = ``;

/** Runs the step. `ctx.load(name)` gives its data; the returned function stops everything it started. */
export function mount(ctx) {
  const { setTimeout, requestAnimationFrame, cancelAnimationFrame, win, dispose } = ctx.scope();

  const ns = 'http://www.w3.org/2000/svg',
    csv = document.getElementById('cost'),
    hv = document.getElementById('heat'),
    SW = document.getElementById('sw'),
    SB = document.getElementById('sb');
  const L = 52,
    R = 505,
    T = 14,
    B = 330,
    WR = [-10, 60],
    BR = [-50, 40];
  const gw = (v) => L + ((v - WR[0]) / (WR[1] - WR[0])) * (R - L),
    gb = (v) => B - ((v - BR[0]) / (BR[1] - BR[0])) * (B - T),
    igw = (X) => WR[0] + ((X - L) / (R - L)) * (WR[1] - WR[0]),
    igb = (Y) => BR[0] + ((B - Y) / (B - T)) * (BR[1] - BR[0]);
  let P = [],
    w = 5,
    b = 10,
    S = null,
    Jmin = 0,
    wBest = 0,
    bBest = 0,
    drag = null,
    raf = 0;
  const PRE = {
    left: [
      8,
      -12,
      'Left of the bottom: the slope for w is negative, so the arrow says raise w. The further from the bottom, the steeper the slope.',
    ],
    right: [42, -12, 'Right of the bottom: the slope for w is positive, so the arrow says lower w.'],
    best: [0, 0, 'At the bottom: both slopes are zero. No direction lowers the cost, so this is the best line.'],
  };
  const clamp = (v, a, c) => Math.max(a, Math.min(c, v)),
    r2 = (v) => Math.round(v * 2) / 2;
  function el(par, t, a, txt) {
    const e = document.createElementNS(ns, t);
    for (const k in a) e.setAttribute(k, a[k]);
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
  function pt(s, e) {
    const p = s.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(s.getScreenCTM().inverse());
  }
  function fit(canvas, svgEl) {
    const r = svgEl.getBoundingClientRect(),
      dpr = window.devicePixelRatio || 1,
      s = r.width / 520;
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    const c = canvas.getContext('2d');
    c.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
    c.clearRect(0, 0, 520, 380);
    return c;
  }
  function paintHeat() {
    const c = fit(hv, csv);
    const dark = document.documentElement.dataset.theme === 'dark',
      N = 180,
      M = 140,
      lo = Math.log(Jmin),
      hi = Math.log(J(WR[0], BR[1]) + J(WR[1], BR[1]));
    const off = document.createElement('canvas');
    off.width = N;
    off.height = M;
    const o = off.getContext('2d'),
      img = o.createImageData(N, M);
    const col = dark ? [95, 216, 171] : [20, 122, 85];
    for (let j = 0; j < M; j++)
      for (let i = 0; i < N; i++) {
        const wv = WR[0] + ((i + 0.5) / N) * (WR[1] - WR[0]),
          bv = BR[1] - ((j + 0.5) / M) * (BR[1] - BR[0]);
        const tt = Math.min(1, Math.max(0, (Math.log(J(wv, bv)) - lo) / (hi - lo)));
        const g = Math.pow(1 - tt, 1.6);
        const k = (j * N + i) * 4;
        img.data[k] = col[0];
        img.data[k + 1] = col[1];
        img.data[k + 2] = col[2];
        img.data[k + 3] = Math.round(255 * (dark ? 0.05 + 0.85 * g : 0.04 + 0.8 * g));
      }
    o.putImageData(img, 0, 0);
    c.drawImage(off, L, T, R - L, B - T);
  }
  function arrowHead(par, x1, y1, x2, y2, col, wid) {
    el(par, 'line', { x1, y1, x2, y2, stroke: col, 'stroke-width': wid, 'stroke-linecap': 'round' });
    const a = Math.atan2(y2 - y1, x2 - x1),
      h = 11;
    el(par, 'path', {
      d: `M${x2} ${y2} L${x2 - h * Math.cos(a - 0.45)} ${y2 - h * Math.sin(a - 0.45)} L${x2 - h * Math.cos(a + 0.45)} ${y2 - h * Math.sin(a + 0.45)} Z`,
      fill: col,
    });
  }
  function slice(s, which) {
    s.innerHTML = '';
    const l = 52,
      r = 505,
      t = 12,
      bt = 150;
    const R0 = which === 'w' ? WR : BR;
    const val = which === 'w' ? w : b;
    const f = (v) => (which === 'w' ? J(v, b) : J(w, v)),
      d = which === 'w' ? dJw(w, b) : dJb(w, b);
    const lo =
        Math.min(f(R0[0]), f(R0[1]), Jmin) * 0 +
        Math.min(...Array.from({ length: 41 }, (_, i) => f(R0[0] + (i / 40) * (R0[1] - R0[0])))),
      hi = Math.max(f(R0[0]), f(R0[1]));
    const X = (v) => l + ((v - R0[0]) / (R0[1] - R0[0])) * (r - l),
      Y = (v) => bt - (Math.max(0, v - lo) / (hi - lo)) * (bt - t);
    el(s, 'line', { x1: l, x2: r, y1: bt, y2: bt, stroke: 'var(--rule)' });
    [0, 0.25, 0.5, 0.75, 1].forEach((q) => {
      const v = R0[0] + q * (R0[1] - R0[0]);
      el(
        s,
        'text',
        { x: X(v), y: bt + 16, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--mut)' },
        Math.round(v),
      );
    });
    el(
      s,
      'text',
      { x: r, y: bt + 32, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--mut)' },
      which === 'w' ? 'w (b fixed at ' + b.toFixed(1) + ')' : 'b (w fixed at ' + w.toFixed(1) + ')',
    );
    el(s, 'text', { x: l - 8, y: t + 10, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--mut)' }, 'cost');
    let p = '';
    for (let i = 0; i <= 160; i++) {
      const v = R0[0] + (i / 160) * (R0[1] - R0[0]);
      p += (i ? 'L' : 'M') + X(v).toFixed(1) + ' ' + Y(f(v)).toFixed(1);
    }
    el(s, 'path', { d: p, fill: 'none', stroke: 'var(--mut)', 'stroke-width': 2 });
    // tangent: slope in screen space via small step
    const e = (R0[1] - R0[0]) * 0.2,
      xa = clamp(val - e, R0[0], R0[1]),
      xb = clamp(val + e, R0[0], R0[1]);
    const ya = f(val) + d * (xa - val),
      yb = f(val) + d * (xb - val);
    el(s, 'line', {
      x1: X(xa),
      y1: Y(ya),
      x2: X(xb),
      y2: Y(yb),
      stroke: 'var(--warn)',
      'stroke-width': 2.5,
      'stroke-linecap': 'round',
      'clip-path': 'url(#c' + which + ')',
    });
    const cp = el(s, 'clipPath', { id: 'c' + which });
    el(cp, 'rect', { x: l, y: t, width: r - l, height: bt - t });
    el(
      s,
      'text',
      {
        x: X(xa) - 4,
        y: Math.max(t + 10, Y(ya) - 6),
        'text-anchor': 'end',
        'font-size': 11,
        'font-weight': 600,
        fill: 'var(--warn)',
      },
      'slope',
    );
    const cx = X(val),
      cy = Y(f(val));
    if (Math.abs(d) > 0.05) {
      const dir = d > 0 ? -1 : 1;
      arrowHead(s, cx + dir * 14, bt - 10, cx + dir * 58, bt - 10, 'var(--ac)', 3);
      el(
        s,
        'text',
        {
          x: cx + dir * 64,
          y: bt - 6,
          'text-anchor': dir > 0 ? 'start' : 'end',
          'font-size': 12,
          'font-weight': 600,
          fill: 'var(--ac)',
        },
        'downhill',
      );
    }
    const hit = el(s, 'rect', {
      x: l,
      y: t,
      width: r - l,
      height: bt - t,
      fill: 'transparent',
      style: 'cursor:pointer',
    });
    hit.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      drag = { k: 's' + which, s, X0: l, X1: r, R0 };
      move(ev);
    });
    const g = el(s, 'g', {
      class: 'handle',
      tabindex: 0,
      role: 'slider',
      'aria-label': which === 'w' ? 'Weight w' : 'Bias b',
      'aria-valuenow': which === 'w' ? w : b,
      style: 'cursor:ew-resize',
    });
    el(g, 'circle', { cx, cy, r: 22, fill: 'transparent' });
    el(g, 'circle', {
      cx,
      cy,
      r: drag && drag.k === 's' + which ? 12 : 10,
      fill: 'var(--ac)',
      stroke: 'var(--sf)',
      'stroke-width': 3,
      class: 'knob',
    });
    g.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      drag = { k: 's' + which, s, X0: l, X1: r, R0 };
    });
    g.addEventListener('keydown', (ev) => {
      const dd = ev.key === 'ArrowRight' ? 0.5 : ev.key === 'ArrowLeft' ? -0.5 : 0;
      if (!dd) return;
      ev.preventDefault();
      if (which === 'w') w = clamp(w + dd, ...WR);
      else b = clamp(b + dd, ...BR);
      chip(null);
      update();
      s.querySelector('.handle').focus();
    });
  }
  let bview = 'bowl',
    yaw = -0.75,
    pitch = 0.62,
    B3 = null;
  const NOTES = {
    bowl: 'The bowl in 3D: height is cost. The arrow at your dot points downhill. Drag the dot over the bowl to move it; drag anywhere else to turn the bowl.',
    map: 'The same bowl seen from above: brighter is lower cost. The arrow is the downhill direction; it points to lower cost, though not always straight to the bottom. Drag the dot anywhere.',
    curve:
      'A slice through the bowl at the current b: cost for every w. The arrow points downhill along w. Drag the dot along the curve.',
  };
  function drawTop() {
    document.getElementById('bnote').textContent = NOTES[bview];
    if (bview === 'bowl') {
      csv.innerHTML = '';
      const r = el(csv, 'rect', { x: 0, y: 0, width: 520, height: 380, fill: 'transparent', style: 'cursor:move' });
      B3 = LabBowl.draw(hv, csv, {
        J,
        WR,
        BR,
        Jmin,
        wBest,
        bBest,
        yaw,
        pitch,
        w,
        b,
        arrow: { dw: dJw(w, b), db: dJb(w, b) },
        big: drag && drag.k === 'bowldot',
      });
      const near = (e) => {
        const q = pt(csv, e);
        return Math.hypot(q.x - B3.dot[0], q.y - B3.dot[1]) < 20;
      };
      r.addEventListener('pointermove', (e) => {
        if (!drag) r.style.cursor = near(e) ? 'grab' : 'move';
      });
      r.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        drag = near(e) ? { k: 'bowldot' } : { k: 'rot', x: e.clientX, y: e.clientY, yaw, pitch };
      });
      return;
    }
    if (bview === 'curve') {
      const c = hv.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, hv.width, hv.height);
      csv.innerHTML = '';
      const f = (v) => J(v, b),
        vals = Array.from({ length: 161 }, (_, i) => WR[0] + (i / 160) * (WR[1] - WR[0])),
        lo = Math.min(...vals.map(f)),
        hi = Math.max(f(WR[0]), f(WR[1]));
      const Y = (v) => B - ((v - lo) / (hi - lo)) * (B - T);
      [-10, 0, 10, 20, 30, 40, 50, 60].forEach((v) =>
        el(csv, 'text', { x: gw(v), y: B + 18, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--mut)' }, v),
      );
      el(
        csv,
        'text',
        { x: (L + R) / 2, y: B + 40, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--mut)' },
        'Weight w (b fixed at ' + b.toFixed(1) + ')',
      );
      el(
        csv,
        'text',
        {
          x: 14,
          y: (T + B) / 2,
          'text-anchor': 'middle',
          'font-size': 13,
          fill: 'var(--mut)',
          transform: 'rotate(-90 14 ' + (T + B) / 2 + ')',
        },
        'Cost J',
      );
      el(csv, 'line', { x1: L, x2: R, y1: B, y2: B, stroke: 'var(--rule)' });
      el(csv, 'path', {
        d: vals.map((v, i) => (i ? 'L' : 'M') + gw(v).toFixed(1) + ' ' + Y(f(v)).toFixed(1)).join(''),
        fill: 'none',
        stroke: 'var(--mut)',
        'stroke-width': 2.5,
      });
      const d = dJw(w, b),
        cx = gw(w),
        cy = Y(f(w));
      if (Math.abs(d) > 0.05) {
        const dir = d > 0 ? -1 : 1;
        arrowHead(csv, cx, cy, cx + dir * 60, cy, 'var(--ac)', 3.5);
      }
      const hit = el(csv, 'rect', {
        x: L,
        y: T,
        width: R - L,
        height: B - T,
        fill: 'transparent',
        style: 'cursor:pointer',
      });
      hit.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        drag = { k: 'cw' };
        move(e);
      });
      const g = el(csv, 'g', { class: 'handle', style: 'cursor:ew-resize' });
      el(g, 'circle', { cx, cy, r: 22, fill: 'transparent' });
      el(g, 'circle', {
        cx,
        cy,
        r: drag && drag.k === 'cw' ? 12 : 10,
        fill: 'var(--ac)',
        stroke: 'var(--sf)',
        'stroke-width': 3,
        class: 'knob',
      });
      g.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        drag = { k: 'cw' };
      });
      return;
    }
    paintHeat();
    csv.innerHTML = '';
    [-10, 0, 10, 20, 30, 40, 50, 60].forEach((v) =>
      el(csv, 'text', { x: gw(v), y: B + 18, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--mut)' }, v),
    );
    [-40, -20, 0, 20, 40].forEach((v) =>
      el(csv, 'text', { x: L - 8, y: gb(v) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--mut)' }, v),
    );
    el(
      csv,
      'text',
      { x: (L + R) / 2, y: B + 40, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--mut)' },
      'Weight w',
    );
    el(
      csv,
      'text',
      {
        x: 14,
        y: (T + B) / 2,
        'text-anchor': 'middle',
        'font-size': 13,
        fill: 'var(--mut)',
        transform: 'rotate(-90 14 ' + (T + B) / 2 + ')',
      },
      'Bias b',
    );
    el(csv, 'path', {
      d: `M${gw(wBest) - 7} ${gb(bBest)} h14 M${gw(wBest)} ${gb(bBest) - 7} v14`,
      stroke: 'var(--ink)',
      'stroke-width': 2,
    });
    const hit = el(csv, 'rect', {
      x: L,
      y: T,
      width: R - L,
      height: B - T,
      fill: 'transparent',
      style: 'cursor:crosshair',
    });
    hit.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      drag = { k: 'top' };
      move(e);
    });
    // downhill arrow in screen space: -gradient, scaled to a fixed length
    const gx = (-dJw(w, b) * (R - L)) / (WR[1] - WR[0]),
      gy = (dJb(w, b) * (B - T)) / (BR[1] - BR[0]),
      len = Math.hypot(gx, gy);
    const cx = gw(w),
      cy = gb(b);
    if (len > 1e-6) {
      const k = Math.min(70, 18 + len * 0.9) / len;
      arrowHead(csv, cx, cy, cx + gx * k, cy + gy * k, 'var(--ac)', 3.5);
    }
    const g = el(csv, 'g', {
      class: 'handle',
      tabindex: 0,
      role: 'slider',
      'aria-label': 'w and b on the bowl',
      'aria-valuenow': w,
      'aria-valuetext': 'w ' + w.toFixed(1) + ', b ' + b.toFixed(1),
      style: 'cursor:grab',
    });
    el(g, 'circle', { cx, cy, r: 22, fill: 'transparent' });
    el(g, 'circle', {
      cx,
      cy,
      r: drag && drag.k === 'top' ? 12 : 10,
      fill: 'var(--sf)',
      stroke: 'var(--ac)',
      'stroke-width': 3.5,
      class: 'knob',
    });
    g.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      drag = { k: 'top' };
    });
  }
  function move(e) {
    if (!drag) return;
    if (drag.k === 'rot') {
      yaw = drag.yaw + (e.clientX - drag.x) * 0.01;
      pitch = Math.max(0.15, Math.min(1.35, drag.pitch + (e.clientY - drag.y) * 0.006));
      drawTop();
      return;
    }
    if (drag.k === 'bowldot') {
      const q = pt(csv, e);
      [w, b] = LabBowl.pick(B3.proj, J, WR, BR, q.x, q.y);
      chip(null);
      schedule();
      return;
    }
    if (drag.k === 'cw') {
      const q = pt(csv, e);
      w = clamp(r2(igw(q.x)), ...WR);
      chip(null);
      schedule();
      return;
    }
    if (drag.k === 'top') {
      const q = pt(csv, e);
      w = clamp(r2(igw(q.x)), ...WR);
      b = clamp(r2(igb(q.y)), ...BR);
    } else {
      const q = pt(drag.s, e);
      const v = drag.R0[0] + ((q.x - drag.X0) / (drag.X1 - drag.X0)) * (drag.R0[1] - drag.R0[0]);
      if (drag.k === 'sw') w = clamp(r2(v), ...WR);
      else b = clamp(r2(v), ...BR);
    }
    chip(null);
    schedule();
  }
  win.addEventListener('pointermove', move);
  win.addEventListener('pointerup', () => {
    if (drag) {
      drag = null;
      schedule();
    }
  });
  const fmt = (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
  function words(name, d) {
    if (Math.abs(d) < 0.05)
      return 'Zero: changing ' + name + ' a little does not change the cost. You are at the bottom for ' + name + '.';
    return (
      (d < 0 ? 'Negative' : 'Positive') +
      ': raising ' +
      name +
      ' by 1 would ' +
      (d < 0 ? 'lower' : 'raise') +
      ' the cost by about ' +
      Math.abs(d).toFixed(1) +
      ', right here. So ' +
      name +
      ' should go <b>' +
      (d < 0 ? 'up' : 'down') +
      '</b>.'
    );
  }
  function update() {
    slice(SW, 'w');
    slice(SB, 'b');
    drawTop();
    const a = dJw(w, b),
      c = dJb(w, b);
    document.getElementById('gw').innerHTML = fmt(a) + '<small>∂J/∂w at w = ' + w.toFixed(1) + '</small>';
    document.getElementById('gwt').innerHTML = words('w', a);
    document.getElementById('gb').innerHTML = fmt(c) + '<small>∂J/∂b at b = ' + b.toFixed(1) + '</small>';
    document.getElementById('gbt').innerHTML = words('b', c);
  }
  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      update();
    });
  }
  function chip(k) {
    document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.p === k));
    document.getElementById('pnote').textContent = k ? PRE[k][2] : '';
  }
  document.querySelectorAll('.chip').forEach(
    (c) =>
      (c.onclick = () => {
        const k = c.dataset.p;
        if (k === 'best') {
          w = wBest;
          b = bBest;
        } else {
          [w, b] = PRE[k];
          b = bBest;
        }
        chip(k);
        update();
      }),
  );
  document.querySelectorAll('.seg[aria-label="Bowl view"] button').forEach(
    (x) =>
      (x.onclick = () => {
        bview = x.dataset.v;
        document
          .querySelectorAll('.seg[aria-label="Bowl view"] button')
          .forEach((y) => y.classList.toggle('on', y === x));
        drawTop();
      }),
  );
  const K = (s, id) => katex.render(s, document.getElementById(id), { throwOnError: false, displayMode: true });
  K(
    '\\frac{\\partial J}{\\partial w} = \\frac{1}{m}\\sum_{i=0}^{m-1}\\big(f_{w,b}(x^{(i)}) - y^{(i)}\\big)\\,x^{(i)}',
    'm1',
  );
  K('\\frac{\\partial J}{\\partial b} = \\frac{1}{m}\\sum_{i=0}^{m-1}\\big(f_{w,b}(x^{(i)}) - y^{(i)}\\big)', 'm2');
  K(
    '\\frac{\\partial J}{\\partial w} > 0 \\Rightarrow w \\downarrow \\qquad \\frac{\\partial J}{\\partial w} < 0 \\Rightarrow w \\uparrow',
    'm3',
  );
  const main = document.getElementById('main');
  ctx.load('house-train-points.json').then((d) => {
    P = d;
    stats();
    setTimeout(() => {
      main.classList.remove('skel');
      main.setAttribute('aria-busy', 'false');
      paintHeat();
      update();
    }, 400);
  });
  win.addEventListener('resize', () => {
    if (P.length) {
      paintHeat();
      update();
    }
  });

  return dispose;
}
