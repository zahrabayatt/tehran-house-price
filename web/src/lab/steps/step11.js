// Model Lab, step 11. Ported from the approved design draft docs/design/HouseLabStep11.html:
// the markup, then mount(), which runs the step's interactive code once its markup is on the page.
import katex from 'katex';

export const html = `<div id="main" class="skel" aria-busy="true">
    <div class="skonly" aria-hidden="true">
      <section class="card"><div class="sk" style="width:90px;height:14px;margin-bottom:12px"></div><div class="sk" style="width:36%;height:30px;margin-bottom:12px"></div><div class="sk" style="width:70%;height:16px;margin-bottom:22px"></div>
        <div class="trio"><div class="sk" style="height:190px;border-radius:14px"></div><div class="sk" style="height:190px;border-radius:14px"></div><div class="sk" style="height:190px;border-radius:14px"></div></div>
        <div class="sk" style="height:420px;border-radius:14px;margin-top:18px"></div></section>
    </div>
    <div class="live">
    <section class="card" aria-labelledby="st">
      <span class="tag">Step 11 of 14</span>
      <h2 id="st">Feature engineering</h2>
      <p class="goal">The model can only learn from the features you give it. Here is the feature that made this model good, built from what everyone in Tehran already knows: where a flat is matters as much as how big it is.</p>

      <h3 class="sub">Same size, very different price</h3>
      <div class="trio" id="trio"></div>
      <p class="note2" id="trioNote"></p>

      <div class="two" style="margin-top:18px">
        <div class="box"><h3>Build a location feature</h3>
          <p class="zf">location = area × the neighborhood's usual price per m²</p>
          <p class="small">The usual price is the median price per m² of that neighborhood's training ads. <span id="hoodsN"></span> neighborhoods have at least 30 ads; any other ad uses the Tehran median, <span id="fb"></span> million toman per m².</p>
          <p class="small"><b>Only training ads.</b> The medians never look at the months the model is tested on, so the test stays fair (step 14).</p></div>
        <div class="box"><h3>For the three flats</h3><table class="zt" id="locT"></table></div>
      </div>

      <figure class="plot" style="margin-top:18px">
        <div class="phead"><b id="scT">Price against area</b><div class="seg" role="group" aria-label="Feature on the axis"><button class="on" data-f="area" type="button">Area</button><button data-f="loc" type="button">Location</button><button data-f="loc2" type="button">Location, curved</button></div></div>
        <div class="pbox"><canvas id="dots" aria-hidden="true"></canvas><svg id="sc" viewBox="0 0 1060 400" width="100%" role="img" aria-label="Every training ad: the chosen feature across, the asked price up, with the best fit"></svg>
          <div class="hud"><span>features</span><b id="hF"></b><span>best cost</span><b class="jv" id="hJ"></b></div></div>
        <figcaption class="note" id="scNote"></figcaption>
      </figure>
    </section>

    <section class="card" aria-labelledby="st2">
      <h2 id="st2" class="h2b">Which features earn their place</h2>
      <p class="goal">The best training cost for each set of features the real training run tried. Lower is better.</p>
      <div class="ladder" id="ladder"></div>
      <p class="small">Squaring a feature lets a straight-line model bend: f is still w · x + b, only some x are squares. Adding features always lowers the training cost, so the real test is on months the model has never seen: steps 12 to 14.</p>
    </section>
    </div>
  </div>`;

export const mathHtml = `<div class="mrow" tabindex="0"><span id="m1"></span><p>The new feature: area times the neighborhood's median price per m².</p></div>
        <div class="mrow" tabindex="0"><span id="m2"></span><p>Squared features let the fit curve. It is still linear regression: the prediction is a weighted sum, linear in w.</p></div>`;

