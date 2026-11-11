// Model Lab, step 3. Ported from the approved design draft docs/design/HouseLabStep3.html:
// the markup, then mount(), which runs the step's interactive code once its markup is on the page.
import katex from 'katex';

export const html = `<div id="main" class="skel" aria-busy="true">
    <div class="skonly" aria-hidden="true">
      <section class="card"><div class="sk" style="width:90px;height:14px;margin-bottom:12px"></div><div class="sk" style="width:36%;height:30px;margin-bottom:12px"></div><div class="sk" style="width:70%;height:16px;margin-bottom:22px"></div>
        <div class="split"><div class="sk" style="height:500px;border-radius:14px"></div><div class="sk" style="height:500px;border-radius:14px"></div></div></section>
    </div>
    <div class="live">
    <section class="card" aria-labelledby="st">
      <span class="tag">Step 3 of 15</span>
      <h2 id="st">The model</h2>
      <p class="goal">The simplest model is a straight line. Drag its two handles, or the sliders, and click any ad to see what the line predicts for it.</p>
      <div class="split">
        <figure class="plot">
          <div class="phead"><b>All 48,332 training ads, and your line</b></div>
          <div class="pbox"><canvas id="dots" aria-hidden="true"></canvas><svg id="plot" viewBox="0 0 620 380" width="100%" role="group" aria-label="Training ads with a line set by w and b"></svg></div>
          <div class="sliders">
            <div class="sl"><label for="w">Weight w <b id="wv"></b></label><input id="w" type="range" min="-10" max="60" step="0.5"></div>
            <div class="sl"><label for="b">Bias b <b id="bv"></b></label><input id="b" type="range" min="-50" max="40" step="0.5"></div>
          </div>
          <figcaption class="note">Drag the left handle or the line itself to move it up and down (b). Drag the right handle to tilt it (w). Click any ad to pick it.</figcaption>
        </figure>
        <div class="side" aria-live="polite">
          <h3>For the chosen ad</h3>
          <div class="formula" id="f"></div>
          <div class="cmp"><span>The line says</span><b id="pred"></b><span>The ad asked</span><b id="act"></b></div>
          <div class="meaning">
            <div id="mw"></div>
            <div id="mb"></div>
          </div>
        </div>
      </div>
      <div class="chips" role="group" aria-label="Try these lines"><span class="try">Try:</span><button class="chip" data-p="flat" type="button">Flat line</button><button class="chip" data-p="steep" type="button">Too steep</button></div>
      <p class="pnote" id="pnote"></p>
    </section>
    </div>
  </div>`;

export const mathHtml = `<p id="m1" style="font-size:21px;margin:6px 0 4px"></p>
        <div class="nrow"><span id="n1"></span><span style="color:var(--mut)">weight: how much the price changes for each extra 100 m²</span><span id="n2"></span><span style="color:var(--mut)">bias: the line's value at x = 0</span><span id="n3"></span><span style="color:var(--mut)">the model's prediction for ad i</span></div>`;

export const skHtml = ``;

