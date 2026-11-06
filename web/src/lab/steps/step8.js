// Model Lab, step 8. Ported from the approved design draft docs/design/HouseLabStep8.html:
// the markup, then mount(), which runs the step's interactive code once its markup is on the page.
import katex from 'katex';

export const html = `<div id="main" class="skel" aria-busy="true">
    <div class="skonly" aria-hidden="true">
      <section class="card"><div class="sk" style="width:90px;height:14px;margin-bottom:12px"></div><div class="sk" style="width:36%;height:30px;margin-bottom:12px"></div><div class="sk" style="width:70%;height:16px;margin-bottom:22px"></div>
        <div class="sk" style="height:110px;border-radius:14px;margin-bottom:16px"></div>
        <div class="two"><div class="sk" style="height:470px;border-radius:14px"></div><div class="sk" style="height:470px;border-radius:14px"></div></div></section>
    </div>
    <div class="live">
    <section class="card" aria-labelledby="st">
      <span class="tag">Step 8 of 14</span>
      <h2 id="st">Multiple features</h2>
      <p class="goal">Area alone cannot explain a price. Give the model four features, each with its own weight, and train all the weights together with the same gradient descent as step 6.</p>

      <div class="player" role="group" aria-label="Training controls">
        <div class="prow">
          <button id="play" class="play" type="button" aria-label="Start training"><svg id="playIcon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg></button>
          <button id="step" class="ibtn" type="button" aria-label="One step"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l10 7-10 7zM17 5h3v14h-3z" fill="currentColor"/></svg><span>Step</span></button>
          <button id="reset" class="ibtn" type="button" aria-label="Reset: back to the start"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v5h5"/></svg><span>Reset</span></button>
          <div class="scrub"><input id="scrub" type="range" min="0" max="500" value="0" aria-label="Step in the training"><div class="slab"><span>step <b id="sk">0</b> of <b id="sn">500</b></span><span id="conv"></span></div></div>
        </div>
        <div class="prow opts">
          <div class="opt"><span>Learning rate α</span><div class="seg alph" role="group" aria-label="Learning rate"><button data-a="0.00002" type="button">0.00002 <em>slow</em></button><button class="on" data-a="0.00015" type="button">0.00015 <em>good</em></button><button data-a="0.0002" type="button">0.0002 <em>too big</em></button></div></div>
          <div class="opt"><span>Steps</span><div class="seg iters" role="group" aria-label="Number of steps"><button class="on" data-n="500" type="button">500</button><button data-n="2000" type="button">2,000</button><button data-n="10000" type="button">10,000</button></div></div>
          <p class="anote" id="anote"></p><span class="sandbox">Sandbox: the live model is not changed.</span>
        </div>
      </div>

      <div class="two">
        <figure class="plot">
          <div class="phead"><b>Predicted against asked price</b></div>
          <div class="pbox"><canvas id="dots" aria-hidden="true"></canvas><svg id="plot" viewBox="0 0 520 380" width="100%" role="img" aria-label="Each ad: asked price across, the model's prediction up"></svg>
            <div class="hud"><span>step</span><b id="hS"></b><span>cost</span><b class="jv" id="hJ"></b></div></div>
          <figcaption class="note">Each dot is one of the 48,332 ads: its asked price across, the model's prediction up. A perfect model would put every dot on the diagonal; watch the cloud gather around it as the weights learn.</figcaption>
        </figure>
        <figure class="plot">
          <div class="phead"><b>The weights, as they learn</b></div>
          <div class="wbars" id="wbars"></div>
          <figcaption class="note">Each bar is one weight; the tick is the best value for that weight. Area finds its weight quickly. Bedrooms, parking and b crawl, because their features are on much smaller scales. Step 10 fixes that.</figcaption>
        </figure>
      </div>
      <div class="wide">
        <figure class="plot">
          <div class="phead"><b>Cost after each step</b></div>
          <div class="pbox"><svg id="hist" viewBox="0 0 1060 190" width="100%" role="img" aria-label="Cost after each step"></svg></div>
          <figcaption class="note">Cost is on a log scale. The number at the tip is the current cost, and in brackets its change from the step before.</figcaption>
        </figure>
      </div>

      <div class="meter" aria-live="polite">
        <div class="box"><h3>Where it stands</h3><p id="status" style="margin:0;font-size:15px;line-height:1.55"></p></div>
        <div class="box"><h3>One ad, with the current weights</h3><div class="formula" id="f"></div></div>
      </div>
    </section>
    </div>
  </div>`;

