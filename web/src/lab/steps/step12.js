// Model Lab, step 12. Ported from the approved design draft docs/design/HouseLabStep12.html:
// the markup, then mount(), which runs the step's interactive code once its markup is on the page.
import katex from 'katex';

export const html = `<div id="main" class="skel" aria-busy="true">
    <div class="skonly" aria-hidden="true">
      <section class="card"><div class="sk" style="width:90px;height:14px;margin-bottom:12px"></div><div class="sk" style="width:30%;height:30px;margin-bottom:12px"></div><div class="sk" style="width:70%;height:16px;margin-bottom:22px"></div>
        <div class="sk" style="height:110px;border-radius:14px;margin-bottom:16px"></div>
        <div class="two"><div class="sk" style="height:430px;border-radius:14px"></div><div class="sk" style="height:430px;border-radius:14px"></div></div></section>
    </div>
    <div class="live">
    <section class="card" aria-labelledby="st">
      <span class="tag">Step 12 of 15</span>
      <h2 id="st">Overfitting</h2>
      <p class="goal">A low training cost is not the goal. The goal is good prices for ads the model has never seen. Fit a curve to a few ads, then check it on the next month's ads.</p>

      <div class="player ctl" role="group" aria-label="Fit settings">
        <div class="prow">
          <label class="deg"><span>Curve degree</span><input id="deg" type="range" min="1" max="9" step="1" value="1" aria-label="Curve degree"><b id="degv">1</b></label>
          <div class="opt"><span>Training ads</span><div class="seg" id="nseg" role="group" aria-label="Number of training ads"><button class="on" data-n="10" type="button">10</button><button data-n="40" type="button">40</button><button data-n="200" type="button">200</button></div></div>
          <button id="again" class="ibtn" type="button"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/></svg><span id="againT">Pick 10 other ads</span></button>
        </div>
        <p class="anote" id="dnote"></p>
        <span class="sandbox">Sandbox: the live model is not changed. Degree 1 is a straight line; degree 3 adds area² and area³ as features (step 11), and so on.</span>
      </div>

      <div class="two">
        <figure class="plot">
          <div class="phead"><b>The fit</b><span class="verdict" id="verdict"></span></div>
          <div class="pbox"><svg id="fit" viewBox="0 0 520 380" width="100%" role="img" aria-label="The fitted curve over the training ads, with the next month's ads behind"></svg></div>
          <figcaption class="note"><span class="key"><i class="k1"></i>training ads, the only ones the curve sees</span> <span class="key"><i class="k2"></i>October 2024 ads, never seen in training</span></figcaption>
        </figure>
        <figure class="plot">
          <div class="phead"><b>Cost by degree</b></div>
          <div class="pbox"><svg id="cbd" viewBox="0 0 520 380" width="100%" role="img" aria-label="Cost on the training ads and on new ads, for each degree"></svg></div>
          <figcaption class="note" id="cnote"></figcaption>
        </figure>
      </div>

      <div class="meter">
        <div class="box"><h3>Where it stands</h3><div class="nums"><div><span>Cost on the training ads</span><b id="jt"></b></div><div><span>Cost on October's ads</span><b id="jn" class="warnv"></b></div></div><p id="status" class="small"></p></div>
        <div class="box"><h3>How to fix overfitting</h3><ol class="fix">
          <li><b>More ads.</b> Switch to 40 or 200 training ads: the same degree 9 curve calms down.</li>
          <li><b>Fewer features.</b> A lower degree has fewer weights to bend with.</li>
          <li><b>Regularization.</b> Keep every feature but keep the weights small. That is step 13.</li></ol></div>
      </div>
    </section>
    </div>
  </div>`;

export const mathHtml = `<div class="mrow" tabindex="0"><span id="m1"></span><p>The same cost as step 4, measured twice: on the ads the model trained on, and on ads it has never seen.</p></div>
        <div class="mrow" tabindex="0"><span id="m2"></span><p>Underfit (high bias): both costs are high. Overfit (high variance): the training cost is low but the new-ads cost is high, and the curve changes a lot when you pick other training ads.</p></div>`;

export const skHtml = `<pre>from sklearn.preprocessing import PolynomialFeatures</pre><p>Builds x, x², ..., x⁹.</p>
        <pre>from sklearn.linear_model import LinearRegression</pre><p>The same least-squares fit as this page.</p>
        <pre>X9 = PolynomialFeatures(degree=9).fit_transform(X)</pre><p>Nine features from one.</p>
        <pre>LinearRegression().fit(X9, y)</pre><p>It fits without any warning. Spotting overfitting is your job: score it on ads it has not seen.</p>`;