/** Runs the step. `ctx.load(name)` gives its data; the returned function stops everything it started. */
export function mount(ctx) {
  const { setTimeout, requestAnimationFrame, cancelAnimationFrame, win, dispose } = ctx.scope();

  const svg = document.getElementById('plot'),
    cv = document.getElementById('dots'),
    ns = 'http://www.w3.org/2000/svg';
  const L = 56,
    R = 600,
    T = 16,
    B = 330,
    XM = 3,
    YM = 80,
    YN = -20;
  const fx = (x) => L + (x / XM) * (R - L),
    fy = (y) => B - ((y - YN) / (YM - YN)) * (B - T),
    ix = (X) => ((X - L) / (R - L)) * XM,
    iy = (Y) => YN + ((B - Y) / (B - T)) * (YM - YN);
  const PRE = {
    flat: [0, 6.5, 'Flat line: every ad gets the same price, whatever its size. Big flats are badly underpriced.'],
    steep: [55, -20, 'Too steep: small flats come out too cheap, even below zero, and big flats far too expensive.'],
    good: [
      25,
      -12,
      'A good guess: the line goes through the middle of the cloud. Step 4 measures how good, and step 6 finds the best line by itself.',
    ],
  };
  let P = [],
    w = 10,
    b = 0,
    sel = 0,
    raf = 0;
  function el(t, a, txt, par) {
    const e = document.createElementNS(ns, t);
    for (const k in a) e.setAttribute(k, a[k]);
    if (txt !== undefined) e.textContent = txt;
    (par || svg).appendChild(e);
    return e;
  }
  function paintDots() {
    const r = svg.getBoundingClientRect(),
      dpr = window.devicePixelRatio || 1,
      s = r.width / 620;
    cv.style.width = r.width + 'px';
    cv.style.height = r.height + 'px';
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    const c = cv.getContext('2d');
    c.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
    c.clearRect(0, 0, 620, 380);
    c.fillStyle = getComputedStyle(document.getElementById('main')).getPropertyValue('--ac').trim();
    c.globalAlpha = 0.07;
    for (const [a, p] of P) {
      const x = a / 100;
      if (x > XM || p > YM) continue;
      c.beginPath();
      c.arc(fx(x), fy(p), 2.1, 0, 6.283);
      c.fill();
    }
  }
  function clip() {
    // segment of y=w x+b inside the box
    let pts = [];
    const ys = [
      [0, b],
      [XM, w * XM + b],
    ];
    const inside = (x, y) => x >= 0 && x <= XM && y >= YN && y <= YM;
    for (const [x, y] of ys) if (inside(x, y)) pts.push([x, y]);
    if (w !== 0) {
      for (const yy of [YN, YM]) {
        const x = (yy - b) / w;
        if (x > 0 && x < XM) pts.push([x, yy]);
      }
    }
    pts.sort((a, b) => a[0] - b[0]);
    return pts.length >= 2 ? [pts[0], pts[pts.length - 1]] : null;
  }
  function draw() {
    svg.innerHTML = '';
    [-20, 0, 20, 40, 60, 80].forEach((v) => {
      el('line', {
        x1: L,
        x2: R,
        y1: fy(v),
        y2: fy(v),
        stroke: v === 0 ? 'var(--mut)' : 'var(--rule)',
        'stroke-width': v === 0 ? 1.5 : 1,
      });
      el('text', { x: L - 8, y: fy(v) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--mut)' }, v);
    });
    [0, 50, 100, 150, 200, 250, 300].forEach((v) =>
      el('text', { x: fx(v / 100), y: B + 18, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--mut)' }, v),
    );
    el(
      'text',
      { x: (L + R) / 2, y: B + 40, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--mut)' },
      'Area (m²)',
    );
    el(
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
    const hit = el('rect', { x: L, y: T, width: R - L, height: B - T, fill: 'transparent', style: 'cursor:crosshair' });
    hit.addEventListener('click', (e) => {
      const q = pt(e);
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
    const seg = clip();
    if (seg) {
      el('line', {
        x1: fx(seg[0][0]),
        y1: fy(seg[0][1]),
        x2: fx(seg[1][0]),
        y2: fy(seg[1][1]),
        stroke: 'var(--line)',
        'stroke-width': 3,
        'stroke-linecap': 'round',
      });
      const body = el('line', {
        x1: fx(seg[0][0]),
        y1: fy(seg[0][1]),
        x2: fx(seg[1][0]),
        y2: fy(seg[1][1]),
        stroke: 'transparent',
        'stroke-width': 22,
        style: 'cursor:grab',
      });
      body.addEventListener('pointerdown', (e) => startDrag(e, 'line'));
    }
    // chosen ad: actual and prediction
    const [a, p] = P[sel],
      x = a / 100,
      f = w * x + b;
    if (x <= XM) {
      const yA = fy(Math.min(p, YM)),
        yF = fy(Math.max(YN, Math.min(f, YM)));
      el('line', { x1: fx(x), x2: fx(x), y1: yA, y2: yF, stroke: 'var(--mut)', 'stroke-dasharray': '3 3' });
      el('circle', { cx: fx(x), cy: yA, r: 7, fill: 'var(--ac)', stroke: 'var(--sf)', 'stroke-width': 2 });
      if (f >= YN && f <= YM) {
        el('circle', { cx: fx(x), cy: yF, r: 6, fill: 'var(--sf)', stroke: 'var(--line)', 'stroke-width': 3 });
      }
    }
    handle('b', 0, b, 'Bias b, the line at 0 m²');
    handle('w', XM, w * XM + b, 'Weight w, tilts the line');
  }
  function pt(e) {
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }
  let drag = null,
    touched = false;
  function startDrag(e, k) {
    e.preventDefault();
    drag = { k, y0: iy(pt(e).y), b0: b };
    touched = true;
    document.body.style.cursor = k === 'line' ? 'grabbing' : 'ns-resize';
    schedule();
  }
  win.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const v = iy(pt(e).y);
    if (drag.k === 'b') b = clamp(Math.round(v * 2) / 2, -50, 40);
    else if (drag.k === 'w') w = clamp(Math.round(((v - b) / XM) * 2) / 2, -10, 60);
    else b = clamp(Math.round((drag.b0 + v - drag.y0) * 2) / 2, -50, 40);
    setChip(null);
    schedule();
  });
  win.addEventListener('pointerup', () => {
    if (drag) {
      drag = null;
      document.body.style.cursor = '';
      schedule();
    }
  });
  function handle(k, x, y, label) {
    const g = el('g', {
      class: 'handle',
      tabindex: 0,
      role: 'slider',
      'aria-label': label,
      'aria-valuenow': k === 'w' ? w : b,
      style: 'cursor:' + (drag && drag.k === k ? 'grabbing' : 'grab'),
    });
    const Y = fy(Math.max(YN, Math.min(YM, y))),
      X = fx(x),
      active = drag && drag.k === k;
    if (!touched) {
      const ring = el(
        'circle',
        { cx: X, cy: Y, r: 12, fill: 'none', stroke: 'var(--ac)', 'stroke-width': 2, class: 'pulse' },
        undefined,
        g,
      );
    }
    el('circle', { cx: X, cy: Y, r: 24, fill: 'transparent' }, undefined, g);
    el(
      'circle',
      { cx: X, cy: Y, r: active ? 13 : 11, fill: 'var(--ac)', stroke: 'var(--sf)', 'stroke-width': 3, class: 'knob' },
      undefined,
      g,
    );
    if (!touched) {
      const tx = el(
        'text',
        {
          x: X + (k === 'b' ? 20 : -20),
          y: k === 'b' ? Y + 32 : Y - 18,
          'text-anchor': k === 'b' ? 'start' : 'end',
          'font-size': 13,
          'font-weight': 600,
          fill: 'var(--on)',
        },
        k === 'b' ? 'b: drag up or down' : 'w: drag to tilt',
        g,
      );
      const bb = tx.getBBox();
      const pill = document.createElementNS(ns, 'rect');
      pill.setAttribute('x', bb.x - 8);
      pill.setAttribute('y', bb.y - 4);
      pill.setAttribute('width', bb.width + 16);
      pill.setAttribute('height', bb.height + 8);
      pill.setAttribute('rx', 8);
      pill.setAttribute('fill', 'var(--ac)');
      g.insertBefore(pill, tx);
    } else
      el(
        'text',
        {
          x: X + (k === 'b' ? 16 : -16),
          y: Y - 14,
          'text-anchor': k === 'b' ? 'start' : 'end',
          'font-size': 14,
          'font-weight': 700,
          fill: 'var(--ac)',
        },
        k,
        g,
      );
    g.addEventListener('pointerdown', (e) => startDrag(e, k));
    g.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowUp' ? 0.5 : e.key === 'ArrowDown' ? -0.5 : 0;
      if (!d) return;
      e.preventDefault();
      if (k === 'b') b = clamp(b + d, -50, 40);
      else w = clamp(w + d, -10, 60);
      setChip(null);
      update();
      svg.querySelector('[aria-label="' + label + '"]').focus();
    });
  }
  const clamp = (v, a, c) => Math.max(a, Math.min(c, v));
  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      update();
    });
  }
  const n = (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2),
    n1 = (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
  function update() {
    draw();
    document.getElementById('w').value = w;
    document.getElementById('b').value = b;
    document.getElementById('wv').textContent = n1(w);
    document.getElementById('bv').textContent = n1(b);
    const [a, p] = P[sel],
      x = a / 100,
      f = w * x + b;
    document.getElementById('f').innerHTML =
      'f(x<sup>(' +
      sel +
      ')</sup>) = w · x + b<br>= ' +
      n1(w) +
      ' × ' +
      x.toFixed(2) +
      ' + ' +
      (b < 0 ? '(' + n1(b) + ')' : n1(b)) +
      '<br>= <span class="hl">' +
      n(f) +
      ' billion</span>';
    document.getElementById('pred').textContent = n(f);
    document.getElementById('act').textContent = p.toFixed(2);
    document.getElementById('mw').innerHTML =
      '<b>w = ' +
      n1(w) +
      '</b>: each extra 100 m² ' +
      (w >= 0 ? 'adds ' : 'takes away ') +
      Math.abs(w).toFixed(1) +
      ' billion.';
    document.getElementById('mb').innerHTML =
      '<b>b = ' + n1(b) + "</b>: the line's value at 0 m², where it starts on the left.";
  }
  function setChip(k) {
    document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.p === k));
    if (k) document.getElementById('pnote').textContent = PRE[k][2];
    else document.getElementById('pnote').textContent = '';
  }
  document.querySelectorAll('.chip').forEach(
    (c) =>
      (c.onclick = () => {
        [w, b] = PRE[c.dataset.p];
        setChip(c.dataset.p);
        update();
      }),
  );
  document.getElementById('w').oninput = (e) => {
    w = +e.target.value;
    setChip(null);
    schedule();
  };
  document.getElementById('b').oninput = (e) => {
    b = +e.target.value;
    setChip(null);
    schedule();
  };
  const K = (s, id) => katex.render(s, document.getElementById(id), { throwOnError: false });
  K('f_{w,b}\\big(x^{(i)}\\big) = w\\,x^{(i)} + b', 'm1');
  K('w', 'n1');
  K('b', 'n2');
  K('f_{w,b}(x^{(i)})', 'n3');
  const main = document.getElementById('main');
  ctx.load('house-train-points.json').then((d) => {
    P = d;
    setTimeout(() => {
      main.classList.remove('skel');
      main.setAttribute('aria-busy', 'false');
      paintDots();
      update();
    }, 400);
  });
  win.addEventListener('resize', () => {
    if (P.length) {
      paintDots();
      update();
    }
  });

  return dispose;
}
