// Model Lab, step 9. Ported from the approved design draft docs/design/HouseLabStep9.html:
// the markup, then mount(), which runs the step's interactive code once its markup is on the page.
import katex from 'katex';

export const html = `<div id="main" class="skel" aria-busy="true">
    <div class="skonly" aria-hidden="true">
      <section class="card"><div class="sk" style="width:90px;height:14px;margin-bottom:12px"></div><div class="sk" style="width:30%;height:30px;margin-bottom:12px"></div><div class="sk" style="width:70%;height:16px;margin-bottom:22px"></div>
        <div class="sk" style="height:150px;border-radius:14px;margin-bottom:16px"></div>
        <div class="two"><div class="sk" style="height:420px;border-radius:14px"></div><div class="sk" style="height:420px;border-radius:14px"></div></div></section>
    </div>
    <div class="live">
    <section class="card" aria-labelledby="st">
      <span class="tag">Step 9 of 14</span>
      <h2 id="st">Learning rate</h2>
      <p class="goal">α sets how big each step down the cost is. Race several values on the same 48,332 ads, from the same start, and see which one gets lowest fastest.</p>

      <div class="player" role="group" aria-label="Training controls">
        <div class="prow">
          <button id="play" class="play" type="button" aria-label="Start the race"><svg id="playIcon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg></button>
          <button id="step" class="ibtn" type="button" aria-label="One step"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l10 7-10 7zM17 5h3v14h-3z" fill="currentColor"/></svg><span>Step</span></button>
          <button id="reset" class="ibtn" type="button" aria-label="Reset: back to the start"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v5h5"/></svg><span>Reset</span></button>
          <div class="scrub"><input id="scrub" type="range" min="0" max="500" value="0" aria-label="Step in the race"><div class="slab"><span>step <b id="sk">0</b> of <b id="sn">500</b></span></div></div>
          <div class="opt"><span>Steps</span><div class="seg iters" role="group" aria-label="Number of steps"><button data-n="100" type="button">100</button><button class="on" data-n="500" type="button">500</button><button data-n="2000" type="button">2,000</button></div></div>
        </div>
        <div class="lanes" role="group" aria-label="Learning rates in the race">
          <span class="lh">In the race</span>
          <div id="lanes"></div>
          <label class="own"><span class="sw" style="background:var(--c4)"></span><span>Your own α</span><input id="own" type="range" min="-6" max="-3.4" step="0.01" value="-3.796" aria-label="Your own learning rate"><b id="ownv"></b></label>
        </div>
        <span class="sandbox">Sandbox: the live model is not changed. The four fixed values are each about 3 times the one before.</span>
      </div>

      <div class="two">
        <figure class="plot">
          <div class="phead"><b>Cost after each step</b></div>
          <div class="pbox"><svg id="cost" viewBox="0 0 520 380" width="100%" role="img" aria-label="Cost after each step, one line per learning rate"></svg></div>
          <figcaption class="note">One line per α, all from the same start. Both axes are on a log scale, so the first few steps, where the race is decided, get room. A line that leaves the top has blown up: its cost grew without limit.</figcaption>
        </figure>
        <figure class="plot">
          <div class="phead"><b>The area weight, first 30 steps</b></div>
          <div class="pbox"><svg id="wt" viewBox="0 0 520 380" width="100%" role="img" aria-label="The area weight over the first 30 steps, one line per learning rate"></svg></div>
          <figcaption class="note">A small α walks up smoothly. Near the limit (yellow, 0.00016) it jumps past and back, a zig-zag that still settles. Past the limit (red, 0.0003) each jump is bigger than the last.</figcaption>
        </figure>
      </div>

      <div class="wide">
        <figure class="plot">
          <div class="phead"><b>Standings at step <span id="stk">0</span></b></div>
          <div id="board" class="board"></div>
          <figcaption class="note">Ranked by cost now: lower is better. The bar shows how far each run still is from the best possible cost, <span id="jmin"></span>.</figcaption>
        </figure>
      </div>

      <div class="box pick">
        <h3>How to pick α</h3>
        <ol>
          <li>Try values about 3 times apart, like the four here: 0.00001, 0.00003, 0.0001, 0.0003.</li>
          <li>Throw out any whose cost goes up, even once. Here 0.0003 blows up within a few steps.</li>
          <li>Keep the largest one left, here 0.0001, or try a little above it. Your own α can go up to about 0.00017 before it blows up.</li>
        </ol>
      </div>
    </section>
    </div>
  </div>`;