/** Runs the step. `ctx.load(name)` gives its data; the returned function stops everything it started. */
export function mount(ctx) {
  const { setTimeout, requestAnimationFrame, cancelAnimationFrame, win, dispose } = ctx.scope();

  const ns = 'http://www.w3.org/2000/svg',
    fsv = document.getElementById('fit'),
    csv = document.getElementById('cbd');
  const LO = 40,
    HI = 200,
    PY = 40,
    L = 56,
    R = 505,
    T = 14,
    B = 318;
  let TR = [],
    NEW = [],
    NEWS = [],
    n = 10,
    deg = 1,
    seed = 1,
    S = [],
    res = [];
  const clamp = (v, a, c) => Math.max(a, Math.min(c, v)),
    zx = (a) => (a - (LO + HI) / 2) / ((HI - LO) / 2);
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
  // training ads spread over the area range: one random ad from each of n equal slices
  function pick() {
    const r = rng(seed * 7919 + n),
      out = [];
    for (let i = 0; i < n; i++) {
      const a = LO + ((HI - LO) * i) / n,
        b = LO + ((HI - LO) * (i + 1)) / n;
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
  // least squares with columns 1, z, z², ..., z^d (z = area scaled to -1..1); a tiny ridge only for numerical safety
  function fitDeg(P, d) {
    const k = d + 1,
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
    for (let i = 1; i < k; i++) G[i][i] += 1e-9;
    const w = solve(G, h);
    return (a) => {
      const z = zx(a);
      let s = 0,
        p = 1;
      for (let i = 0; i < k; i++) {
        s += w[i] * p;
        p *= z;
      }
      return s;
    };
  }
  const cost = (f, P) => P.reduce((s, [a, y]) => s + (f(a) - y) ** 2, 0) / (2 * P.length);
  function refit() {
    S = pick();
    res = [];
    for (let d = 1; d <= 9; d++) {
      const f = fitDeg(S, d);
      res.push({ f, jt: cost(f, S), jn: cost(f, NEW) });
    }
  }
  const fx = (a) => L + ((a - LO) / (HI - LO)) * (R - L),
    fy = (v) => B - (v / PY) * (B - T);
  function drawFit() {
    fsv.innerHTML = '';
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
    const g = el(fsv, 'g', { fill: 'none', stroke: 'var(--cn)', 'stroke-opacity': 0.45 });
    NEWS.forEach(([a, y]) => {
      if (y <= PY) el(g, 'circle', { cx: fx(a).toFixed(1), cy: fy(y).toFixed(1), r: 2.6 });
    });
    el(fsv, 'clipPath', { id: 'cl' })
      .appendChild(Object.assign(document.createElementNS(ns, 'rect'), {}))
      .setAttribute('x', L);
    const cp = fsv.querySelector('#cl rect');
    cp.setAttribute('y', T);
    cp.setAttribute('width', R - L);
    cp.setAttribute('height', B - T);
    const f = res[deg - 1].f;
    let d = '';
    for (let i = 0; i <= 320; i++) {
      const a = LO + ((HI - LO) * i) / 320;
      d += (i ? 'L' : 'M') + fx(a).toFixed(1) + ' ' + clamp(fy(f(a)), T - 400, B + 400).toFixed(1);
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
          r: n > 40 ? 3 : 5.5,
          fill: 'var(--ink)',
          stroke: 'var(--sf)',
          'stroke-width': 1.5,
        });
    });
  }
  function best() {
    let b = 0;
    res.forEach((r, i) => {
      if (r.jn < res[b].jn) b = i;
    });
    return b + 1;
  }
  function drawCbd() {
    csv.innerHTML = '';
    const vals = res.flatMap((r) => [r.jt, r.jn]).filter((v) => v > 0),
      lo = 0.5,
      hi = Math.max(100, Math.min(1e5, Math.max(...vals) * 1.5));
    const X = (d) => L + ((d - 1) / 8) * (R - L),
      Y = (v) => B - (Math.log(clamp(v, lo, hi) / lo) / Math.log(hi / lo)) * (B - T);
    [1, 10, 100, 1000, 10000]
      .filter((v) => v <= hi)
      .forEach((v) => {
        el(csv, 'line', { x1: L, x2: R, y1: Y(v), y2: Y(v), stroke: 'var(--rule)' });
        el(
          csv,
          'text',
          { x: L - 8, y: Y(v) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--mut)' },
          v.toLocaleString('en-US'),
        );
      });
    for (let d = 1; d <= 9; d++)
      el(csv, 'text', { x: X(d), y: B + 18, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--mut)' }, d);
    el(
      csv,
      'text',
      { x: (L + R) / 2, y: B + 40, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--mut)' },
      'Curve degree',
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
    const bd = best();
    el(csv, 'rect', { x: X(bd) - 14, y: T, width: 28, height: B - T, fill: 'var(--acs)', opacity: 0.7 });
    el(
      csv,
      'text',
      { x: X(bd), y: T + 30, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 600, fill: 'var(--ac)' },
      'best',
    );
    el(csv, 'line', { x1: X(deg), x2: X(deg), y1: T, y2: B, stroke: 'var(--ink)', 'stroke-dasharray': '3 3' });
    [
      ['jt', 'var(--ink)', 'training ads'],
      ['jn', 'var(--cn)', 'October ads'],
    ].forEach(([k, c, name]) => {
      el(csv, 'path', {
        d: res.map((r, i) => (i ? 'L' : 'M') + X(i + 1).toFixed(1) + ' ' + Y(r[k]).toFixed(1)).join(''),
        fill: 'none',
        stroke: c,
        'stroke-width': 2.4,
        'stroke-dasharray': k === 'jn' ? '' : '5 4',
      });
      res.forEach((r, i) => el(csv, 'circle', { cx: X(i + 1), cy: Y(r[k]), r: i + 1 === deg ? 6 : 3.5, fill: c }));
      const last = res[8][k];
      el(
        csv,
        'text',
        {
          x: R - 4,
          y: Y(last) + (k === 'jt' ? 16 : -10),
          'text-anchor': 'end',
          'font-size': 12,
          'font-weight': 600,
          fill: c,
        },
        name,
      );
    });
  }
  const DN = { 1: 'Degree 1: a straight line.', 2: 'Degree 2: one bend.', 3: 'Degree 3: area, area² and area³.' };
  function render() {
    document.getElementById('degv').textContent = deg;
    const r = res[deg - 1],
      bd = best(),
      bj = res[bd - 1].jn;
    document.getElementById('dnote').textContent =
      (DN[deg] || 'Degree ' + deg + ': ' + deg + ' weights plus b.') +
      (deg >= n - 1 ? ' With only ' + n + ' training ads, that is enough weights to pass through every ad.' : '');
    drawFit();
    drawCbd();
    const fmt = (v) => (v >= 1000 ? Math.round(v).toLocaleString('en-US') : v.toFixed(1));
    document.getElementById('jt').textContent = fmt(r.jt);
    document.getElementById('jn').textContent = fmt(r.jn);
    const v = document.getElementById('verdict');
    let cls, txt, st;
    if (deg < bd && r.jn > bj * 1.08) {
      cls = 'under';
      txt = 'Too simple';
      st = 'Both costs are high: a curve this simple misses the pattern even in the ads it trained on.';
    } else if (deg > bd && r.jn > bj * 1.5) {
      cls = 'over';
      txt = 'Overfit';
      st =
        'It fits its ' +
        n +
        ' training ads ' +
        (r.jt < 0.5 ? 'almost perfectly' : 'closely') +
        ", but on October's ads the cost is " +
        (r.jn / bj).toFixed(r.jn / bj > 10 ? 0 : 1) +
        ' times the best. It memorized the training ads instead of learning the pattern.';
    } else if (deg === bd) {
      cls = 'right';
      txt = 'Just right';
      st =
        'The lowest cost on ads it has never seen. That is the degree to pick, even though higher degrees fit the training ads better.';
    } else {
      cls = 'right';
      txt = 'Close to the best';
      st =
        'Within reach of the lowest cost on ads it has never seen (degree ' +
        bd +
        '). With enough training ads, extra bends do little harm.';
    }
    v.className = 'verdict ' + cls;
    v.textContent = txt;
    document.getElementById('status').textContent = st;
    document.getElementById('cnote').textContent =
      'Dashed: cost on the ' +
      n +
      ' training ads, which only falls as the degree rises. Solid: cost on ' +
      NEW.length.toLocaleString('en-US') +
      " October ads the model never saw. The shaded column is the degree with the lowest cost on October's ads: degree " +
      bd +
      '.';
  }
  document.getElementById('deg').oninput = (e) => {
    deg = +e.target.value;
    render();
  };
  document.querySelectorAll('#nseg button').forEach(
    (b) =>
      (b.onclick = () => {
        n = +b.dataset.n;
        document.querySelectorAll('#nseg button').forEach((x) => x.classList.toggle('on', x === b));
        document.getElementById('againT').textContent = 'Pick ' + n + ' other ads';
        refit();
        render();
      }),
  );
  document.getElementById('again').onclick = () => {
    seed++;
    refit();
    render();
  };
  const K = (s, id) => katex.render(s, document.getElementById(id), { throwOnError: false, displayMode: true });
  K(
    'J_{\\text{train}} = \\frac{1}{2m_{\\text{train}}}\\sum_{\\text{train}}\\big(f(x^{(i)})-y^{(i)}\\big)^2 \\qquad J_{\\text{new}} = \\frac{1}{2m_{\\text{new}}}\\sum_{\\text{new}}\\big(f(x^{(i)})-y^{(i)}\\big)^2',
    'm1',
  );
  K('\\text{Overfit:}\\; J_{\\text{train}} \\ll J_{\\text{new}}', 'm2');
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
