// Model Lab, step 10. Ported from the approved design draft docs/design/HouseLabStep10.html:
// the markup, then mount(), which runs the step's interactive code once its markup is on the page.
import katex from 'katex';

export const html = `<div id="main" class="skel" aria-busy="true">
    <div class="skonly" aria-hidden="true">
      <section class="card"><div class="sk" style="width:90px;height:14px;margin-bottom:12px"></div><div class="sk" style="width:32%;height:30px;margin-bottom:12px"></div><div class="sk" style="width:70%;height:16px;margin-bottom:22px"></div>
        <div class="sk" style="height:330px;border-radius:14px;margin-bottom:16px"></div>
        <div class="two"><div class="sk" style="height:160px;border-radius:14px"></div><div class="sk" style="height:160px;border-radius:14px"></div></div></section>
    </div>
    <div class="live">
    <section class="card" aria-labelledby="st">
      <span class="tag">Step 10 of 15</span>
      <h2 id="st">Feature scaling</h2>
      <p class="goal">Area runs into the hundreds while parking is 0 or 1, so in step 8 one learning rate could not suit them all. Put every feature on the same scale first, and training gets thousands of times faster.</p>

      <figure class="plot">
        <div class="phead"><b>Every feature on one ruler</b><div class="seg" role="group" aria-label="Values shown"><button class="on" data-s="raw" type="button">Raw values</button><button data-s="z" type="button">Scaled</button></div></div>
        <div class="pbox"><svg id="strip" viewBox="0 0 1060 322" width="100%" role="img" aria-label="Values of the four features on one shared axis"></svg></div>
        <figcaption class="note" id="snote"></figcaption>
      </figure>

      <div class="two" style="margin-top:18px">
        <div class="box"><h3>One ad, scaled</h3><table class="zt" id="zt"></table></div>
        <div class="box"><h3>How each feature is scaled</h3>
          <p class="zf">scaled = (value − mean) / spread</p>
          <p class="small">The mean and spread (standard deviation) come from the 48,332 training ads. Subtracting the mean centers each feature at 0; dividing by the spread makes a typical value lie between −1 and 1.</p>
          <p class="small"><b>Keep them.</b> A new apartment must be scaled with these same numbers, which is why the live model saves them next to its weights.</p></div>
      </div>
    </section>

    <section class="card" aria-labelledby="st2">
      <h2 id="st2" class="h2b">Train both and compare</h2>
      <p class="goal">Same ads, same start, same gradient descent. Raw features use the largest α they survive (0.00015, from step 9); scaled features can take a far bigger one.</p>
      <div class="player" role="group" aria-label="Training controls">
        <div class="prow">
          <button id="play" class="play" type="button" aria-label="Start training"><svg id="playIcon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg></button>
          <button id="step" class="ibtn" type="button" aria-label="One step"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l10 7-10 7zM17 5h3v14h-3z" fill="currentColor"/></svg><span>Step</span></button>
          <button id="reset" class="ibtn" type="button" aria-label="Reset: back to the start"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v5h5"/></svg><span>Reset</span></button>
          <div class="scrub"><input id="scrub" type="range" min="0" max="1000" value="0" aria-label="Step in the training"><div class="slab"><span>step <b id="sk">0</b> of <b id="sn">1,000</b></span></div></div>
          <div class="opt"><span>Steps</span><div class="seg iters" role="group" aria-label="Number of steps"><button data-n="100" type="button">100</button><button class="on" data-n="1000" type="button">1,000</button><button data-n="10000" type="button">10,000</button></div></div>
        </div>
        <div class="prow opts">
          <div class="opt"><span>α for scaled</span><div class="seg alph" role="group" aria-label="Learning rate for scaled features"><button data-a="0.01" type="button">0.01 <em>slow</em></button><button data-a="0.1" type="button">0.1 <em>good</em></button><button class="on" data-a="0.3" type="button">0.3 <em>fast</em></button><button data-a="1" type="button">1 <em>too big</em></button></div></div>
          <p class="anote" id="anote"></p>
          <span class="sandbox">Sandbox: the live model is not changed.</span>
        </div>
      </div>
      <div class="two">
        <figure class="plot">
          <div class="phead"><b>Cost after each step</b></div>
          <div class="pbox"><svg id="cost" viewBox="0 0 520 360" width="100%" role="img" aria-label="Cost after each step, raw against scaled"></svg></div>
          <figcaption class="note">Both axes are on a log scale. The dashed line is the best possible cost, the same for both: scaling changes how fast you get there, not where.</figcaption>
        </figure>
        <div class="race">
          <div class="rc" id="rcS"></div>
          <div class="rc" id="rcR"></div>
          <p class="small" id="verdict"></p>
        </div>
      </div>
    </section>
    </div>
  </div>`;

