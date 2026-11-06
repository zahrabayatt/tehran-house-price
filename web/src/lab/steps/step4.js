// Model Lab, step 4. Ported from the approved design draft docs/design/HouseLabStep4.html:
// the markup, then mount(), which runs the step's interactive code once its markup is on the page.
import katex from 'katex';

export const html = `<div id="main" class="skel" aria-busy="true">
    <div class="skonly" aria-hidden="true">
      <section class="card"><div class="sk" style="width:90px;height:14px;margin-bottom:12px"></div><div class="sk" style="width:36%;height:30px;margin-bottom:12px"></div><div class="sk" style="width:70%;height:16px;margin-bottom:22px"></div>
        <div class="two"><div class="sk" style="height:470px;border-radius:14px"></div><div class="sk" style="height:470px;border-radius:14px"></div></div>
        <div class="meter"><div class="sk" style="height:150px;border-radius:14px"></div><div class="sk" style="height:150px;border-radius:14px"></div></div></section>
    </div>
    <div class="live">
    <section class="card" aria-labelledby="st">
      <span class="tag">Step 4 of 14</span>
      <h2 id="st">Cost function</h2>
      <p class="goal">One number for how wrong a line is. Move the line on the left, or the dot on the cost map on the right: they are the same w and b.</p>
      <div class="two">
        <figure class="plot">
          <div class="phead"><b>Your line, and its errors</b></div>
          <div class="pbox"><canvas id="dots" aria-hidden="true"></canvas><svg id="plot" viewBox="0 0 520 380" width="100%" role="group" aria-label="Training ads, the line, and error lines"></svg></div>
          <div class="sliders">
            <div class="sl"><label for="w">Weight w <b id="wv"></b></label><input id="w" type="range" min="-10" max="60" step="0.5"></div>
            <div class="sl"><label for="b">Bias b <b id="bv"></b></label><input id="b" type="range" min="-50" max="40" step="0.5"></div>
          </div>
          <figcaption class="note">Thin lines are the errors of 80 random ads. The chosen ad's error is drawn as a square: its area is the squared error. Click any ad to choose it.</figcaption>
        </figure>
        <figure class="plot">
          <div class="phead"><b>Cost of every line</b><div class="seg" role="group" aria-label="Cost view"><button class="on" data-v="bowl" type="button">3D bowl</button><button data-v="map" type="button">Top view</button><button data-v="curve" type="button">Cost by w</button></div></div>
          <div class="pbox"><canvas id="heat" aria-hidden="true"></canvas><svg id="cost" viewBox="0 0 520 380" width="100%" role="img" aria-label="Cost for every pair of w and b, with the current pair marked"></svg></div>
          <figcaption class="note" id="cnote"></figcaption>
        </figure>
      </div>
      <div class="meter" aria-live="polite">
        <div class="box">
          <h3>How wrong is this line?</h3>
          <div class="big" id="J"></div>
          <div class="bar"><i id="jbar"></i><span class="best" title="Best possible line"></span></div><div class="barlab"><span>best possible</span><span>much worse</span></div>
          <p class="small" id="jtext"></p>
        </div>
        <div class="box">
          <h3>For the chosen ad</h3>
          <div class="formula" id="f"></div>
        </div>
      </div>
      <div class="chips" role="group" aria-label="Try these lines"><span class="try">Try:</span><button class="chip" data-p="flat" type="button">Flat line</button><button class="chip" data-p="far" type="button">Far away</button><button class="chip" data-p="best" type="button">Best possible line</button></div>
      <p class="pnote" id="pnote"></p>
    </section>
    </div>
  </div>`;

export const mathHtml = `<div class="mrow" tabindex="0"><span id="m1"></span><p>The error for one ad: what the line says minus what the ad asked.</p></div>
        <div class="mrow" tabindex="0"><span id="m2"></span><p>Square each error, so big misses count much more and positive and negative errors do not cancel. Average over all m ads; the extra 2 only makes the next step's math tidier.</p></div>
        <div class="mrow" tabindex="0"><span id="m3"></span><p>The best line is the w and b with the lowest cost: the lowest point of the cost map.</p></div>`;