export const mathHtml = `<div class="mrow" tabindex="0"><span id="m1"></span><p>α multiplies every slope. Twice the α, twice the step, in every direction at once.</p></div>
        <div class="mrow" tabindex="0"><span id="m2"></span><p>The step must not be so big it lands higher up the far side. Here the limit is about 0.00017, set by the steepest direction of the bowl, which is area's.</p></div>`;

export const skHtml = ``;

/** Runs the step. `ctx.load(name)` gives its data; the returned function stops everything it started. */
export function mount(ctx) {
  const { setTimeout, requestAnimationFrame, cancelAnimationFrame, win, dispose } = ctx.scope();

  const ns = 'http://www.w3.org/2000/svg',
    csv = document.getElementById('cost'),
    wsv = document.getElementById('wt');
  const L = 56,
    R = 440,
    T = 16,
    B = 320,
    WSPAN = 30;
  const FIXED = [0.00001, 0.00003, 0.0001, 0.0003];
  let lanes = FIXED.map((a, i) => ({ a, c: 'var(--c' + i + ')', on: true })).concat([
    { a: 0.00016, c: 'var(--c4)', on: true, own: true },
  ]);
  let D = [],
    G = null,
    h = null,
    yy = 0,
    best = null,
    Jmin = 0,
    J0 = 0,
    N = 500,
    k = 0,
    playing = false,
    timer = 0;
  const clamp = (v, a, c) => Math.max(a, Math.min(c, v));
  const fa = (a) => {
    const d = Math.max(0, -Math.floor(Math.log10(a)) + 1);
    return String(+a.toFixed(d));
  };
  function el(par, t, a, txt) {
    const e = document.createElementNS(ns, t);
    for (const kk in a) e.setAttribute(kk, a[kk]);
    if (txt !== undefined) e.textContent = txt;
    par.appendChild(e);
    return e;
  }
  function prep() {
    const m = D.length;
    G = Array.from({ length: 5 }, () => Array(5).fill(0));
    h = Array(5).fill(0);
    yy = 0;
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
    best = solve(
      G.map((r) => r.slice()),
      h.slice(),
    );
    Jmin = Jc(best);
    J0 = Jc([0, 0, 0, 0, 0]);
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
    let q = 0,
      l = 0;
    for (let i = 0; i < 5; i++) {
      l += w[i] * h[i];
      for (let j = 0; j < 5; j++) q += w[i] * G[i][j] * w[j];
    }
    return (q - 2 * l + yy) / 2;
  }
  function run(l) {
    let w = [0, 0, 0, 0, 0];
    l.J = [J0];
    l.w0 = [0];
    l.div = 0;
    for (let i = 0; i < N; i++) {
      const g = w.map((_, r) => {
        let s = 0;
        for (let j = 0; j < 5; j++) s += G[r][j] * w[j];
        return s - h[r];
      });
      w = w.map((v, j) => v - l.a * g[j]);
      const J = Jc(w);
      if (!isFinite(J) || J > 1e6) {
        l.div = i + 1;
        l.J.push(1e6);
        l.w0.push(w[0]);
        break;
      }
      l.J.push(J);
      l.w0.push(w[0]);
    }
    let flips = 0;
    for (let i = 2; i < Math.min(12, l.w0.length); i++) {
      const d1 = l.w0[i] - l.w0[i - 1],
        d0 = l.w0[i - 1] - l.w0[i - 2];
      if (d1 * d0 < 0 && Math.abs(d1) > 0.02) flips++;
    }
    l.zig = flips >= 4;
  }
  function runAll() {
    lanes.forEach(run);
    const sc = document.getElementById('scrub');
    sc.max = N;
    document.getElementById('sn').textContent = N.toLocaleString('en-US');
  }
  // keep end labels from overlapping
  function spread(items, gap, lo, hi) {
    items.sort((a, b) => a.y - b.y);
    for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < gap) items[i].y = items[i - 1].y + gap;
    const over = items.length ? items[items.length - 1].y - hi : 0;
    if (over > 0)
      for (let i = items.length - 1; i >= 0; i--) {
        items[i].y -= over;
        if (i && items[i].y - items[i - 1].y >= gap) break;
      }
    items.forEach((it) => (it.y = Math.max(lo, it.y)));
    return items;
  }
  function drawCost() {
    csv.innerHTML = '';
    const top = J0 * 1.6,
      bot = Jmin * 0.97,
      X = (i) => L + (Math.log10(i + 1) / Math.log10(N + 1)) * (R - L),
      Y = (v) => B - (Math.log(v / bot) / Math.log(top / bot)) * (B - T);
    [40, 60, 100, 150, 250].forEach((v) => {
      el(csv, 'line', { x1: L, x2: R, y1: Y(v), y2: Y(v), stroke: 'var(--rule)' });
      el(csv, 'text', { x: L - 8, y: Y(v) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--mut)' }, v);
    });
    [0, 1, 10, 100, 1000]
      .filter((v) => v <= N)
      .concat([N])
      .filter((v, i, a) => a.indexOf(v) === i)
      .forEach((v) => {
        el(csv, 'line', { x1: X(v), x2: X(v), y1: T, y2: B, stroke: 'var(--rule)' });
        el(
          csv,
          'text',
          { x: X(v), y: B + 18, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--mut)' },
          v.toLocaleString('en-US'),
        );
      });
    el(csv, 'line', {
      x1: L,
      x2: R,
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
      { x: (L + R) / 2, y: B + 40, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--mut)' },
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
    const labs = [];
    lanes
      .filter((l) => l.on)
      .forEach((l) => {
        const end = Math.min(k, l.J.length - 1);
        let d = '';
        let off = -1;
        for (let i = 0; i <= end; i++) {
          if (l.J[i] > top) {
            off = i;
            d += 'L' + X(i).toFixed(1) + ' ' + T;
            break;
          }
          d += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(l.J[i]).toFixed(1);
        }
        el(csv, 'path', {
          d,
          fill: 'none',
          stroke: l.c,
          'stroke-width': l.own ? 2.6 : 2.2,
          'stroke-linejoin': 'round',
        });
        const blown = off >= 0;
        const ty = blown ? T - 2 : Y(l.J[end]),
          tx = X(blown ? off : end);
        if (blown) {
          el(
            csv,
            'text',
            { x: tx, y: T + 2, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700, fill: l.c },
            '×',
          );
        } else el(csv, 'circle', { cx: tx, cy: ty, r: 4, fill: l.c });
        labs.push({ y: blown ? T + 6 : ty, t: fa(l.a), c: l.c, x: tx });
      });
    spread(labs, 15, T + 4, B - 4).forEach((it) =>
      el(
        csv,
        'text',
        {
          x: R + 8,
          y: it.y + 4,
          'font-size': 12,
          'font-weight': 600,
          'font-family': 'Geist Mono Variable, monospace',
          fill: it.c,
        },
        it.t,
      ),
    );
  }
  function drawW() {
    wsv.innerHTML = '';
    const lo = -0.15,
      hi = 0.5,
      X = (i) => L + (i / WSPAN) * (R - L),
      Y = (v) => B - ((v - lo) / (hi - lo)) * (B - T),
      kk = Math.min(k, WSPAN);
    [-0.1, 0, 0.1, 0.2, 0.3, 0.4, 0.5].forEach((v) => {
      el(wsv, 'line', { x1: L, x2: R, y1: Y(v), y2: Y(v), stroke: v === 0 ? 'var(--mut)' : 'var(--rule)' });
      el(
        wsv,
        'text',
        { x: L - 8, y: Y(v) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--mut)' },
        v.toFixed(1),
      );
    });
    [0, 10, 20, 30].forEach((v) =>
      el(wsv, 'text', { x: X(v), y: B + 18, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--mut)' }, v),
    );
    el(
      wsv,
      'text',
      { x: (L + R) / 2, y: B + 40, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--mut)' },
      'Step',
    );
    el(
      wsv,
      'text',
      {
        x: 14,
        y: (T + B) / 2,
        'text-anchor': 'middle',
        'font-size': 13,
        fill: 'var(--mut)',
        transform: 'rotate(-90 14 ' + (T + B) / 2 + ')',
      },
      'Area weight (billion toman per m²)',
    );
    const labs = [];
    lanes
      .filter((l) => l.on)
      .forEach((l) => {
        const end = Math.min(kk, l.w0.length - 1);
        let d = '',
          out = -1;
        for (let i = 0; i <= end; i++) {
          const v = l.w0[i];
          if (v > hi + 0.02 || v < lo - 0.02) {
            out = i;
            d += 'L' + X(i).toFixed(1) + ' ' + clamp(Y(v), T - 4, B + 4).toFixed(1);
            break;
          }
          d += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1);
        }
        el(wsv, 'path', {
          d,
          fill: 'none',
          stroke: l.c,
          'stroke-width': l.own ? 2.6 : 2.2,
          'stroke-linejoin': 'round',
        });
        if (out >= 0) {
          const y = l.w0[out] > hi ? T + 2 : B + 2;
          el(
            wsv,
            'text',
            { x: X(out), y: y + 4, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700, fill: l.c },
            '×',
          );
          labs.push({ y: clamp(y, T + 4, B - 4), t: fa(l.a), c: l.c });
        } else {
          const y = Y(l.w0[end]);
          el(wsv, 'circle', { cx: X(end), cy: y, r: 4, fill: l.c });
          labs.push({ y, t: fa(l.a), c: l.c });
        }
      });
    spread(labs, 15, T + 4, B - 4).forEach((it) =>
      el(
        wsv,
        'text',
        {
          x: R + 8,
          y: it.y + 4,
          'font-size': 12,
          'font-weight': 600,
          'font-family': 'Geist Mono Variable, monospace',
          fill: it.c,
        },
        it.t,
      ),
    );
  }
  function drawBoard() {
    document.getElementById('stk').textContent = k.toLocaleString('en-US');
    const rows = lanes
      .filter((l) => l.on)
      .map((l) => {
        const blown = l.div && k >= l.div;
        const J = blown ? Infinity : l.J[Math.min(k, l.J.length - 1)];
        return { l, J, blown };
      })
      .sort((a, b) => a.J - b.J);
    const span = Math.log(J0 / Jmin);
    document.getElementById('board').innerHTML = rows
      .map((r, i) => {
        const l = r.l;
        const wd = r.blown ? 100 : clamp((Math.log(r.J / Jmin) / span) * 100, 1, 100);
        let st = r.blown
          ? 'blew up at step ' + l.div
          : l.div
            ? 'about to blow up'
            : i === 0 && k > 0
              ? 'lowest now'
              : l.zig
                ? 'zig-zags'
                : l.a <= 0.00001
                  ? 'smooth, slow'
                  : 'smooth';
        const cls = r.blown || (l.div && !r.blown) ? 'bad' : i === 0 && k > 0 ? 'lead' : '';
        return `<div class="row"><span class="rk">${i + 1}</span><span class="al"><span class="sw" style="background:${l.c}"></span>${fa(l.a)}${l.own ? ' <small>yours</small>' : ''}</span><span class="tr"><i style="width:${wd}%;background:${l.c};opacity:${r.blown ? 0.35 : 0.9}"></i></span><span class="jv">${r.blown ? '∞' : r.J.toFixed(2)}</span><span class="stt ${cls}">${st}</span></div>`;
      })
      .join('');
  }
  function render() {
    drawCost();
    drawW();
    drawBoard();
    document.getElementById('scrub').value = k;
    document.getElementById('sk').textContent = k.toLocaleString('en-US');
  }
  function lanesUI() {
    document.getElementById('lanes').innerHTML = lanes
      .filter((l) => !l.own)
      .map(
        (l, i) =>
          `<button class="lane" type="button" data-i="${i}" aria-pressed="${l.on}"><span class="sw" style="background:${l.c}"></span>${fa(l.a)}</button>`,
      )
      .join('');
    document.querySelectorAll('.lane').forEach(
      (b) =>
        (b.onclick = () => {
          const l = lanes[+b.dataset.i];
          l.on = !l.on;
          b.setAttribute('aria-pressed', l.on);
          render();
        }),
    );
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
    // slow at the start so the early zig-zag and the blow-up can be seen
    const inc = k < 30 ? 1 : Math.max(1, Math.round(N / 120));
    k = Math.min(N, k + inc);
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
  const own = lanes[4],
    ownIn = document.getElementById('own');
  function setOwn() {
    const raw = 10 ** +ownIn.value,
      p = 10 ** Math.floor(Math.log10(raw) - 1);
    own.a = Math.round(raw / p) * p;
    document.getElementById('ownv').textContent = fa(own.a);
  }
  ownIn.oninput = () => {
    setOwn();
    run(own);
    if (D.length) render();
  };
  setOwn();
  const K = (s, id) => katex.render(s, document.getElementById(id), { throwOnError: false, displayMode: true });
  K(
    'w_j := w_j - \\alpha\\,\\frac{\\partial J}{\\partial w_j}, \\qquad b := b - \\alpha\\,\\frac{\\partial J}{\\partial b}',
    'm1',
  );
  K('\\alpha < \\frac{2}{\\lambda_{\\max}} \\approx 0.00017 \\quad\\text{here}', 'm2');
  lanesUI();
  const main = document.getElementById('main');
  ctx.load('house-train-4f.json').then((d) => {
    D = d;
    prep();
    runAll();
    document.getElementById('jmin').textContent = Jmin.toFixed(1);
    setTimeout(() => {
      main.classList.remove('skel');
      main.setAttribute('aria-busy', 'false');
      render();
    }, 400);
  });
  win.addEventListener('resize', () => {
    if (D.length) render();
  });

  return dispose;
}