export const mathHtml = `<div class="mrow" tabindex="0"><span id="m1"></span><p>Each weight says how much the price changes when that feature grows by one, with the others held fixed.</p></div>
        <div class="mrow" tabindex="0"><span id="m2"></span><p>One slope per weight. The error is shared; each slope multiplies it by that weight's own feature.</p></div>`;

export const skHtml = ``;

/** Runs the step. `ctx.load(name)` gives its data; the returned function stops everything it started. */
export function mount(ctx) {
  const { setTimeout, requestAnimationFrame, cancelAnimationFrame, win, dispose } = ctx.scope();

  const ns = 'http://www.w3.org/2000/svg',
    svg = document.getElementById('plot'),
    hsv = document.getElementById('hist'),
    cv = document.getElementById('dots');
  const L = 52,
    R = 505,
    T = 14,
    B = 330,
    PM = 80;
  const fx = (v) => L + (v / PM) * (R - L),
    fy = (v) => B - ((v + 10) / (PM + 10)) * (B - T);
  const NAMES = ['Area', 'Bedrooms', 'Age', 'Parking', 'b (bias)'],
    UNIT = ['per m²', 'per bedroom', 'per year', 'if parking', ''];
  const ANOTE = {
    0.00002: 'Slow: every step is tiny. After 500 steps even area has not reached its best weight.',
    0.00015:
      "Good: about as large as α can be here. Area learns fast, but bedrooms, parking and b still crawl, because their numbers are much smaller than area's.",
    0.0002:
      'Too big: each step overshoots, and the cost blows up within about 20 steps. Here anything above about 0.00017 does this, because area is in the hundreds.',
  };
  let D = [],
    m = 0,
    G = null,
    best = null,
    Jmin = 0,
    alpha = 0.00015,
    N = 500,
    hist = [],
    k = 0,
    playing = false,
    timer = 0,
    conv = -1,
    stopped = '';
  const clamp = (v, a, c) => Math.max(a, Math.min(c, v));
  function el(par, t, a, txt) {
    const e = document.createElementNS(ns, t);
    for (const kk in a) e.setAttribute(kk, a[kk]);
    if (txt !== undefined) e.textContent = txt;
    par.appendChild(e);
    return e;
  }
  // sufficient statistics: A = [x1..x4, 1]; G = AᵀA/m, h = Aᵀy/m, yy = yᵀy/m
  function prep() {
    m = D.length;
    G = Array.from({ length: 5 }, () => Array(5).fill(0));
    const h = Array(5).fill(0);
    let yy = 0;
    for (const r of D) {
      const a = [r[0], r[1], r[2], r[3], 1],
        y = r[4];
      for (let i = 0; i < 5; i++) {
        h[i] += a[i] * y;
        for (let j = i; j < 5; j++) G[i][j] += a[i] * a[j];
      }
      yy += y * y;
    }
    for (let i = 0; i < 5; i++) {
      h[i] /= m;
      for (let j = i; j < 5; j++) {
        G[i][j] /= m;
        G[j][i] = G[i][j];
      }
    }
    yy /= m;
    window._h = h;
    window._yy = yy;
    best = solve(
      G.map((r) => r.slice()),
      h.slice(),
    );
    Jmin = Jc(best);
  }
  function solve(Ma, v) {
    const n = v.length;
    for (let i = 0; i < n; i++) {
      let p = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(Ma[r][i]) > Math.abs(Ma[p][i])) p = r;
      [Ma[i], Ma[p]] = [Ma[p], Ma[i]];
      [v[i], v[p]] = [v[p], v[i]];
      for (let r = i + 1; r < n; r++) {
        const f = Ma[r][i] / Ma[i][i];
        for (let c = i; c < n; c++) Ma[r][c] -= f * Ma[i][c];
        v[r] -= f * v[i];
      }
    }
    const x = Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = v[i];
      for (let c = i + 1; c < n; c++) s -= Ma[i][c] * x[c];
      x[i] = s / Ma[i][i];
    }
    return x;
  }
  function Jc(w) {
    const h = window._h;
    let q = 0,
      l = 0;
    for (let i = 0; i < 5; i++) {
      l += w[i] * h[i];
      for (let j = 0; j < 5; j++) q += w[i] * G[i][j] * w[j];
    }
    return (q - 2 * l + window._yy) / 2;
  }
  function grad(w) {
    const h = window._h;
    return w.map((_, i) => {
      let s = 0;
      for (let j = 0; j < 5; j++) s += G[i][j] * w[j];
      return s - h[i];
    });
  }
  function run() {
    let w = [0, 0, 0, 0, 0];
    hist = [{ w: w.slice(), J: Jc(w) }];
    stopped = '';
    conv = -1;
    for (let i = 0; i < N; i++) {
      const g = grad(w);
      w = w.map((v, j) => v - alpha * g[j]);
      const J = Jc(w);
      if (!isFinite(J) || J > 1e7) {
        stopped = 'Stopped after ' + (i + 1) + ' steps: the cost was growing without limit.';
        break;
      }
      hist.push({ w: w.slice(), J });
      if (conv < 0 && i > 2 && Math.abs(hist[i].J - J) / J < 0.0001) conv = i + 1;
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
  function paintScatter() {
    const c = fit(cv, svg, 380),
      w = hist[k].w;
    c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ac').trim();
    c.globalAlpha = 0.07;
    for (const r of D) {
      if (r[4] > PM) continue;
      const p = r[0] * w[0] + r[1] * w[1] + r[2] * w[2] + r[3] * w[3] + w[4];
      c.beginPath();
      c.arc(fx(r[4]), fy(clamp(p, -10, PM)), 1.8, 0, 6.283);
      c.fill();
    }
  }
  function drawAxes() {
    svg.innerHTML = '';
    [0, 20, 40, 60, 80].forEach((v) => {
      el(svg, 'line', { x1: L, x2: R, y1: fy(v), y2: fy(v), stroke: v === 0 ? 'var(--mut)' : 'var(--rule)' });
      el(svg, 'text', { x: L - 8, y: fy(v) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--mut)' }, v);
      el(svg, 'text', { x: fx(v), y: B + 18, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--mut)' }, v);
    });
    el(svg, 'line', {
      x1: fx(0),
      y1: fy(0),
      x2: fx(PM),
      y2: fy(PM),
      stroke: 'var(--ink)',
      'stroke-dasharray': '5 4',
      'stroke-width': 1.5,
    });
    el(
      svg,
      'text',
      { x: fx(PM) - 6, y: fy(PM) + 16, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--ink)' },
      'perfect',
    );
    el(
      svg,
      'text',
      { x: (L + R) / 2, y: B + 40, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--mut)' },
      'Asked price (billion toman)',
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
      'Predicted price (billion toman)',
    );
  }
  function drawBars() {
    const w = hist[k].w,
      span = [0.6, 6, 1, 2, 12];
    document.getElementById('wbars').innerHTML = w
      .map((v, j) => {
        const s = span[j],
          pos = (x) => 50 + clamp(x / s, -1, 1) * 48,
          a = pos(0),
          bb = pos(v),
          tg = pos(best[j]);
        return `<div class="wb"><span>${NAMES[j]}<small>${UNIT[j]}</small></span><div class="track"><span class="zero"></span><i class="${v < 0 ? 'neg' : ''}" style="left:${Math.min(a, bb)}%;width:${Math.abs(bb - a)}%"></i><span class="tgt" style="left:${tg}%" title="best value ${best[j].toFixed(3)}"></span></div><b>${(v < 0 ? '−' : '') + Math.abs(v).toFixed(3)}<small>best ${(best[j] < 0 ? '−' : '') + Math.abs(best[j]).toFixed(3)}</small></b></div>`;
      })
      .join('');
  }
  function drawHist() {
    hsv.innerHTML = '';
    const l = 56,
      r = 1040,
      t = 12,
      bt = 140;
    const top = Math.max(...hist.map((h) => h.J));
    const X = (i) => l + (i / N) * (r - l),
      Y = (v) => bt - (Math.log((v / Jmin) * 1.0001) / Math.log((top / Jmin) * 1.0001)) * (bt - t);
    el(hsv, 'line', { x1: l, x2: r, y1: bt, y2: bt, stroke: 'var(--rule)' });
    el(hsv, 'line', {
      x1: l,
      x2: r,
      y1: Y(Jmin * 1.003),
      y2: Y(Jmin * 1.003),
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
        Math.round(v).toLocaleString('en-US'),
      ),
    );
    el(hsv, 'text', { x: l - 8, y: t + 8, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--mut)' }, 'cost');
    el(
      hsv,
      'text',
      { x: (l + r) / 2, y: bt + 30, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--mut)' },
      'Step',
    );
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
      hist[k].J.toFixed(2) +
        (k > 0 ? '  (' + (ch <= 0 ? '−' : '+') + Math.abs(ch).toFixed(Math.abs(ch) < 0.01 ? 4 : 2) + ')' : ''),
    );
  }
  function render() {
    paintScatter();
    drawBars();
    drawHist();
    const s = hist[k];
    document.getElementById('hS').textContent = k.toLocaleString('en-US');
    document.getElementById('hJ').textContent = s.J.toFixed(2);
    document.getElementById('scrub').value = k;
    document.getElementById('sk').textContent = k.toLocaleString('en-US');
    const done = k === hist.length - 1,
      gap = s.J / Jmin;
    document.getElementById('conv').textContent =
      stopped && done ? 'diverged' : conv > 0 && k >= conv ? 'converged at step ' + conv : '';
    document.getElementById('status').textContent =
      stopped && done
        ? stopped
        : k === 0
          ? 'All weights start at zero, so every prediction is 0. Press play.'
          : done
            ? 'After ' +
              (hist.length - 1).toLocaleString('en-US') +
              ' steps the cost is ' +
              s.J.toFixed(1) +
              ', ' +
              gap.toFixed(2) +
              ' times the best possible (' +
              Jmin.toFixed(1) +
              '). ' +
              (gap > 1.05
                ? 'Some weights are still far from their ticks: raw features make gradient descent slow.'
                : 'Close to the best.')
            : 'Learning…';
    const ad = D[7],
      w = s.w,
      p = ad[0] * w[0] + ad[1] * w[1] + ad[2] * w[2] + ad[3] * w[3] + w[4],
      f = (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(3);
    const t = (v, x, first) =>
      (v < 0 ? (first ? '−' : ' − ') : first ? '' : ' + ') + Math.abs(v).toFixed(3) + (x !== null ? '·' + x : '');
    document.getElementById('f').innerHTML =
      `x = [${ad[0]} m², ${ad[1]} bed, ${ad[2]} yr, ${ad[3]} park]<br>f = ${t(w[0], ad[0], 1)}${t(w[1], ad[1])}${t(w[2], ad[2])}${t(w[3], ad[3])}${t(w[4], null)}<br>&nbsp;&nbsp;= <span class="hl">${p.toFixed(2)} billion</span>, asked ${ad[4].toFixed(2)}`;
  }
  function setPlay(on) {
    playing = on;
    document.getElementById('playIcon').innerHTML = on
      ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor"/>'
      : '<path d="M7 4l13 8-13 8z" fill="currentColor"/>';
  }
  function stop() {
    cancelAnimationFrame(timer);
    setPlay(false);
  }
  let lastT = 0;
  function tick(ts) {
    if (!playing) return;
    if (ts && ts - lastT < 33) {
      timer = requestAnimationFrame(tick);
      return;
    }
    lastT = ts || 0;
    k = Math.min(hist.length - 1, k + Math.max(1, Math.round(N / 150)));
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
  };
  document.getElementById('reset').onclick = () => {
    stop();
    k = 0;
    render();
  };
  document.getElementById('scrub').oninput = (e) => {
    stop();
    k = +e.target.value;
    render();
  };
  function setAlpha(a) {
    alpha = a;
    document.getElementById('anote').textContent = ANOTE[a];
    document
      .querySelectorAll('.seg[aria-label="Learning rate"] button')
      .forEach((x) => x.classList.toggle('on', +x.dataset.a === a));
  }
  document.querySelectorAll('.seg[aria-label="Learning rate"] button').forEach(
    (x) =>
      (x.onclick = () => {
        setAlpha(+x.dataset.a);
        stop();
        run();
        k = 0;
        render();
      }),
  );
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
  const K = (s, id) => katex.render(s, document.getElementById(id), { throwOnError: false, displayMode: true });
  K('f_{\\mathbf{w},b}(\\mathbf{x}) = w_0x_0 + w_1x_1 + w_2x_2 + w_3x_3 + b = \\mathbf{w}\\cdot\\mathbf{x} + b', 'm1');
  K(
    '\\frac{\\partial J}{\\partial w_j} = \\frac{1}{m}\\sum_{i}\\big(f_{\\mathbf{w},b}(\\mathbf{x}^{(i)}) - y^{(i)}\\big)\\,x_j^{(i)}',
    'm2',
  );
  const main = document.getElementById('main');
  setAlpha(alpha);
  ctx.load('house-train-4f.json').then((d) => {
    D = d;
    prep();
    run();
    setTimeout(() => {
      main.classList.remove('skel');
      main.setAttribute('aria-busy', 'false');
      drawAxes();
      render();
    }, 400);
  });
  win.addEventListener('resize', () => {
    if (D.length) {
      drawAxes();
      render();
    }
  });

  return dispose;
}
