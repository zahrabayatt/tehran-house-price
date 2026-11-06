// Model Lab, step 1. Ported from the approved design draft docs/design/HouseLabStep1.html:
// the markup, then mount(), which runs the step's interactive code once its markup is on the page.
import katex from 'katex';

export const html = `<div id="main" class="skel" aria-busy="true">
    <div class="skonly" aria-hidden="true">
      <section class="card">
        <div class="sk" style="width:90px;height:14px;margin-bottom:12px"></div>
        <div class="sk" style="width:46%;height:30px;margin-bottom:12px"></div>
        <div class="sk" style="width:64%;height:16px;margin-bottom:22px"></div>
        <div class="split"><div class="sk" style="height:420px;border-radius:14px"></div><div class="sk" style="height:420px;border-radius:14px"></div></div>
      </section>
      <section class="card"><div class="sk" style="width:190px;height:32px;border-radius:999px;margin-bottom:16px"></div>
        <div class="sk" style="height:22px;margin-bottom:8px"></div><div class="sk" style="height:22px;width:88%;margin-bottom:8px"></div><div class="sk" style="height:22px;width:76%;margin-bottom:8px"></div><div class="sk" style="height:22px;width:82%"></div></section>
    </div>
    <div class="live">
    <section class="card" aria-labelledby="st">
      <span class="tag">Step 1 of 14</span>
      <h2 id="st">Data and notation</h2>
      <p class="goal">Each ad is one training example. Pick one to see how the model names it.</p>
      <div class="split">
        <figure class="plot">
          <div class="phead"><b id="ptitle">All 48,332 training ads</b><div class="seg" role="group" aria-label="View"><button class="on" data-v="scatter" type="button">Price vs area</button><button data-v="hist" type="button">How prices spread</button></div></div>
          <div class="pbox"><canvas id="dots" aria-hidden="true"></canvas><svg id="plot" viewBox="0 0 620 380" width="100%" role="img" aria-label="Asking price against area for all 48,332 training ads"></svg></div>
          <figcaption class="note" id="pnote"></figcaption>
        </figure>
        <div class="nota" aria-live="polite">
          <h3>This ad, in the model's notation</h3>
          <div class="row"><span class="sym" data-k="i"></span><span class="v" id="vi"></span><span class="d">which ad, counting from 0</span></div>
          <div class="row"><span class="sym" data-k="x"></span><span class="v" id="vx"></span><span class="d"><span id="dx"></span>, so x stays a small number</span></div>
          <div class="row"><span class="sym" data-k="y"></span><span class="v" id="vy"></span><span class="d">asking price, billion toman</span></div>
          <div class="row"><span class="sym" data-k="m"></span><span class="v" id="vm">48,332</span><span class="d">number of training ads, every dot</span></div>
        </div>
      </div>
    </section>
    </div>
  </div>`;

export const mathHtml = `<p id="m1" style="font-size:20px;margin:6px 0 10px"></p>
        <p style="color:var(--mut);margin:0">A training set is a list of examples. Each one pairs what we know about an apartment, x, with the price that was asked for it, y.</p>`;

export const skHtml = ``;