export const skHtml = ``;

/** Runs the step. `ctx.load(name)` gives its data; the returned function stops everything it started. */
export function mount(ctx) {
  const { setTimeout, requestAnimationFrame, cancelAnimationFrame, win, dispose } = ctx.scope();

  const ns = 'http://www.w3.org/2000/svg',
    svg = document.getElementById('plot'),
    csv = document.getElementById('cost'),
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
    BR = [-50, 40];
  const fx = (x) => L + (x / XM) * (R - L),
    fy = (y) => B - ((y - YN) / (YM - YN)) * (B - T),
    iy = (Y) => YN + ((B - Y) / (B - T)) * (YM - YN);
  const gw = (v) => L + ((v - WR[0]) / (WR[1] - WR[0])) * (R - L),
    gb = (v) => B - ((v - BR[0]) / (BR[1] - BR[0])) * (B - T),
    igw = (X) => WR[0] + ((X - L) / (R - L)) * (WR[1] - WR[0]),
    igb = (Y) => BR[0] + ((B - Y) / (B - T)) * (BR[1] - BR[0]);
  const PRE = {
    flat: [
      0,
      7,
      'Flat line: every ad gets the same price. The dot sits far from the bright valley, and the cost is high.',
    ],
    good: [
      20,
      -4,
      'A close guess, picked by hand: the dot sits in the bright valley near the lowest point, but not on it, so it still costs more than the best line. Step 6 lets the computer find the best line by itself.',
    ],
    best: [
      0,
      0,
      'Best possible line: the bottom of the bowl, the best straight line for these ads. Its cost, 33.3, is the smallest any line can reach. Step 6 shows how the computer finds this line by itself.',
    ],
    far: [55, 30, 'Far away: almost every ad is badly overpriced. Big errors squared make the cost explode.'],
  };
  let P = [],
    w = 10,
    b = 0,
    sel = 0,
    view = 'bowl',
    yaw = -0.75,
    pitch = 0.62,
    raf = 0,
    S = null,
    SAMPLE = [],
    Jmin = 0,
    wBest = 0,
    bBest = 0,
    drag = null;
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
  function paintDots() {
    const c = fit(cv, svg);
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
  function bowl() {
    const c = fit(hv, csv);
    const dark = document.documentElement.dataset.theme === 'dark';
    const N = 34,
      top = Math.sqrt(J(WR[1], BR[1])),
      hz = (v) => Math.sqrt(v) / top;
    const cyw = Math.cos(yaw),
      syw = Math.sin(yaw),
      cp = Math.cos(pitch),
      sp = Math.sin(pitch);
    const proj = (wv, bv, jv) => {
      const X = (wv - WR[0]) / (WR[1] - WR[0]) - 0.5,
        Y = (bv - BR[0]) / (BR[1] - BR[0]) - 0.5,
        Z = Math.min(hz(jv), 1.15) * 0.62;
      const x1 = X * cyw - Y * syw,
        y1 = X * syw + Y * cyw;
      return [260 + x1 * 360, 262 - (Z * cp + y1 * sp) * 300, y1 * cp - Z * sp];
    };
    const quads = [];
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const w0 = WR[0] + (i / N) * (WR[1] - WR[0]),
          w1 = WR[0] + ((i + 1) / N) * (WR[1] - WR[0]),
          b0 = BR[0] + (j / N) * (BR[1] - BR[0]),
          b1 = BR[0] + ((j + 1) / N) * (BR[1] - BR[0]);
        const pts = [
          [w0, b0],
          [w1, b0],
          [w1, b1],
          [w0, b1],
        ].map(([a, bb]) => proj(a, bb, J(a, bb)));
        const jm = J((w0 + w1) / 2, (b0 + b1) / 2);
        const lo = Math.log(Jmin),
          hi = Math.log(J(WR[1], BR[1]));
        quads.push({
          pts,
          d: pts.reduce((s, q) => s + q[2], 0) / 4,
          h: Math.min(1, Math.max(0, (Math.log(jm) - lo) / (hi - lo))),
        });
      }
    quads.sort((a, b) => b.d - a.d);
    for (const q of quads) {
      const g = Math.pow(1 - q.h, 1.4);
      c.beginPath();
      q.pts.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.closePath();
      c.fillStyle = dark
        ? `rgba(${Math.round(30 + 65 * g)},${Math.round(60 + 156 * g)},${Math.round(55 + 116 * g)},0.96)`
        : `rgba(${Math.round(200 - 180 * g)},${Math.round(230 - 108 * g)},${Math.round(215 - 130 * g)},0.96)`;
      c.fill();
      c.strokeStyle = dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)';
      c.lineWidth = 0.6;
      c.stroke();
    }
    const best = proj(wBest, bBest, Jmin),
      cur = proj(w, b, J(w, b));
    window._proj = proj;
    window._cur = cur;
    c.fillStyle = dark ? '#fff' : '#101512';
    c.beginPath();
    c.arc(best[0], best[1], 4, 0, 6.283);
    c.fill();
    c.font = '12px Geist Variable, sans-serif';
    c.fillText('lowest point', best[0] + 8, best[1] + 14);
    c.strokeStyle = dark ? '#fff' : '#101512';
    c.setLineDash([3, 3]);
    c.beginPath();
    c.moveTo(cur[0], cur[1]);
    const fl = proj(w, b, Jmin);
    c.lineTo(fl[0], fl[1]);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = getComputedStyle(document.getElementById('main')).getPropertyValue('--ac').trim();
    c.beginPath();
    c.arc(cur[0], cur[1], drag && drag.k === 'bowldot' ? 12 : 10, 0, 6.283);
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = dark ? '#2A2E32' : '#fff';
    c.stroke();
    const ax = (a, bb, lab) => {
      const p0 = proj(a[0], a[1], 0),
        p1 = proj(bb[0], bb[1], 0);
      c.strokeStyle = dark ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.35)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(p0[0], p0[1]);
      c.lineTo(p1[0], p1[1]);
      c.stroke();
      c.fillStyle = dark ? '#B6BDBA' : '#56605A';
      c.fillText(lab, p1[0] + 6, p1[1] + 4);
    };
    ax([WR[0], BR[0]], [WR[1], BR[0]], 'w');
    ax([WR[0], BR[0]], [WR[0], BR[1]], 'b');
    const zt = proj(WR[0], BR[0], J(WR[1], BR[1]));
    const z0 = proj(WR[0], BR[0], 0);
    c.beginPath();
    c.moveTo(z0[0], z0[1]);
    c.lineTo(zt[0], zt[1]);
    c.stroke();
    c.fillText('cost J', zt[0] + 6, zt[1]);
  }
  function paintHeat() {
    if (view === 'bowl') {
      bowl();
      return;
    }
    const c = fit(hv, csv);
    if (view !== 'map') return;
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
    c.imageSmoothingEnabled = true;
    c.drawImage(off, L, T, R - L, B - T);
  }
  function pt(svgEl, e) {
    const p = svgEl.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(svgEl.getScreenCTM().inverse());
  }
  function axes(s, xs, ys, fxx, fyy, xl, yl) {
    xs.forEach((v) =>
      el(s, 'text', { x: fxx(v), y: B + 18, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--mut)' }, v),
    );
    ys.forEach((v) => {
      el(s, 'line', { x1: L, x2: R, y1: fyy(v), y2: fyy(v), stroke: 'var(--rule)' });
      el(s, 'text', { x: L - 8, y: fyy(v) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--mut)' }, v);
    });
    el(s, 'text', { x: (L + R) / 2, y: B + 40, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--mut)' }, xl);
    el(
      s,
      'text',
      {
        x: 14,
        y: (T + B) / 2,
        'text-anchor': 'middle',
        'font-size': 13,
        fill: 'var(--mut)',
        transform: 'rotate(-90 14 ' + (T + B) / 2 + ')',
      },
      yl,
    );
  }
  function knob(s, k, X, Y, label) {
    const g = el(s, 'g', {
      class: 'handle',
      tabindex: 0,
      role: 'slider',
      'aria-label': label,
      'aria-valuenow': k === 'w' ? w : b,
      style: 'cursor:' + (drag && drag.k === k ? 'grabbing' : 'grab'),
    });
    el(g, 'circle', { cx: X, cy: Y, r: 24, fill: 'transparent' });
    el(g, 'circle', {
      cx: X,
      cy: Y,
      r: drag && drag.k === k ? 13 : 11,
      fill: 'var(--ac)',
      stroke: 'var(--sf)',
      'stroke-width': 3,
      class: 'knob',
    });
    g.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      drag = { k, s };
      document.body.style.cursor = 'grabbing';
      schedule();
    });
    g.addEventListener('keydown', (e) => {
      const m = { ArrowUp: [0, 0.5], ArrowDown: [0, -0.5], ArrowRight: [0.5, 0], ArrowLeft: [-0.5, 0] }[e.key];
      if (!m) return;
      e.preventDefault();
      if (k === 'b') b = clamp(b + m[1], ...BR);
      else if (k === 'w') w = clamp(w + m[1], ...WR);
      else {
        w = clamp(w + m[0], ...WR);
        b = clamp(b + m[1], ...BR);
      }
      chip(null);
      update();
      s.querySelector('[aria-label="' + label + '"]').focus();
    });
    return g;
  }
  win.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (drag.k === 'bowldot') {
      const q = pt(csv, e),
        pr = window._proj;
      let bw = w,
        bb = b,
        bd = 1e9;
      for (let wv = WR[0]; wv <= WR[1]; wv += 0.5)
        for (let bv = BR[0]; bv <= BR[1]; bv += 0.5) {
          const s = pr(wv, bv, J(wv, bv));
          const d = (s[0] - q.x) ** 2 + (s[1] - q.y) ** 2;
          if (d < bd) {
            bd = d;
            bw = wv;
            bb = bv;
          }
        }
      w = bw;
      b = bb;
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
    if (drag.k === 'rot') {
      yaw = drag.yaw + (e.clientX - drag.x) * 0.01;
      pitch = Math.max(0.15, Math.min(1.35, drag.pitch + (e.clientY - drag.y) * 0.006));
      bowl();
      return;
    }
    const q = pt(drag.s, e);
    if (drag.k === 'b') b = clamp(r2(iy(q.y)), ...BR);
    else if (drag.k === 'w') w = clamp(r2((iy(q.y) - b) / XM), ...WR);
    else {
      w = clamp(r2(igw(q.x)), ...WR);
      b = clamp(r2(igb(q.y)), ...BR);
    }
    chip(null);
    schedule();
  });
  win.addEventListener('pointerup', () => {
    if (drag) {
      drag = null;
      document.body.style.cursor = '';
      schedule();
    }
  });
  function drawLine() {
    svg.innerHTML = '';
    axes(
      svg,
      [0, 50, 100, 150, 200, 250, 300].map((v) => v),
      [-20, 0, 20, 40, 60, 80],
      (v) => fx(v / 100),
      fy,
      'Area (m²)',
      'Asking price (billion toman)',
    );
    svg.querySelectorAll('text').forEach((t) => {
      if (/^\d+$/.test(t.textContent) && +t.getAttribute('y') === B + 18) {
      }
    });
    const hit = el(svg, 'rect', {
      x: L,
      y: T,
      width: R - L,
      height: B - T,
      fill: 'transparent',
      style: 'cursor:crosshair',
    });
    hit.addEventListener('click', (e) => {
      const q = pt(svg, e);
      let best = 0,
        bd = 1e9;
      for (let i = 0; i < P.length; i++) {
        const [a, p] = P[i];
        if (a / 100 > XM || p > YM) continue;
        const dx = fx(a / 100) - q.x,
          dy = fy(p) - q.y,
          d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      sel = best;
      update();
    });
    for (const i of SAMPLE) {
      const [a, p] = P[i],
        x = a / 100;
      if (x > XM || p > YM) continue;
      const f = clamp(w * x + b, YN, YM);
      el(svg, 'line', {
        x1: fx(x),
        x2: fx(x),
        y1: fy(p),
        y2: fy(f),
        stroke: 'var(--warn)',
        'stroke-width': 1,
        opacity: 0.6,
      });
    }
    const y0 = b,
      y1 = w * XM + b;
    el(svg, 'line', {
      x1: fx(0),
      y1: fy(clamp(y0, YN - 40, YM + 40)),
      x2: fx(XM),
      y2: fy(clamp(y1, YN - 40, YM + 40)),
      stroke: 'var(--line)',
      'stroke-width': 3,
      'stroke-linecap': 'round',
      'clip-path': 'url(#clp)',
    });
    const cp = el(svg, 'clipPath', { id: 'clp' });
    el(cp, 'rect', { x: L, y: T, width: R - L, height: B - T });
    const [a, p] = P[sel],
      x = a / 100,
      f = w * x + b;
    if (x <= XM) {
      const yA = fy(Math.min(p, YM)),
        yF = fy(clamp(f, YN, YM)),
        side = Math.abs(yF - yA);
      el(svg, 'rect', {
        x: fx(x),
        y: Math.min(yA, yF),
        width: Math.min(side, R - fx(x)),
        height: side,
        fill: 'var(--warn)',
        opacity: 0.22,
        stroke: 'var(--warn)',
        'stroke-width': 1.5,
        'clip-path': 'url(#clp)',
      });
      el(svg, 'circle', { cx: fx(x), cy: yA, r: 6, fill: 'var(--ac)', stroke: 'var(--sf)', 'stroke-width': 2 });
    }
    knob(svg, 'b', fx(0), fy(clamp(b, YN, YM)), 'Bias b, the line at 0 m²');
    knob(svg, 'w', fx(XM), fy(clamp(w * XM + b, YN, YM)), 'Weight w, tilts the line');
  }
  function drawCost() {
    csv.innerHTML = '';
    if (view === 'bowl') {
      const r = el(csv, 'rect', { x: 0, y: 0, width: 520, height: 380, fill: 'transparent', style: 'cursor:grab' });
      const nearDot = (e) => {
        const q = pt(csv, e),
          c = window._cur;
        return c && Math.hypot(q.x - c[0], q.y - c[1]) < 20;
      };
      r.addEventListener('pointermove', (e) => {
        if (!drag) r.style.cursor = nearDot(e) ? 'grab' : 'move';
      });
      r.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (nearDot(e)) {
          drag = { k: 'bowldot', s: csv };
          document.body.style.cursor = 'grabbing';
        } else drag = { k: 'rot', x: e.clientX, y: e.clientY, yaw, pitch };
      });
      document.getElementById('cnote').textContent =
        'Every line has a cost, so w, b and cost make a 3D surface: a bowl. Height is cost (square-root scale, so the bottom stays visible). Your line is the green dot: drag it over the bowl and the line on the left follows. Drag anywhere else to turn the bowl.';
      bowl();
      return;
    }
    if (view === 'map') {
      axes(csv, [-10, 0, 10, 20, 30, 40, 50, 60], [-40, -20, 0, 20, 40], gw, gb, 'Weight w', 'Bias b');
      const hit = el(csv, 'rect', {
        x: L,
        y: T,
        width: R - L,
        height: B - T,
        fill: 'transparent',
        style: 'cursor:crosshair',
      });
      hit.addEventListener('pointerdown', (e) => {
        const q = pt(csv, e);
        w = clamp(r2(igw(q.x)), ...WR);
        b = clamp(r2(igb(q.y)), ...BR);
        chip(null);
        drag = { k: 'wb', s: csv };
        update();
      });
      for (const k of [1.5, 3, 6, 12, 24, 48]) {
        const lev = Jmin * k;
        let d = '';
        // ellipse J(w,b)=lev: parametrise around the minimum using the quadratic form
        const a = S.sxx / S.n,
          c2 = 1,
          h = S.sx / S.n;
        for (let s = 0; s <= 96; s++) {
          const th = (s / 96) * 2 * Math.PI;
          const ux = Math.cos(th),
            uy = Math.sin(th);
          const q = a * ux * ux + 2 * h * ux * uy + c2 * uy * uy;
          const r = Math.sqrt((2 * (lev - Jmin)) / q);
          const wv = wBest + r * ux,
            bv = bBest + r * uy;
          d += (s ? 'L' : 'M') + gw(wv).toFixed(1) + ' ' + gb(bv).toFixed(1);
        }
        el(csv, 'path', {
          d,
          fill: 'none',
          stroke: 'var(--ink)',
          'stroke-width': 1,
          opacity: 0.35,
          'clip-path': 'url(#clp2)',
        });
      }
      const cp2 = el(csv, 'clipPath', { id: 'clp2' });
      el(cp2, 'rect', { x: L, y: T, width: R - L, height: B - T });
      el(csv, 'path', {
        d: `M${gw(wBest) - 7} ${gb(bBest)} h14 M${gw(wBest)} ${gb(bBest) - 7} v14`,
        stroke: 'var(--ink)',
        'stroke-width': 2,
      });
      el(csv, 'text', { x: gw(wBest) + 10, y: gb(bBest) + 18, 'font-size': 12, fill: 'var(--ink)' }, 'lowest point');
      knob(csv, 'wb', gw(w), gb(b), 'Current w and b on the cost map');
      document.getElementById('cnote').textContent =
        'The same bowl seen from straight above, like a hiking map: colour is height. Each spot is one line (w across, b up); brighter means lower cost, and each ring joins lines with the same cost. The cross is the bottom of the bowl. Drag the dot, or click anywhere.';
    } else {
      const Jw = (v) => J(v, b),
        top = Math.max(Jw(WR[0]), Jw(WR[1])),
        cy = (v) => B - Math.sqrt(v / top) * (B - T);
      axes(
        csv,
        [-10, 0, 10, 20, 30, 40, 50, 60],
        [],
        gw,
        gb,
        'Weight w (b fixed at ' + b.toFixed(1) + ')',
        'Cost J (square-root scale)',
      );
      let d = '';
      for (let i = 0; i <= 200; i++) {
        const v = WR[0] + (i / 200) * (WR[1] - WR[0]);
        d += (i ? 'L' : 'M') + gw(v).toFixed(1) + ' ' + cy(Jw(v)).toFixed(1);
      }
      el(csv, 'path', { d, fill: 'none', stroke: 'var(--ac)', 'stroke-width': 3 });
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
        const q = pt(csv, e);
        w = clamp(r2(igw(q.x)), ...WR);
        chip(null);
        drag = { k: 'cw', s: csv };
        update();
      });
      const g = el(csv, 'g', {
        class: 'handle',
        tabindex: 0,
        role: 'slider',
        'aria-label': 'Weight w on the cost curve',
        'aria-valuenow': w,
        style: 'cursor:' + (drag && drag.k === 'cw' ? 'grabbing' : 'ew-resize'),
      });
      el(g, 'circle', { cx: gw(w), cy: cy(Jw(w)), r: 24, fill: 'transparent' });
      el(g, 'circle', {
        cx: gw(w),
        cy: cy(Jw(w)),
        r: drag && drag.k === 'cw' ? 13 : 11,
        fill: 'var(--ac)',
        stroke: 'var(--sf)',
        'stroke-width': 3,
        class: 'knob',
      });
      g.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        drag = { k: 'cw', s: csv };
        document.body.style.cursor = 'grabbing';
      });
      g.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 0.5 : e.key === 'ArrowLeft' ? -0.5 : 0;
        if (!d) return;
        e.preventDefault();
        w = clamp(w + d, ...WR);
        chip(null);
        update();
        csv.querySelector('[aria-label="Weight w on the cost curve"]').focus();
      });
      document.getElementById('cnote').textContent =
        'A slice through the bowl at the current b: the cost for every w, with b fixed. Drag the dot along the curve (or click anywhere) to change w and watch the line on the left tilt.';
    }
  }
  function update() {
    drawLine();
    drawCost();
    if (view === 'bowl') bowl();
    document.getElementById('w').value = w;
    document.getElementById('b').value = b;
    document.getElementById('wv').textContent = w.toFixed(1);
    document.getElementById('bv').textContent = b.toFixed(1);
    const j = J(w, b);
    document.getElementById('J').innerHTML = j.toFixed(1) + '<small>cost J, billion² toman</small>';
    const frac = Math.min(1, Math.log(j / Jmin) / Math.log(4000 / Jmin));
    document.getElementById('jbar').style.width = Math.max(0.02, frac) * 100 + '%';
    const ratio = j / Jmin,
      same = ratio < 1.005;
    document.getElementById('jtext').innerHTML =
      (same ? '<b>This is the best possible line</b>' : 'Best possible line') +
      ': cost ' +
      Jmin.toFixed(1) +
      ', at w = ' +
      wBest.toFixed(1) +
      ', b = ' +
      bBest.toFixed(1) +
      ' (the bottom of the bowl).' +
      (same
        ? ''
        : '<br>Your line costs ' + j.toFixed(1) + ', ' + ratio.toFixed(ratio < 10 ? 1 : 0) + ' times as much.');
    const [a, p] = P[sel],
      x = a / 100,
      f = w * x + b,
      e = f - p;
    document.getElementById('f').innerHTML =
      'error = f(x<sup>(' +
      sel +
      ')</sup>) − y<sup>(' +
      sel +
      ')</sup><br>= ' +
      f.toFixed(2) +
      ' − ' +
      p.toFixed(2) +
      ' = <span class="hl">' +
      e.toFixed(2) +
      '</span><br>squared = <span class="hl">' +
      (e * e).toFixed(2) +
      '</span><br>J adds all ' +
      S.n.toLocaleString('en-US') +
      ' squared errors, ÷ (2 × ' +
      S.n.toLocaleString('en-US') +
      ')';
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
        if (c.dataset.p === 'best') {
          w = wBest;
          b = bBest;
        } else [w, b] = PRE[c.dataset.p];
        chip(c.dataset.p);
        update();
      }),
  );
  document.querySelectorAll('.seg button').forEach(
    (x) =>
      (x.onclick = () => {
        view = x.dataset.v;
        document.querySelectorAll('.seg button').forEach((y) => y.classList.toggle('on', y === x));
        paintHeat();
        update();
      }),
  );
  document.getElementById('w').oninput = (e) => {
    w = +e.target.value;
    chip(null);
    schedule();
  };
  document.getElementById('b').oninput = (e) => {
    b = +e.target.value;
    chip(null);
    schedule();
  };
  const K = (s, id) => katex.render(s, document.getElementById(id), { throwOnError: false, displayMode: true });
  K('\\text{error}^{(i)} = f_{w,b}\\big(x^{(i)}\\big) - y^{(i)}', 'm1');
  K('J(w,b) = \\frac{1}{2m}\\sum_{i=0}^{m-1}\\big(f_{w,b}(x^{(i)}) - y^{(i)}\\big)^2', 'm2');
  K('\\min_{w,\\,b}\\; J(w,b)', 'm3');
  const main = document.getElementById('main');
  ctx.load('house-train-points.json').then((d) => {
    P = d;
    stats();
    let s = 12345;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    SAMPLE = Array.from({ length: 80 }, () => Math.floor(rnd() * P.length));
    setTimeout(() => {
      main.classList.remove('skel');
      main.setAttribute('aria-busy', 'false');
      paintDots();
      paintHeat();
      update();
    }, 400);
  });
  win.addEventListener('resize', () => {
    if (P.length) {
      paintDots();
      paintHeat();
      update();
    }
  });

  return dispose;
}