export const mathHtml = `<div class="mrow" tabindex="0"><span id="m1"></span><p>The mean of feature j over the m training ads.</p></div>
        <div class="mrow" tabindex="0"><span id="m2"></span><p>The spread: the typical distance from the mean.</p></div>
        <div class="mrow" tabindex="0"><span id="m3"></span><p>Each feature ends with mean 0 and spread 1, so one α suits all of them.</p></div>`;

export const skHtml = `<pre>from sklearn.preprocessing import StandardScaler</pre><p>The same z-score, built in.</p>
        <pre>scaler = StandardScaler()</pre><p>It will hold mu and sigma.</p>
        <pre>X_train = scaler.fit_transform(X_train)</pre><p>Learn mu and sigma from the training ads only, then scale them.</p>
        <pre>X_new = scaler.transform(X_new)</pre><p>Scale new ads with the saved training values.</p>`;

/** Runs the step. `ctx.load(name)` gives its data; the returned function stops everything it started. */
export function mount(ctx) {
  const { setTimeout, requestAnimationFrame, cancelAnimationFrame, win, dispose } = ctx.scope();

  const ns = 'http://www.w3.org/2000/svg',
    ssv = document.getElementById('strip'),
    csv = document.getElementById('cost');
  const FEAT = [
    ['Area', 'm²'],
    ['Bedrooms', ''],
    ['Age', 'years'],
    ['Parking', '0 or 1'],
  ];
  const ANOTE = {
    0.01: 'Slow: safe, but it takes about 1,000 steps to get close.',
    0.1: 'Good: close to the best in about 100 steps.',
    0.3: 'Fast: close to the best in about 30 steps.',
    1: 'Too big: past the limit for scaled features (about 0.92), so it blows up too. Scaling raises the limit; it does not remove it.',
  };
  let D = [],
    mu = [],
    sd = [],
    sample = [],
    mode = 'raw',
    anim = 1,
    from = 'raw',
    N = 1000,
    k = 0,
    playing = false,
    timer = 0,
    aS = 0.3;
  let R = {},
    S = {},
    Jmin = 0,
    J0 = 0,
    raw1pct = 0;
  const clamp = (v, a, c) => Math.max(a, Math.min(c, v)),
    f1 = (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2),
    fmt = (v) => Math.round(v).toLocaleString('en-US');
  function el(par, t, a, txt) {
    const e = document.createElementNS(ns, t);
    for (const kk in a) e.setAttribute(kk, a[kk]);
    if (txt !== undefined) e.textContent = txt;
    par.appendChild(e);
    return e;
  }
  // least squares and gradient descent from the sums (step 8)
  function sums(X) {
    const m = X.length,
      G = Array.from({ length: 5 }, () => Array(5).fill(0)),
      h = Array(5).fill(0);
    let yy = 0;
    X.forEach((r, i) => {
      const a = [r[0], r[1], r[2], r[3], 1],
        y = D[i][4];
      for (let p = 0; p < 5; p++) {
        h[p] += a[p] * y;
        for (let q = p; q < 5; q++) G[p][q] += a[p] * a[q];
      }
      yy += y * y;
    });
    for (let p = 0; p < 5; p++) {
      h[p] /= m;
      for (let q = p; q < 5; q++) {
        G[p][q] /= m;
        G[q][p] = G[p][q];
      }
    }
    return { G, h, yy: yy / m };
  }
  const Jc = (M, w) => {
    let q = 0,
      l = 0;
    for (let i = 0; i < 5; i++) {
      l += w[i] * M.h[i];
      for (let j = 0; j < 5; j++) q += w[i] * M.G[i][j] * w[j];
    }
    return (q - 2 * l + M.yy) / 2;
  };
  function solve(Ma, v) {
    Ma = Ma.map((r) => r.slice());
    v = v.slice();
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
  function descend(M, a) {
    let w = [0, 0, 0, 0, 0];
    const J = [Jc(M, w)];
    let hit = 0,
      div = 0;
    for (let i = 0; i < N; i++) {
      const g = w.map((_, r) => {
        let s = 0;
        for (let j = 0; j < 5; j++) s += M.G[r][j] * w[j];
        return s - M.h[r];
      });
      w = w.map((v, j) => v - a * g[j]);
      const j = Jc(M, w);
      if (!isFinite(j) || j > 1e6) {
        div = i + 1;
        J.push(1e6);
        break;
      }
      J.push(j);
      if (!hit && j < Jmin * 1.01) hit = i + 1;
    }
    return { J, hit, div };
  }
  function prep() {
    const m = D.length;
    for (let j = 0; j < 4; j++) {
      mu[j] = D.reduce((s, r) => s + r[j], 0) / m;
      sd[j] = Math.sqrt(D.reduce((s, r) => s + (r[j] - mu[j]) ** 2, 0) / m);
    }
    R.M = sums(D);
    S.M = sums(D.map((r) => r.slice(0, 4).map((v, j) => (v - mu[j]) / sd[j])));
    const b = solve(R.M.G, R.M.h);
    Jmin = Jc(R.M, b);
    J0 = Jc(R.M, [0, 0, 0, 0, 0]);
    // steps raw needs to get within 1%: run it once, fast, outside the chart
    let w = [0, 0, 0, 0, 0];
    for (let i = 1; i <= 200000; i++) {
      const g = w.map((_, r) => {
        let s = 0;
        for (let j = 0; j < 5; j++) s += R.M.G[r][j] * w[j];
        return s - R.M.h[r];
      });
      w = w.map((v, j) => v - 0.00015 * g[j]);
      if (Jc(R.M, w) < Jmin * 1.01) {
        raw1pct = i;
        break;
      }
    }
    for (let i = 0; i < D.length; i += 80) sample.push(i);
  }
  function runAll() {
    Object.assign(R, descend(R.M, 0.00015));
    Object.assign(S, descend(S.M, aS));
    document.getElementById('scrub').max = N;
    document.getElementById('sn').textContent = fmt(N);
  }
  // strip plot: one shared ruler, raw or scaled, animated between them
  const SL = 150,
    SR = 1030,
    ROW = 62,
    TOP = 26;
  function axis(mo) {
    return mo === 'raw'
      ? { lo: 0, hi: 600, ticks: [0, 100, 200, 300, 400, 500, 600] }
      : { lo: -3, hi: 6, ticks: [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6] };
  }
  const sx = (v, ax) => SL + ((clamp(v, ax.lo, ax.hi) - ax.lo) / (ax.hi - ax.lo)) * (SR - SL);
  function jit(i, j) {
    const s = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
    return s - Math.floor(s);
  }
  function drawStrip() {
    ssv.innerHTML = '';
    const a0 = axis(from),
      a1 = axis(mode),
      e = anim < 1 ? anim * anim * (3 - 2 * anim) : 1;
    const ax = { lo: a0.lo + (a1.lo - a0.lo) * e, hi: a0.hi + (a1.hi - a0.hi) * e };
    axis(mode).ticks.forEach((t) => {
      const x = sx(t, ax);
      el(ssv, 'line', {
        x1: x,
        x2: x,
        y1: TOP - 8,
        y2: TOP + 4 * ROW - 6,
        stroke: t === 0 && mode === 'z' ? 'var(--mut)' : 'var(--rule)',
      });
      el(
        ssv,
        'text',
        { x, y: TOP + 4 * ROW + 12, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--mut)', opacity: e },
        t,
      );
    });
    el(
      ssv,
      'text',
      { x: (SL + SR) / 2, y: TOP + 4 * ROW + 32, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--mut)' },
      mode === 'raw' ? 'Value as written in the ad' : 'Scaled value: spreads from the mean',
    );
    const ac = getComputedStyle(document.getElementById('main')).getPropertyValue('--ac').trim();
    for (let j = 0; j < 4; j++) {
      const yc = TOP + j * ROW + ROW / 2 - 6;
      el(ssv, 'text', { x: 0, y: yc - 2, 'font-size': 14, 'font-weight': 600, fill: 'var(--ink)' }, FEAT[j][0]);
      el(
        ssv,
        'text',
        { x: 0, y: yc + 15, 'font-size': 12, fill: 'var(--mut)' },
        mode === 'raw' ? FEAT[j][1] : 'mean ' + 0 + ', spread 1',
      );
      const g = el(ssv, 'g', { fill: ac, 'fill-opacity': 0.35 });
      sample.forEach((i) => {
        const v = D[i][j],
          z = (v - mu[j]) / sd[j],
          p0 = from === 'raw' ? v : z,
          p1 = mode === 'raw' ? v : z,
          pv = p0 + (p1 - p0) * e;
        el(g, 'circle', { cx: sx(pv, ax).toFixed(1), cy: (yc + (jit(i, j) - 0.5) * 34).toFixed(1), r: 2.4 });
      });
      const m0 = from === 'raw' ? mu[j] : 0,
        m1 = mode === 'raw' ? mu[j] : 0,
        mx = sx(m0 + (m1 - m0) * e, ax);
      el(ssv, 'line', { x1: mx, x2: mx, y1: yc - 21, y2: yc + 21, stroke: 'var(--ink)', 'stroke-width': 2.5 });
    }
    document.getElementById('snote').textContent =
      mode === 'raw'
        ? 'Each dot is an ad (every 80th of the 48,332); the dark tick is the mean. On one ruler, area spreads over hundreds while bedrooms, age and parking are squeezed near zero. A step that suits area is far too big for the others, and one that suits them barely moves area.'
        : 'The same ads after scaling. Every feature is centered at 0 with a spread of 1, so one step size suits all four. Very large apartments sit at the right edge (area goes up to about 10).';
  }
  function animate() {
    from = mode === 'raw' ? 'z' : 'raw';
    anim = 0;
    const t0 = performance.now();
    const f = (t) => {
      anim = Math.min(1, (t - t0) / 650);
      drawStrip();
      if (anim < 1) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }
  document.querySelectorAll('.seg[aria-label="Values shown"] button').forEach(
    (b) =>
      (b.onclick = () => {
        if (b.dataset.s === mode) return;
        mode = b.dataset.s;
        document
          .querySelectorAll('.seg[aria-label="Values shown"] button')
          .forEach((x) => x.classList.toggle('on', x === b));
        animate();
      }),
  );
  function drawZ() {
    const i = 7,
      r = D[i];
    document.getElementById('zt').innerHTML =
      '<tr><th>Feature</th><th>In the ad</th><th>(value − mean) / spread</th><th style="text-align:right">Scaled</th></tr>' +
      [0, 1, 2, 3]
        .map(
          (j) =>
            `<tr><td>${FEAT[j][0]}</td><td>${r[j]}</td><td>(${r[j]} − ${mu[j].toFixed(1)}) / ${sd[j].toFixed(2)}</td><td class="z">${f1((r[j] - mu[j]) / sd[j])}</td></tr>`,
        )
        .join('');
  }
  // cost chart, log-log
  const L = 56,
    RR = 500,
    T = 16,
    B = 304;
  function drawCost() {
    csv.innerHTML = '';
    const top = J0 * 1.6,
      bot = Jmin * 0.94,
      X = (i) => L + (Math.log10(i + 1) / Math.log10(N + 1)) * (RR - L),
      Y = (v) => B - (Math.log(v / bot) / Math.log(top / bot)) * (B - T);
    [40, 60, 100, 150, 250].forEach((v) => {
      el(csv, 'line', { x1: L, x2: RR, y1: Y(v), y2: Y(v), stroke: 'var(--rule)' });
      el(csv, 'text', { x: L - 8, y: Y(v) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--mut)' }, v);
    });
    [0, 1, 10, 100, 1000, 10000]
      .filter((v) => v <= N)
      .forEach((v) => {
        el(csv, 'line', { x1: X(v), x2: X(v), y1: T, y2: B, stroke: 'var(--rule)' });
        el(csv, 'text', { x: X(v), y: B + 18, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--mut)' }, fmt(v));
      });
    el(csv, 'line', {
      x1: L,
      x2: RR,
      y1: Y(Jmin),
      y2: Y(Jmin),
      stroke: 'var(--ink)',
      'stroke-dasharray': '4 4',
      opacity: 0.6,
    });
    el(
      csv,
      'text',
      { x: L + 6, y: Y(Jmin) - 6, 'font-size': 11, fill: 'var(--mut)' },
      'best possible ' + Jmin.toFixed(1),
    );
    el(
      csv,
      'text',
      { x: (L + RR) / 2, y: B + 40, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--mut)' },
      'Step (log scale)',
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
    [
      [R, 'var(--cr)', 'raw'],
      [S, 'var(--cs)', 'scaled'],
    ].forEach(([run, c, name]) => {
      const end = Math.min(k, run.J.length - 1);
      let d = '',
        off = -1;
      for (let i = 0; i <= end; i++) {
        if (run.J[i] > top) {
          off = i;
          d += 'L' + X(i).toFixed(1) + ' ' + T;
          break;
        }
        d += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(run.J[i]).toFixed(1);
      }
      el(csv, 'path', { d, fill: 'none', stroke: c, 'stroke-width': 2.6, 'stroke-linejoin': 'round' });
      if (off >= 0)
        el(
          csv,
          'text',
          { x: X(off), y: T + 5, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700, fill: c },
          '×',
        );
      else {
        const x = X(end),
          y = Y(run.J[end]);
        el(csv, 'circle', { cx: x, cy: y, r: 4.5, fill: c });
        el(csv, 'text', { x: Math.min(x + 8, RR - 50), y: y - 10, 'font-size': 12, 'font-weight': 600, fill: c }, name);
      }
    });
  }
  function card(id, run, name, a, c) {
    const end = Math.min(k, run.J.length - 1),
      blown = run.div && k >= run.div,
      J = run.J[end],
      gap = (J / Jmin - 1) * 100;
    const s = blown
      ? 'Blew up at step ' + run.div + '.'
      : run.hit && k >= run.hit
        ? 'Within 1% of the best since step ' + fmt(run.hit) + '.'
        : k === 0
          ? 'Not started.'
          : gap.toFixed(gap < 10 ? 1 : 0) + '% above the best.';
    const bw = blown ? 100 : clamp((Math.log(J / Jmin) / Math.log(J0 / Jmin)) * 100, 0, 100);
    document.getElementById(id).style.setProperty('--c', c);
    document.getElementById(id).innerHTML =
      `<div class="t"><b>${name}</b><span>α = ${a}</span></div><div class="n">${blown ? '∞' : J.toFixed(2)}</div><div class="s">${s}</div><div class="bar"><i style="width:${bw}%"></i></div>`;
  }
  function render() {
    drawCost();
    card('rcS', S, 'Scaled', aS, 'var(--cs)');
    card('rcR', R, 'Raw', 0.00015, 'var(--cr)');
    document.getElementById('scrub').value = k;
    document.getElementById('sk').textContent = fmt(k);
    document.getElementById('verdict').innerHTML = S.div
      ? 'Scaled features also have a limit, about 0.92 here. Pick a smaller α for them.'
      : `<b>Scaled</b> gets within 1% of the best cost in <b>${fmt(S.hit)}</b> steps. <b>Raw</b> needs <b>${fmt(raw1pct)}</b>, about ${fmt(raw1pct / S.hit)} times as many.`;
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
    // even pace on the log axis: each frame moves about the same distance
    k = Math.min(N, Math.max(k + 1, Math.round((k + 1) * Math.pow(N + 1, 1 / 150)) - 1));
    render();
    if (k >= N) {
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
    if (k >= N) k = 0;
    setPlay(true);
    tick();
  };
  document.getElementById('step').onclick = () => {
    stop();
    k = Math.min(N, k + 1);
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
  document.querySelectorAll('.seg.iters button').forEach(
    (x) =>
      (x.onclick = () => {
        N = +x.dataset.n;
        document.querySelectorAll('.seg.iters button').forEach((y) => y.classList.toggle('on', y === x));
        stop();
        runAll();
        k = Math.min(k, N);
        render();
      }),
  );
  function setA(a) {
    aS = a;
    document.querySelectorAll('.alph button').forEach((x) => x.classList.toggle('on', +x.dataset.a === a));
    document.getElementById('anote').textContent = ANOTE[a];
  }
  document.querySelectorAll('.alph button').forEach(
    (x) =>
      (x.onclick = () => {
        setA(+x.dataset.a);
        stop();
        runAll();
        k = 0;
        render();
      }),
  );
  setA(aS);
  const K = (s, id) => katex.render(s, document.getElementById(id), { throwOnError: false, displayMode: true });
  K('\\mu_j = \\frac{1}{m}\\sum_{i=1}^{m} x_j^{(i)}', 'm1');
  K('\\sigma_j = \\sqrt{\\frac{1}{m}\\sum_{i=1}^{m}\\big(x_j^{(i)}-\\mu_j\\big)^2}', 'm2');
  K('x_j^{(i)} := \\frac{x_j^{(i)}-\\mu_j}{\\sigma_j}', 'm3');
  const main = document.getElementById('main');
  ctx.load('house-train-4f.json').then((d) => {
    D = d;
    prep();
    runAll();
    setTimeout(() => {
      main.classList.remove('skel');
      main.setAttribute('aria-busy', 'false');
      drawStrip();
      drawZ();
      render();
    }, 300);
  });
  win.addEventListener('resize', () => {
    if (D.length) {
      drawStrip();
      render();
    }
  });

  return dispose;
}
