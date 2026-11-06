// Model Lab, step 13. Ported from the approved design draft docs/design/HouseLabStep13.html:
// the markup, then mount(), which runs the step's interactive code once its markup is on the page.
import katex from 'katex';

export const html = `<div id="main" class="skel" aria-busy="true">
    <div class="skonly" aria-hidden="true">
      <section class="card"><div class="sk" style="width:90px;height:14px;margin-bottom:12px"></div><div class="sk" style="width:34%;height:30px;margin-bottom:12px"></div><div class="sk" style="width:70%;height:16px;margin-bottom:22px"></div>
        <div class="sk" style="height:110px;border-radius:14px;margin-bottom:16px"></div>
        <div class="two"><div class="sk" style="height:430px;border-radius:14px"></div><div class="sk" style="height:430px;border-radius:14px"></div></div></section>
    </div>
    <div class="live">
    <section class="card" aria-labelledby="st">
      <span class="tag">Step 13 of 14</span>
      <h2 id="st">Regularization</h2>
      <p class="goal">Keep the wiggly degree 9 curve from step 12, but charge it for large weights. One number, λ, sets the price: raise it and the curve calms down.</p>

      <div class="player" role="group" aria-label="Penalty settings">
        <div class="prow">
          <div class="lam"><span>Penalty λ</span><div class="lw"><input id="lam" type="range" min="-5" max="2" step="0.25" value="-5" aria-label="Penalty lambda"><div class="ticks" id="ticks"></div></div><b id="lamv">0</b></div>
          <button id="again" class="ibtn" type="button"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/></svg><span>Pick 10 other ads</span></button>
        </div>
        <p class="anote" id="lnote"></p>
        <span class="sandbox">Sandbox: the live model is not changed. The same 10 training ads and degree 9 curve as step 12.</span>
      </div>

      <div class="two">
        <figure class="plot">
          <div class="phead"><b>The fit</b><span class="verdict" id="verdict"></span></div>
          <div class="pbox"><svg id="fit" viewBox="0 0 520 380" width="100%" role="img" aria-label="The degree 9 curve over the training ads, with October's ads behind"></svg></div>
          <figcaption class="note"><span class="key"><i class="k1"></i>10 training ads</span> <span class="key"><i class="k2"></i>October 2024 ads, never seen in training</span></figcaption>
        </figure>
        <figure class="plot">
          <div class="phead"><b>Cost by λ</b></div>
          <div class="pbox"><svg id="cbl" viewBox="0 0 520 380" width="100%" role="img" aria-label="Cost on training ads and on October ads, for each λ"></svg></div>
          <figcaption class="note" id="cnote"></figcaption>
        </figure>
      </div>

      <div class="two" style="margin-top:18px">
        <div class="box"><h3>The nine weights</h3><div id="wbars" class="wbars"></div><div class="wr"><span></span><span class="wsc"><i style="left:0%">0.01</i><i style="left:20%">0.1</i><i style="left:40%">1</i><i style="left:60%">10</i><i style="left:80%">100</i><i style="left:100%">1,000</i></span><b></b></div><p class="small">Bar length is on a log scale: each grid step is 10 times bigger. Without a penalty the weights run into the thousands, pulling the curve up and down between the ads.</p></div>
        <div class="box"><h3>The cost now has two parts</h3>
          <div class="stack" id="stack"></div>
          <div class="legend2"><span><i style="background:var(--warn)"></i>fit: how far from the training ads</span><span><i style="background:var(--cp)"></i>penalty: λ / 2m × the sum of the squared weights</span></div>
          <p class="small" id="snote"></p></div>
      </div>

      <div class="box livebox"><h3>In the live model</h3>
        <p class="small">The real training run tried λ = 0, 10, 100, 1,000 and 10,000 on all nine features and kept the one with the lowest cost on October's ads: <b>λ = 100</b>. With 48,332 training ads the model barely overfits, so the gain is small: October cost <b>17.065</b> without a penalty, <b>17.044</b> with it. Penalties matter most when data is scarce, as on this page.</p></div>
    </section>
    </div>
  </div>`;