export const skHtml = `<pre>from sklearn.preprocessing import PolynomialFeatures</pre><p>Builds squares (and products) of features.</p>
        <pre>poly = PolynomialFeatures(degree=2, include_bias=False)</pre><p>Degree 2: each feature and its square.</p>
        <pre>X_poly = poly.fit_transform(X)</pre><p>The location feature has no built-in equivalent; it stays hand-written, as above.</p>`;

/** Runs the step. `ctx.load(name)` gives its data; the returned function stops everything it started. */
export function mount(ctx) {
  const { setTimeout, requestAnimationFrame, cancelAnimationFrame, win, dispose } = ctx.scope();

  const ns = 'http://www.w3.org/2000/svg',
    svg = document.getElementById('sc'),
    cv = document.getElementById('dots');
  const L = 60,
    R = 1030,
    T = 14,
    B = 344,
    PY = 60;
  // best training cost of each feature set, from the real training run (model.json, lambda 0)
  const LADDER = [
    ['Area alone', 'area', 33.27],
    ['Area and the other five fields', 'area, bedrooms, age, parking, elevator, storage', 31.29],
    ['Location alone', 'one engineered feature', 19.11],
    ['Location and the other six fields', 'all seven features', 17.39],
    ['Plus area² and location²', 'nine features', 16.07, true],
  ];
  let D = null,
    feat = 'area',
    fits = {};
  const clamp = (v, a, c) => Math.max(a, Math.min(c, v));
  function el(par, t, a, txt) {
    const e = document.createElementNS(ns, t);
    for (const kk in a) e.setAttribute(kk, a[kk]);
    if (txt !== undefined) e.textContent = txt;
    par.appendChild(e);
    return e;
  }
  function solve(M, v) {
    const n = v.length;
    M = M.map((r) => r.slice());
    v = v.slice();
    for (let i = 0; i < n; i++) {
      let p = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
      [M[i], M[p]] = [M[p], M[i]];
      [v[i], v[p]] = [v[p], v[i]];
      for (let r = i + 1; r < n; r++) {
        const f = M[r][i] / M[i][i];
        for (let c = i; c < n; c++) M[r][c] -= f * M[i][c];
        v[r] -= f * v[i];
      }
    }
    const x = Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = v[i];
      for (let c = i + 1; c < n; c++) s -= M[i][c] * x[c];
      x[i] = s / M[i][i];
    }
    return x;
  }
  // least squares on columns built by phi(row); returns weights (last is b) and the cost J
  function fit(phi) {
    const k = phi(D.rows[0]).length + 1,
      G = Array.from({ length: k }, () => Array(k).fill(0)),
      h = Array(k).fill(0);
    for (const r of D.rows) {
      const a = phi(r).concat(1),
        y = r[2];
      for (let i = 0; i < k; i++) {
        h[i] += a[i] * y;
        for (let j = 0; j < k; j++) G[i][j] += a[i] * a[j];
      }
    }
    const w = solve(G, h);
    let s = 0;
    for (const r of D.rows) {
      const a = phi(r).concat(1);
      let p = 0;
      for (let i = 0; i < k; i++) p += a[i] * w[i];
      s += (p - r[2]) ** 2;
    }
    return {
      w,
      J: s / (2 * D.rows.length),
      f: (x) => {
        const a = phi([x, x]).concat(1);
        let p = 0;
        for (let i = 0; i < k; i++) p += a[i] * w[i];
        return p;
      },
    };
  }
  const CFG = {
    area: {
      t: 'Price against area',
      x: 'Area (m²)',
      X: (r) => r[0],
      max: 300,
      ticks: [0, 50, 100, 150, 200, 250, 300],
      phi: (r) => [r[0]],
      lab: 'area',
    },
    loc: {
      t: 'Price against the location feature',
      x: 'Location: area × neighborhood price per m² (billion toman)',
      X: (r) => r[1],
      max: 60,
      ticks: [0, 10, 20, 30, 40, 50, 60],
      phi: (r) => [r[1]],
      lab: 'location',
    },
    loc2: {
      t: 'Price against location, with a curve',
      x: 'Location: area × neighborhood price per m² (billion toman)',
      X: (r) => r[1],
      max: 60,
      ticks: [0, 10, 20, 30, 40, 50, 60],
      phi: (r) => [r[1], r[1] * r[1]],
      lab: 'location, location²',
    },
  };
  const NOTE = {
    area: 'Every training ad: area across, asked price up. At any size the prices fan out widely, because area knows nothing about where the flat is. The line is the best any weight can do.',
    loc: 'The same ads against the location feature. The cloud hugs the line far more tightly: one feature that knows the neighborhood nearly halves the cost.',
    loc2: 'Adding location² as a second feature lets the line bend where expensive flats rise faster. The cost drops a little more.',
  };
  function fitCanvas() {
    const r = svg.getBoundingClientRect(),
      dpr = window.devicePixelRatio || 1,
      s = r.width / 1060;
    cv.style.width = r.width + 'px';
    cv.style.height = r.height + 'px';
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    const c = cv.getContext('2d');
    c.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
    c.clearRect(0, 0, 1060, 400);
    return c;
  }
  function drawScatter() {
    const C = CFG[feat],
      F = fits[feat],
      fx = (v) => L + (v / C.max) * (R - L),
      fy = (v) => B - (v / PY) * (B - T);
    document.getElementById('scT').textContent = C.t;
    document.getElementById('scNote').textContent = NOTE[feat];
    document.getElementById('hF').textContent = C.lab;
    document.getElementById('hJ').textContent = F.J.toFixed(2);
    const c = fitCanvas();
    c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ac').trim();
    c.globalAlpha = 0.07;
    for (const r of D.rows) {
      const x = C.X(r);
      if (x > C.max || r[2] > PY) continue;
      c.beginPath();
      c.arc(fx(x), fy(r[2]), 1.8, 0, 6.283);
      c.fill();
    }
    svg.innerHTML = '';
    [0, 10, 20, 30, 40, 50, 60].forEach((v) => {
      el(svg, 'line', { x1: L, x2: R, y1: fy(v), y2: fy(v), stroke: 'var(--rule)' });
      el(svg, 'text', { x: L - 8, y: fy(v) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--mut)' }, v);
    });
    C.ticks.forEach((v) =>
      el(svg, 'text', { x: fx(v), y: B + 18, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--mut)' }, v),
    );
    el(svg, 'text', { x: (L + R) / 2, y: B + 42, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--mut)' }, C.x);
    el(
      svg,
      'text',
      {
        x: 16,
        y: (T + B) / 2,
        'text-anchor': 'middle',
        'font-size': 13,
        fill: 'var(--mut)',
        transform: 'rotate(-90 16 ' + (T + B) / 2 + ')',
      },
      'Asked price (billion toman)',
    );
    let d = '',
      pen = false;
    for (let i = 0; i <= 240; i++) {
      const x = (i / 240) * C.max,
        y = F.f(x);
      if (y < 0 || y > PY) {
        pen = false;
        continue;
      }
      d += (pen ? 'L' : 'M') + fx(x).toFixed(1) + ' ' + fy(y).toFixed(1);
      pen = true;
    }
    el(svg, 'path', { d, fill: 'none', stroke: 'var(--warn)', 'stroke-width': 3, 'stroke-linecap': 'round' });
    // the three flats
    D.examples.forEach((e, i) => {
      const x = fx(feat === 'area' ? e.area : e.loc),
        y = fy(e.price);
      el(svg, 'circle', { cx: x, cy: y, r: 7, fill: 'var(--sf)', stroke: 'var(--ink)', 'stroke-width': 2.5 });
      const g = el(svg, 'g', {}),
        bg = el(g, 'rect', { rx: 6, fill: 'var(--sf)', stroke: 'var(--rule)' }),
        tx = el(
          g,
          'text',
          { x: x - 14, y: y + 4, 'text-anchor': 'end', 'font-size': 12, 'font-weight': 600, fill: 'var(--ink)' },
          e.hood,
        ),
        bb = tx.getBBox();
      bg.setAttribute('x', bb.x - 6);
      bg.setAttribute('y', bb.y - 3);
      bg.setAttribute('width', bb.width + 12);
      bg.setAttribute('height', bb.height + 6);
    });
  }
  function drawTrio() {
    const fa = fits.area,
      fl = fits.loc,
      mx = Math.max(...D.examples.map((e) => Math.max(e.price, fa.f(e.area), fl.f(e.loc)))) * 1.1;
    document.getElementById('trio').innerHTML = D.examples
      .map((e) => {
        const pa = fa.f(e.area),
          pl = fl.f(e.loc),
          bar = (v, c) => `<span class="tr"><i style="width:${(v / mx) * 100}%;background:${c}"></i></span>`;
        return `<div class="flat"><div class="hd"><b>${e.hood}</b><span>${e.area} m²</span></div>
      <div class="rowb"><span>Asked</span>${bar(e.price, 'var(--ink)')}<b>${e.price.toFixed(2)}</b></div>
      <div class="rowb"><span>Area model</span>${bar(pa, 'var(--warn)')}<b>${pa.toFixed(2)}</b></div>
      <div class="rowb"><span>Location model</span>${bar(pl, 'var(--ac)')}<b>${pl.toFixed(2)}</b></div></div>`;
      })
      .join('');
    document.getElementById('trioNote').textContent =
      'Three real training ads of the same size, in billion toman. The area model only sees size, so it gives all three nearly the same price. The location model, built from the neighborhood, tells them apart.';
    document.getElementById('locT').innerHTML =
      '<tr><th>Flat</th><th>area × price per m² / 1000</th><th style="text-align:right">Location</th></tr>' +
      D.examples
        .map(
          (e) =>
            `<tr><td>${e.hood}</td><td>${e.area} × ${e.ppm2} / 1000</td><td class="z">${e.loc.toFixed(2)}</td></tr>`,
        )
        .join('');
  }
  function drawLadder() {
    const top = LADDER[0][2];
    document.getElementById('ladder').innerHTML = LADDER.map(
      ([t, s, j, live]) =>
        `<div class="rung${live ? ' live' : j < 20 ? ' on' : ''}"><span class="lb">${t}${live ? '<span class="tag2">live model</span>' : ''}<small>${s}</small></span><span class="tr"><i style="width:${(j / top) * 100}%"></i></span><b>${j.toFixed(2)}</b></div>`,
    ).join('');
  }
  document.querySelectorAll('.seg[aria-label="Feature on the axis"] button').forEach(
    (b) =>
      (b.onclick = () => {
        feat = b.dataset.f;
        document
          .querySelectorAll('.seg[aria-label="Feature on the axis"] button')
          .forEach((x) => x.classList.toggle('on', x === b));
        drawScatter();
      }),
  );
  const K = (s, id) => katex.render(s, document.getElementById(id), { throwOnError: false, displayMode: true });
  K(
    'x_{\\text{location}} = \\text{area} \\times \\text{median price per m}^2\\text{ of the neighborhood} \\,/\\, 1000',
    'm1',
  );
  K('f(\\mathbf{x}) = w_1\\,x_{\\text{location}} + w_2\\,x_{\\text{location}}^2 + \\dots + b', 'm2');
  const main = document.getElementById('main');
  ctx.load('house-train-loc.json').then((d) => {
    D = d;
    for (const k in CFG) fits[k] = fit(CFG[k].phi);
    document.getElementById('hoodsN').textContent = D.hoods;
    document.getElementById('fb').textContent = D.fallback;
    setTimeout(() => {
      main.classList.remove('skel');
      main.setAttribute('aria-busy', 'false');
      drawTrio();
      drawScatter();
      drawLadder();
    }, 300);
  });
  win.addEventListener('resize', () => {
    if (D) drawScatter();
  });

  return dispose;
}