/** Runs the step. `ctx.load(name)` gives its data; the returned function stops everything it started. */
export function mount(ctx) {
  const { setTimeout, requestAnimationFrame, cancelAnimationFrame, win, dispose } = ctx.scope();

  let P = [];
  let sel = 0,
    view = 'scatter';
  const cv = document.getElementById('dots');
  const svg = document.getElementById('plot'),
    ns = 'http://www.w3.org/2000/svg';
  const L = 56,
    R = 600,
    T = 16,
    B = 330;
  function el(t, a, txt) {
    const e = document.createElementNS(ns, t);
    for (const k in a) e.setAttribute(k, a[k]);
    if (txt !== undefined) e.textContent = txt;
    svg.appendChild(e);
    return e;
  }
  function sup(x, y, base, idx, anchor, col) {
    const e = el(
      'text',
      { x: x, y: y, 'text-anchor': anchor || 'start', 'font-size': 13, 'font-weight': 600, fill: col || 'var(--ac)' },
      base,
    );
    const s = document.createElementNS(ns, 'tspan');
    s.setAttribute('dy', '-6');
    s.setAttribute('font-size', '10');
    s.textContent = '(' + idx + ')';
    e.appendChild(s);
    return e;
  }
  function axes(xs, ys, xl, yl, fx, fy) {
    ys.forEach((v) => {
      el('line', { x1: L, x2: R, y1: fy(v), y2: fy(v), stroke: 'var(--rule)' });
      el('text', { x: L - 8, y: fy(v) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--mut)' }, v);
    });
    xs.forEach((v) =>
      el('text', { x: fx(v), y: B + 18, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--mut)' }, v),
    );
    el('text', { x: (L + R) / 2, y: B + 40, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--mut)' }, xl);
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
      yl,
    );
  }
  function paintDots(fx, fy) {
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
    c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ac').trim();
    c.globalAlpha = 0.08;
    for (const [a, p] of P) {
      if (p > 80 || a > 300) continue;
      c.beginPath();
      c.arc(fx(a), fy(p), 2.2, 0, 6.283);
      c.fill();
    }
  }
  function clearDots() {
    const c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
  }
  function draw() {
    svg.innerHTML = '';
    if (!P.length) return;
    if (view !== 'scatter') clearDots();
    if (view === 'scatter') {
      const fx = (a) => L + (a / 300) * (R - L),
        fy = (p) => B - (p / 80) * (B - T);
      axes([0, 50, 100, 150, 200, 250, 300], [0, 20, 40, 60, 80], 'Area (m²)', 'Asking price (billion toman)', fx, fy);
      paintDots(fx, fy);
      const hit = el('rect', {
        x: L,
        y: T,
        width: R - L,
        height: B - T,
        fill: 'transparent',
        style: 'cursor:crosshair',
      });
      hit.addEventListener('click', (e) => {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const q = pt.matrixTransform(svg.getScreenCTM().inverse());
        let best = -1,
          bd = 1e9;
        for (let i = 0; i < P.length; i++) {
          const [a, p] = P[i];
          if (p > 80 || a > 300) continue;
          const dx = fx(a) - q.x,
            dy = fy(p) - q.y,
            d = dx * dx + dy * dy;
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
        if (best >= 0) {
          sel = best;
          draw();
          show();
        }
      });
      const [a, p] = P[sel];
      const cx = fx(Math.min(a, 300)),
        cy = fy(Math.min(p, 80));
      el('line', { x1: cx, x2: cx, y1: cy, y2: B, stroke: 'var(--ac)', 'stroke-dasharray': '4 3' });
      el('line', { x1: L, x2: cx, y1: cy, y2: cy, stroke: 'var(--ac)', 'stroke-dasharray': '4 3' });
      el('circle', { cx: cx, cy: cy, r: 8, fill: 'var(--ac)', stroke: 'var(--sf)', 'stroke-width': 2.5 });
      sup(cx, B - 6, 'x', sel, 'middle');
      sup(L + 6, cy - 6, 'y', sel);
      document.getElementById('ptitle').textContent = 'All 48,332 training ads';
      const off = P.filter(([a, p]) => p > 80 || a > 300).length;
      document.getElementById('pnote').textContent =
        'Every training ad, May to September 2024. Brighter means more ads in the same spot. ' +
        off.toLocaleString('en-US') +
        ' ads above 80 billion or 300 m² are off the chart. Click anywhere to pick the nearest ad.';
    } else {
      const W = 5,
        bins = Array(16).fill(0);
      P.forEach(([, p]) => {
        if (p < 80) bins[Math.floor(p / W)]++;
      });
      const top = Math.ceil(Math.max(...bins) / 5000) * 5000,
        fx = (p) => L + (p / 80) * (R - L),
        fy = (c) => B - (c / top) * (B - T),
        inv = (x) => ((x - L) / (R - L)) * 80;
      [0, top / 4, top / 2, (top * 3) / 4, top].forEach((v) => {
        el('line', { x1: L, x2: R, y1: fy(v), y2: fy(v), stroke: 'var(--rule)' });
        el(
          'text',
          { x: L - 8, y: fy(v) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--mut)' },
          v.toLocaleString('en-US'),
        );
      });
      [0, 20, 40, 60, 80].forEach((v) =>
        el('text', { x: fx(v), y: B + 18, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--mut)' }, v),
      );
      el(
        'text',
        { x: (L + R) / 2, y: B + 40, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--mut)' },
        'Asking price (billion toman)',
      );
      const cur = P[sel][1],
        kcur = Math.floor(cur / W);
      bins.forEach((c, k) => {
        const r = el('rect', {
          x: fx(k * W) + 1,
          y: fy(c),
          width: fx(W) - fx(0) - 2,
          height: Math.max(B - fy(c), 1),
          fill: 'var(--ac)',
          opacity: k === kcur ? 1 : 0.55,
          rx: 2,
          style: 'cursor:pointer',
        });
        const tt = document.createElementNS(ns, 'title');
        tt.textContent = c.toLocaleString('en-US') + ' ads between ' + k * W + ' and ' + (k + 1) * W + ' billion';
        r.appendChild(tt);
        r.addEventListener('click', () => {
          const ids = P.map((q, i) => [q[1], i])
            .filter(([p]) => Math.floor(p / W) === k && p < 80)
            .sort((a, b) => a[0] - b[0])
            .map((x) => x[1]);
          if (!ids.length) return;
          const at = ids.indexOf(sel);
          sel = ids[(at + 1) % ids.length];
          draw();
          show();
        });
      });
      if (cur < 80) {
        const g = document.createElementNS(ns, 'g');
        g.setAttribute('style', 'cursor:ew-resize');
        g.setAttribute('tabindex', '0');
        g.setAttribute('role', 'slider');
        g.setAttribute('aria-label', 'Chosen ad price');
        g.setAttribute('aria-valuenow', cur.toFixed(2));
        svg.appendChild(g);
        const X = fx(cur);
        [
          ['rect', { x: X - 8, y: T, width: 16, height: B - T, fill: 'transparent' }],
          ['line', { x1: X, x2: X, y1: T, y2: B, stroke: 'var(--ink)', 'stroke-width': 2 }],
          ['circle', { cx: X, cy: T + 2, r: 6, fill: 'var(--ink)' }],
        ].forEach(([tg, a]) => {
          const e = document.createElementNS(ns, tg);
          for (const k in a) e.setAttribute(k, a[k]);
          g.appendChild(e);
        });
        const lab = sup(X + (X > R - 140 ? -10 : 10), T + 28, 'y', sel, X > R - 140 ? 'end' : 'start', 'var(--ink)');
        const r2 = document.createElementNS(ns, 'tspan');
        r2.setAttribute('dy', '6');
        r2.textContent = ' = ' + cur.toFixed(2);
        lab.appendChild(r2);
        const order = P.map((q, i) => [q[1], i])
          .filter(([p]) => p < 80)
          .sort((a, b) => a[0] - b[0]);
        const nearest = (v) => order.reduce((b, o) => (Math.abs(o[0] - v) < Math.abs(b[0] - v) ? o : b))[1];
        const toVal = (e) => {
          const pt = svg.createSVGPoint();
          pt.x = e.clientX;
          pt.y = e.clientY;
          return inv(pt.matrixTransform(svg.getScreenCTM().inverse()).x);
        };
        g.addEventListener('pointerdown', (e) => {
          g.setPointerCapture(e.pointerId);
          const mv = (ev) => {
            const v = Math.max(0, Math.min(79.9, toVal(ev)));
            const n = nearest(v);
            if (n !== sel) {
              sel = n;
              show();
              moveLine();
            }
          };
          const up = () => {
            g.removeEventListener('pointermove', mv);
            g.removeEventListener('pointerup', up);
            draw();
          };
          g.addEventListener('pointermove', mv);
          g.addEventListener('pointerup', up);
        });
        function moveLine() {
          const x = fx(P[sel][1]);
          g.querySelectorAll('line').forEach((l) => {
            l.setAttribute('x1', x);
            l.setAttribute('x2', x);
          });
          g.querySelector('circle').setAttribute('cx', x);
          g.querySelector('rect').setAttribute('x', x - 8);
          lab.setAttribute('x', x + (x > R - 140 ? -10 : 10));
          lab.setAttribute('text-anchor', x > R - 140 ? 'end' : 'start');
          lab.firstChild.textContent = 'y';
          lab.childNodes[1].textContent = '(' + sel + ')';
          r2.textContent = ' = ' + P[sel][1].toFixed(2);
        }
        g.addEventListener('keydown', (e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          e.preventDefault();
          const at = order.findIndex((o) => o[1] === sel);
          const nx = order[Math.max(0, Math.min(order.length - 1, at + (e.key === 'ArrowRight' ? 1 : -1)))][1];
          sel = nx;
          draw();
          show();
          svg.querySelector('[role=slider]').focus();
        });
      }
      document.getElementById('ptitle').textContent = 'How asking prices spread';
      document.getElementById('pnote').textContent =
        'Click a bar to pick an ad in that price range (click again for the next one), or drag the line. Most ads ask under 20 billion; a few very expensive ones stretch the right side.';
    }
  }
  function tex(s, e) {
    katex.render(s, e, { throwOnError: false });
  }
  document
    .querySelectorAll('[data-k]')
    .forEach((e) => tex({ i: 'i', x: 'x^{(i)}', y: 'y^{(i)}', m: 'm' }[e.dataset.k], e));
  tex('(x^{(i)},\\ y^{(i)})\\quad \\text{for } i = 0, 1, \\dots, m-1', document.getElementById('m1'));
  function show() {
    const [a, p] = P[sel];
    document.getElementById('vi').textContent = sel;
    document.getElementById('vx').textContent = (a / 100).toFixed(2);
    document.getElementById('dx').textContent = a + ' m² ÷ 100';
    document.getElementById('vy').textContent = p.toFixed(2);
  }
  document.querySelectorAll('.seg button').forEach(
    (b) =>
      (b.onclick = () => {
        view = b.dataset.v;
        document.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b));
        draw();
      }),
  );
  const main = document.getElementById('main');
  function loading(on) {
    main.classList.toggle('skel', on);
    main.setAttribute('aria-busy', on);
  }
  const t0 = performance.now();
  ctx.load('house-train-points.json').then((d) => {
    P = d;
    sel = 0;
    setTimeout(
      () => {
        loading(false);
        draw();
        show();
      },
      Math.max(0, 500 - (performance.now() - t0)),
    );
  });
  win.addEventListener('resize', () => {
    if (!main.classList.contains('skel')) draw();
  });

  return dispose;
}