export const mathHtml = `<div class="mrow" tabindex="0"><span id="m1"></span><p>The first part fits the data, the second keeps the weights small. λ sets the balance; b is not penalized.</p></div>
        <div class="mrow" tabindex="0"><span id="m2"></span><p>The update, rearranged: each step first shrinks every weight a little, then moves downhill as before.</p></div>`;

export const skHtml = `<pre>from sklearn.linear_model import Ridge</pre><p>Linear regression with this same penalty.</p>
        <pre>model = Ridge(alpha=lambda_).fit(X_train, y_train)</pre><p>Careful: scikit-learn calls λ "alpha", which is not the learning rate. Ridge solves for the best weights directly, so it has no learning rate at all.</p>`;

/** Runs the step. `ctx.load(name)` gives its data; the returned function stops everything it started. */
export function mount(ctx) {
  const { setTimeout, requestAnimationFrame, cancelAnimationFrame, win, dispose } = ctx.scope();

  const ns = 'http://www.w3.org/2000/svg',
    fsv = document.getElementById('fit'),
    csv = document.getElementById('cbl');
  const LO = 40,
    HI = 200,
    PY = 40,
    L = 56,
    R = 505,
    T = 14,
    B = 318,
    DEG = 9,
    N = 10;
  const LAMS = [-5, -4.5, -4, -3.5, -3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2];
  let TR = [],
    NEW = [],
    NEWS = [],
    seed = 1,
    S = [],
    le = -5,
    sweep = [];
  const clamp = (v, a, c) => Math.max(a, Math.min(c, v)),
    zx = (a) => (a - (LO + HI) / 2) / ((HI - LO) / 2),
    lamOf = (e) => (e <= -5 ? 0 : 10 ** e);
  const fl = (l) => (l === 0 ? '0' : l >= 1 ? String(+l.toPrecision(2)) : String(+l.toPrecision(2)));
  function el(par, t, a, txt) {
    const e = document.createElementNS(ns, t);
    for (const kk in a) e.setAttribute(kk, a[kk]);
    if (txt !== undefined) e.textContent = txt;
    par.appendChild(e);
    return e;
  }
  function rng(s) {
    return () => {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick() {
    const r = rng(seed * 7919 + N),
      out = [];
    for (let i = 0; i < N; i++) {
      const a = LO + ((HI - LO) * i) / N,
        b = LO + ((HI - LO) * (i + 1)) / N;
      let c = null;
      for (let t = 0; t < 400 && !c; t++) {
        const q = TR[Math.floor(r() * TR.length)];
        if (q[0] >= a && q[0] < b) c = q;
      }
      if (c) out.push(c);
    }
    return out;
  }
  function solve(M, v) {
    const k = v.length;
    M = M.map((r) => r.slice());
    v = v.slice();
    for (let i = 0; i < k; i++) {
      let p = i;
      for (let r = i + 1; r < k; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
      [M[i], M[p]] = [M[p], M[i]];
      [v[i], v[p]] = [v[p], v[i]];
      for (let r = i + 1; r < k; r++) {
        const f = M[r][i] / M[i][i];
        for (let c = i; c < k; c++) M[r][c] -= f * M[i][c];
        v[r] -= f * v[i];
      }
    }
    const x = Array(k).fill(0);
    for (let i = k - 1; i >= 0; i--) {
      let s = v[i];
      for (let c = i + 1; c < k; c++) s -= M[i][c] * x[c];
      x[i] = s / M[i][i];
    }
    return x;
  }
  // minimizes (1/2m)[sum of squared misses + λ × sum of w²], b (the first column) not penalized
  function fitRidge(P, lam) {
    const k = DEG + 1,
      G = Array.from({ length: k }, () => Array(k).fill(0)),
      h = Array(k).fill(0);
    for (const [a, y] of P) {
      const z = zx(a),
        v = [1];
      for (let i = 1; i < k; i++) v.push(v[i - 1] * z);
      for (let i = 0; i < k; i++) {
        h[i] += v[i] * y;
        for (let j = 0; j < k; j++) G[i][j] += v[i] * v[j];
      }
    }
    for (let i = 1; i < k; i++) G[i][i] += lam + 1e-9;
    const w = solve(G, h);
    const f = (a) => {
      const z = zx(a);
      let s = 0,
        p = 1;
      for (let i = 0; i < k; i++) {
        s += w[i] * p;
        p *= z;
      }
      return s;
    };
    return { w, f };
  }
  const cost = (f, P) => P.reduce((s, [a, y]) => s + (f(a) - y) ** 2, 0) / (2 * P.length);
  function refit() {
    S = pick();
    sweep = LAMS.map((e) => {
      const m = fitRidge(S, lamOf(e));
      return { e, jt: cost(m.f, S), jn: cost(m.f, NEW) };
    });
  }
  function best() {
    let b = sweep[0];
    sweep.forEach((s) => {
      if (s.jn < b.jn) b = s;
    });
    return b;
  }
  const fx = (a) => L + ((a - LO) / (HI - LO)) * (R - L),
    fy = (v) => B - (v / PY) * (B - T);
  function axesFit() {
    [0, 10, 20, 30, 40].forEach((v) => {
      el(fsv, 'line', { x1: L, x2: R, y1: fy(v), y2: fy(v), stroke: 'var(--rule)' });
      el(fsv, 'text', { x: L - 8, y: fy(v) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--mut)' }, v);
    });
    [40, 80, 120, 160, 200].forEach((v) =>
      el(fsv, 'text', { x: fx(v), y: B + 18, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--mut)' }, v),
    );
    el(
      fsv,
      'text',
      { x: (L + R) / 2, y: B + 40, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--mut)' },
      'Area (m²)',
    );
    el(
      fsv,
      'text',
      {
        x: 14,
        y: (T + B) / 2,
        'text-anchor': 'middle',
        'font-size': 13,
        fill: 'var(--mut)',
        transform: 'rotate(-90 14 ' + (T + B) / 2 + ')',
      },
      'Asked price (billion toman)',
    );
  }
  function drawFit(m) {
    fsv.innerHTML = '';
    axesFit();
    const g = el(fsv, 'g', { fill: 'none', stroke: 'var(--cn)', 'stroke-opacity': 0.45 });
    NEWS.forEach(([a, y]) => {
      if (y <= PY) el(g, 'circle', { cx: fx(a).toFixed(1), cy: fy(y).toFixed(1), r: 2.6 });
    });
    const cp = el(el(fsv, 'clipPath', { id: 'cl' }), 'rect', { x: L, y: T, width: R - L, height: B - T });
    void cp;
    let d = '';
    for (let i = 0; i <= 320; i++) {
      const a = LO + ((HI - LO) * i) / 320;
      d += (i ? 'L' : 'M') + fx(a).toFixed(1) + ' ' + clamp(fy(m.f(a)), T - 400, B + 400).toFixed(1);
    }
    el(fsv, 'path', {
      d,
      fill: 'none',
      stroke: 'var(--warn)',
      'stroke-width': 3,
      'clip-path': 'url(#cl)',
      'stroke-linejoin': 'round',
    });
    S.forEach(([a, y]) => {
      if (y <= PY)
        el(fsv, 'circle', {
          cx: fx(a),
          cy: fy(y),
          r: 5.5,
          fill: 'var(--ink)',
          stroke: 'var(--sf)',
          'stroke-width': 1.5,
        });
    });
  }
  function drawCbl() {
    csv.innerHTML = '';
    const vals = sweep.flatMap((s) => [s.jt, s.jn]).filter((v) => v > 0),
      lo = Math.max(0.05, Math.min(...vals) / 1.5),
      hi = Math.max(100, Math.min(1e5, Math.max(...vals) * 1.5));
    const X = (e) => L + ((e + 5) / 7) * (R - L),
      Y = (v) => B - (Math.log(clamp(v, lo, hi) / lo) / Math.log(hi / lo)) * (B - T);
    [0.1, 1, 10, 100, 1000, 10000]
      .filter((v) => v >= lo && v <= hi)
      .forEach((v) => {
        el(csv, 'line', { x1: L, x2: R, y1: Y(v), y2: Y(v), stroke: 'var(--rule)' });
        el(
          csv,
          'text',
          { x: L - 8, y: Y(v) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--mut)' },
          v.toLocaleString('en-US'),
        );
      });
    [
      [-5, '0'],
      [-3, '0.001'],
      [-1, '0.1'],
      [1, '10'],
      [2, '100'],
    ].forEach(([e, t]) =>
      el(csv, 'text', { x: X(e), y: B + 18, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--mut)' }, t),
    );
    el(
      csv,
      'text',
      { x: (L + R) / 2, y: B + 40, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--mut)' },
      'Penalty λ (log scale)',
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
      'Cost J (log scale)',
    );
    const bs = best();
    el(csv, 'rect', { x: X(bs.e) - 12, y: T, width: 24, height: B - T, fill: 'var(--acs)', opacity: 0.7 });
    el(
      csv,
      'text',
      { x: X(bs.e), y: T + 30, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 600, fill: 'var(--ac)' },
      'best',
    );
    el(csv, 'line', { x1: X(le), x2: X(le), y1: T, y2: B, stroke: 'var(--ink)', 'stroke-dasharray': '3 3' });
    [
      ['jt', 'var(--ink)', 'training ads', '5 4'],
      ['jn', 'var(--cn)', 'October ads', ''],
    ].forEach(([k, c, name, dash]) => {
      el(csv, 'path', {
        d: sweep.map((s, i) => (i ? 'L' : 'M') + X(s.e).toFixed(1) + ' ' + Y(s[k]).toFixed(1)).join(''),
        fill: 'none',
        stroke: c,
        'stroke-width': 2.4,
        'stroke-dasharray': dash,
      });
      const cur = sweep.find((s) => s.e === le);
      el(csv, 'circle', { cx: X(le), cy: Y(cur[k]), r: 6, fill: c });
      const first = sweep[1][k];
      el(
        csv,
        'text',
        { x: X(sweep[1].e) + 8, y: Y(first) + (k === 'jt' ? 18 : -8), 'font-size': 12, 'font-weight': 600, fill: c },
        name,
      );
    });
  }
  function drawW(m) {
    const w = m.w.slice(1),
      lg = (v) => clamp(((Math.log10(Math.max(Math.abs(v), 0.01)) + 2) / 5) * 100, 0, 100);
    document.getElementById('wbars').innerHTML = w
      .map(
        (v, i) =>
          `<div class="wr"><span>w${['₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'][i]}</span><span class="tr"><i style="width:${lg(v)}%"></i></span><b>${(v < 0 ? '−' : '') + (Math.abs(v) >= 100 ? Math.round(Math.abs(v)).toLocaleString('en-US') : Math.abs(v).toFixed(2))}</b></div>`,
      )
      .join('');
  }
  function drawStack(m, lam) {
    const fit = cost(m.f, S),
      pen = (lam / (2 * S.length)) * m.w.slice(1).reduce((s, v) => s + v * v, 0),
      tot = fit + pen;
    document.getElementById('stack').innerHTML =
      tot <= 0
        ? ''
        : `<div style="width:${(fit / tot) * 100}%;background:var(--warn)">${fit / tot > 0.18 ? fit.toFixed(2) : ''}</div><div style="width:${(pen / tot) * 100}%;background:var(--cp)">${pen / tot > 0.18 ? pen.toFixed(2) : ''}</div>`;
    document.getElementById('snote').innerHTML =
      lam === 0
        ? 'With λ = 0 there is no penalty: the cost is only the fit, so the weights are free to grow until the curve passes through every training ad.'
        : `Fit <b>${fit.toFixed(2)}</b> + penalty <b>${pen.toFixed(2)}</b> = <b>${tot.toFixed(2)}</b>. Gradient descent lowers the total, so it gives up a little fit to keep the weights small.`;
  }
  function render() {
    const lam = lamOf(le),
      m = fitRidge(S, lam),
      cur = sweep.find((s) => s.e === le),
      bs = best();
    document.getElementById('lamv').textContent = fl(lam);
    drawFit(m);
    drawCbl();
    drawW(m);
    drawStack(m, lam);
    const v = document.getElementById('verdict');
    let cls, txt, nt;
    if (le < bs.e && cur.jn > bs.jn * 1.5) {
      cls = 'over';
      txt = 'Overfit';
      nt =
        lam === 0
          ? 'No penalty: the step 12 overfit. The curve passes through every training ad and swings wildly between them.'
          : 'A small penalty: the swings shrink, but the curve still chases single ads.';
    } else if (le > bs.e && cur.jn > bs.jn * 1.5) {
      cls = 'under';
      txt = 'Too simple';
      nt =
        'Too much penalty: every weight is pushed so close to zero that the curve flattens and misses the pattern. Now it underfits.';
    } else {
      cls = 'right';
      txt = 'Just right';
      nt =
        "About right: the curve follows the trend of the ads without chasing single ones, and the cost on October's ads is near its lowest.";
    }
    v.className = 'verdict ' + cls;
    v.textContent = txt;
    document.getElementById('lnote').textContent = nt;
    document.getElementById('cnote').textContent =
      'Dashed: cost on the 10 training ads, which rises as λ grows. Solid: cost on ' +
      NEW.length.toLocaleString('en-US') +
      ' October ads. Too little λ overfits, too much underfits; the shaded column is the lowest, λ = ' +
      fl(lamOf(bs.e)) +
      ' for these ads.';
  }
  document.getElementById('ticks').innerHTML = [
    [-5, 'none'],
    [-3, '0.001'],
    [-2, '0.01'],
    [-1, '0.1'],
    [0, '1'],
    [1, '10'],
    [2, '100'],
  ]
    .map(([e, s]) => `<span style="left:${((e + 5) / 7) * 100}%">${s}</span>`)
    .join('');
  document.getElementById('lam').oninput = (e) => {
    le = +e.target.value;
    render();
  };
  document.getElementById('again').onclick = () => {
    seed++;
    refit();
    render();
  };
  const K = (s, id) => katex.render(s, document.getElementById(id), { throwOnError: false, displayMode: true });
  K(
    'J(\\mathbf{w},b) = \\frac{1}{2m}\\sum_{i=1}^{m}\\big(f(\\mathbf{x}^{(i)})-y^{(i)}\\big)^2 + \\frac{\\lambda}{2m}\\sum_{j=1}^{n} w_j^2',
    'm1',
  );
  K(
    'w_j := w_j\\Big(1-\\alpha\\frac{\\lambda}{m}\\Big) - \\alpha\\,\\frac{1}{m}\\sum_{i=1}^{m}\\big(f(\\mathbf{x}^{(i)})-y^{(i)}\\big)x_j^{(i)}',
    'm2',
  );
  const main = document.getElementById('main');
  Promise.all([ctx.load('house-train-points.json'), ctx.load('house-sel-points.json')]).then(([t, s]) => {
    TR = t.filter((r) => r[0] >= LO && r[0] <= HI);
    NEW = s.rows.filter((r) => r[0] >= LO && r[0] <= HI);
    NEWS = NEW.filter((_, i) => i % 12 === 0);
    refit();
    setTimeout(() => {
      main.classList.remove('skel');
      main.setAttribute('aria-busy', 'false');
      render();
    }, 300);
  });

  return dispose;
}
