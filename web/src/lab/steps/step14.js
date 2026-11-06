// Model Lab, step 14. Ported from the approved design draft docs/design/HouseLabStep14.html:
// the markup, then mount(), which runs the step's interactive code once its markup is on the page.
import katex from 'katex';

export const html = `<div id="main" class="skel" aria-busy="true">
    <div class="skonly" aria-hidden="true">
      <section class="card"><div class="sk" style="width:90px;height:14px;margin-bottom:12px"></div><div class="sk" style="width:34%;height:30px;margin-bottom:12px"></div><div class="sk" style="width:70%;height:16px;margin-bottom:22px"></div>
        <div class="sk" style="height:90px;border-radius:14px;margin-bottom:16px"></div>
        <div class="sk" style="height:150px;border-radius:14px"></div></section>
    </div>
    <div class="live">
    <section class="card" aria-labelledby="st">
      <span class="tag">Step 14 of 14</span>
      <h2 id="st">Held-out result</h2>
      <p class="goal">The final check. The live model, everything from steps 1 to 13, is scored once on two months of ads it never saw and that played no part in any choice.</p>

      <div class="time" id="time" aria-label="How the months were used"></div>

      <div class="three" id="three"></div>
      <p class="small" id="threeNote"></p>
    </section>

    <section class="card" aria-labelledby="st2">
      <h2 id="st2" class="h2b">Every held-out ad</h2>
      <div class="two">
        <figure class="plot">
          <div class="phead"><b>Estimate against asked price</b></div>
          <div class="pbox"><canvas id="dots" aria-hidden="true"></canvas><svg id="sc" viewBox="0 0 520 420" width="100%" role="img" aria-label="Each held-out ad: the model's estimate across, the asked price up"></svg></div>
          <figcaption class="note">All <span id="nAll"></span> ads from November and December 2024. On the dashed line the estimate equals the asked price; the shaded band is within 25%. <span id="nOut"></span> ads above 50 billion are left off the chart. Click any dot to see that ad.</figcaption>
        </figure>
        <div class="side">
          <div class="box adcard" id="adcard"></div>
          <div class="box"><h3>How far off</h3>
            <div class="bars" id="hist"></div>
            <p class="small" id="histNote"></p></div>
        </div>
      </div>
    </section>

    <section class="card" aria-labelledby="st3">
      <h2 id="st3" class="h2b">Checked against scikit-learn</h2>
      <p class="goal">The same features, fitted by scikit-learn and scored on the same held-out ads.</p>
      <div class="cmp" id="cmp"></div>
      <div class="two" style="margin-top:16px">
        <div class="box"><h3>Run it yourself</h3><pre class="cmd">python -m training.train</pre><p class="small">Downloads the ads, cleans them, trains, picks λ on October, then scores November and December once. Every number on this page comes from that run's saved model.</p></div>
        <div class="box"><h3>Prices then and now</h3><p class="small">These are asking prices from November and December 2024. Tehran asking prices are about 3 times higher today, which is why the estimate page labels every price with its date.</p></div>
      </div>
    </section>
    </div>
  </div>`;

export const mathHtml = `<div class="mrow" tabindex="0"><span id="m1"></span><p>The step 4 cost on the held-out ads. No λ term: the penalty is for training, not for judging.</p></div>
        <div class="mrow" tabindex="0"><span id="m2"></span><p>The gap people understand: how far each estimate is from the asked price. Half the ads are closer than the median.</p></div>`;

export const skHtml = `<pre>from sklearn.linear_model import Ridge</pre><p>The same penalized linear regression (step 13).</p>
        <pre>model = Ridge(alpha=100).fit(X_train, y_train)</pre><p>λ = 100, the value October picked.</p>
        <pre>err = model.predict(X_held) - y_held</pre><p>Misses on the same held-out ads.</p>
        <pre>j_held = (err ** 2).mean() / 2</pre><p>The same cost. This project splits by month rather than with train_test_split, because prices rise over time and a random split would let the model peek at later prices.</p>`;

/** Runs the step. `ctx.load(name)` gives its data; the returned function stops everything it started. */
export function mount(ctx) {
  const { setTimeout, requestAnimationFrame, cancelAnimationFrame, win, dispose } = ctx.scope();

  const ns = 'http://www.w3.org/2000/svg',
    svg = document.getElementById('sc'),
    cv = document.getElementById('dots');
  const L = 56,
    R = 505,
    T = 14,
    B = 356,
    PM = 50;
  let D = null,
    sel = -1;
  const fx = (v) => L + (Math.min(v, PM) / PM) * (R - L),
    fy = (v) => B - (Math.min(v, PM) / PM) * (B - T),
    num = (v) => v.toLocaleString('en-US');
  function el(par, t, a, txt) {
    const e = document.createElementNS(ns, t);
    for (const kk in a) e.setAttribute(kk, a[kk]);
    if (txt !== undefined) e.textContent = txt;
    par.appendChild(e);
    return e;
  }
  function drawTop() {
    const r = D.rowsN,
      c = D.cost;
    document.getElementById('time').innerHTML =
      `<div style="background:var(--acs)"><b>May to September 2024</b><span>${num(r.train)} ads train the weights</span></div><div style="background:rgba(47,111,219,.16)"><b>October</b><span>${num(r.selection)} ads pick λ</span></div><div style="background:rgba(138,79,209,.18)"><b>November and December</b><span>${num(r.held_out)} ads, the final check</span></div>`;
    document.getElementById('three').innerHTML = [
      ['Cost on the training ads', c.train, 'what it learned from', 'var(--ac)'],
      ['Cost on October', c.selection, 'used to pick λ', 'var(--cs)'],
      ['Cost on November and December', c.held_out, 'never seen, never used', 'var(--ch)'],
    ]
      .map(
        ([t, v, s, col]) =>
          `<div class="num" style="--c:${col}"><span>${t}</span><b>${v.toFixed(2)}</b><small>${s}</small></div>`,
      )
      .join('');
    document.getElementById('threeNote').innerHTML =
      `On months it never saw, the cost rises only from <b>${c.train.toFixed(2)}</b> to <b>${c.held_out.toFixed(2)}</b>. A model that had memorized its training ads would jump far higher (step 12). Prices also edged up after training: the median price per m² was 83.8 million toman in September and 88.0 million in December, which makes later months a little harder.`;
  }
  function fitCanvas() {
    const r = svg.getBoundingClientRect(),
      dpr = window.devicePixelRatio || 1,
      s = r.width / 520;
    cv.style.width = r.width + 'px';
    cv.style.height = r.height + 'px';
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    const c = cv.getContext('2d');
    c.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
    c.clearRect(0, 0, 520, 420);
    return c;
  }
  function drawScatter() {
    const c = fitCanvas();
    c.fillStyle = getComputedStyle(document.getElementById('main')).getPropertyValue('--ch').trim();
    c.globalAlpha = 0.12;
    for (const r of D.rows) {
      if (r[0] > PM || r[1] > PM) continue;
      c.beginPath();
      c.arc(fx(r[0]), fy(r[1]), 1.9, 0, 6.283);
      c.fill();
    }
    svg.innerHTML = '';
    el(svg, 'path', {
      d: `M${fx(0)} ${fy(0)}L${fx(PM / 1.25)} ${fy(PM)}L${fx(PM)} ${fy(PM)}L${fx(PM)} ${fy(PM * 0.75)}Z`,
      fill: 'var(--ac)',
      opacity: 0.1,
    });
    [0, 10, 20, 30, 40, 50].forEach((v) => {
      el(svg, 'line', { x1: L, x2: R, y1: fy(v), y2: fy(v), stroke: 'var(--rule)' });
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
      { x: (L + R) / 2, y: B + 40, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--mut)' },
      'Model estimate (billion toman)',
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
      'Asked price (billion toman)',
    );
    const hit = el(svg, 'rect', {
      x: L,
      y: T,
      width: R - L,
      height: B - T,
      fill: 'transparent',
      style: 'cursor:crosshair',
    });
    hit.addEventListener('click', (e) => {
      const p = svg.createSVGPoint();
      p.x = e.clientX;
      p.y = e.clientY;
      const q = p.matrixTransform(svg.getScreenCTM().inverse());
      let bi = 0,
        bd = 1e9;
      D.rows.forEach((r, i) => {
        if (r[0] > PM || r[1] > PM) return;
        const d = (fx(r[0]) - q.x) ** 2 + (fy(r[1]) - q.y) ** 2;
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      sel = bi;
      drawScatter();
      drawAd();
    });
    if (sel >= 0) {
      const r = D.rows[sel];
      el(svg, 'circle', { cx: fx(r[0]), cy: fy(r[1]), r: 8, fill: 'none', stroke: 'var(--warn)', 'stroke-width': 3 });
      el(svg, 'circle', { cx: fx(r[0]), cy: fy(r[1]), r: 3, fill: 'var(--warn)' });
    }
  }
  function drawAd() {
    const r = D.rows[sel],
      off = r[0] - r[1],
      sh = (Math.abs(off) / r[1]) * 100,
      h = r[4] >= 0 ? D.hoods[r[4]] : 'Neighborhood not given';
    document.getElementById('adcard').innerHTML =
      `<h3>${h}</h3><div class="adrow"><span>Area</span><b>${r[2]} m²</b><span>Bedrooms</span><b>${r[3]}</b><span>Model estimate</span><b>${r[0].toFixed(2)} billion</b><span>Asked</span><b>${r[1].toFixed(2)} billion</b><span>Off by</span><b class="off">${off >= 0 ? '+' : '−'}${Math.abs(off).toFixed(2)} (${sh.toFixed(0)}%)</b></div>`;
  }
  function drawHist() {
    const sh = D.rows.map((r) => Math.abs(r[0] - r[1]) / r[1]),
      n = sh.length,
      edges = [0, 0.1, 0.2, 0.3, 0.5, 1, Infinity],
      labs = ['under 10%', '10 to 20%', '20 to 30%', '30 to 50%', '50 to 100%', 'over 100%'];
    const cnt = labs.map((_, i) => sh.filter((v) => v >= edges[i] && v < edges[i + 1]).length),
      mx = Math.max(...cnt);
    document.getElementById('hist').innerHTML = labs
      .map(
        (l, i) =>
          `<div class="hb${i >= 4 ? ' far' : ''}"><span>${l}</span><span class="tr"><i style="width:${(cnt[i] / mx) * 100}%"></i></span><b>${Math.round((cnt[i] / n) * 100)}%</b></div>`,
      )
      .join('');
    const g = D.gap;
    document.getElementById('histNote').innerHTML =
      `Half of the estimates are within <b>${g.median_billions.toFixed(2)} billion</b> (${(g.median_share_of_price * 100).toFixed(0)}% of the price) of the asked price. Nine in ten are within ${g.p90_billions.toFixed(2)} billion (${(g.p90_share_of_price * 100).toFixed(0)}%). The model only knows area, bedrooms, age, parking, elevator, storage and the neighborhood's usual price, so it cannot see a flat's view, floor or renovation; some misses come from that.`;
  }
  function drawCmp() {
    const c = D.cost.held_out,
      s = D.sklearn;
    document.getElementById('cmp').innerHTML = [
      ['This project, from scratch', c, 'NumPy gradient descent, λ = 100, 5,000 steps'],
      [
        'scikit-learn Ridge',
        s.ridge,
        'same features, same λ: ' +
          (Math.abs(s.ridge - c) < 0.001 ? 'the same result' : 'within ' + Math.abs(s.ridge - c).toFixed(3)),
      ],
      [
        'scikit-learn LinearRegression',
        s.linear_regression,
        'no penalty: ' + (s.linear_regression < c ? 'slightly lower' : 'slightly higher') + ' on these months',
      ],
    ]
      .map(([t, v, x]) => `<div class="cm"><span>${t}</span><b>${v.toFixed(3)}</b><small>${x}</small></div>`)
      .join('');
  }
  const K = (s, id) => katex.render(s, document.getElementById(id), { throwOnError: false, displayMode: true });
  K('J_{\\text{held-out}} = \\frac{1}{2m_h}\\sum_{i=1}^{m_h}\\big(f(\\mathbf{x}^{(i)})-y^{(i)}\\big)^2', 'm1');
  K(
    '\\text{gap}^{(i)} = \\big|f(\\mathbf{x}^{(i)})-y^{(i)}\\big|, \\qquad \\text{median gap} = 1.10\\text{ billion}',
    'm2',
  );
  const main = document.getElementById('main');
  ctx.load('house-heldout.json').then((d) => {
    D = d;
    document.getElementById('nAll').textContent = num(D.rows.length);
    document.getElementById('nOut').textContent = num(D.rows.filter((r) => r[0] > PM || r[1] > PM).length);
    // start on a typical ad: the one whose gap is closest to the median
    const med = D.gap.median_billions;
    let bi = 0,
      bd = 1e9;
    D.rows.forEach((r, i) => {
      const g = Math.abs(Math.abs(r[0] - r[1]) - med) + (r[4] < 0 ? 9 : 0) + (r[1] > 30 ? 9 : 0);
      if (g < bd) {
        bd = g;
        bi = i;
      }
    });
    sel = bi;
    setTimeout(() => {
      main.classList.remove('skel');
      main.setAttribute('aria-busy', 'false');
      drawTop();
      drawScatter();
      drawAd();
      drawHist();
      drawCmp();
    }, 300);
  });
  win.addEventListener('resize', () => {
    if (D) drawScatter();
  });

  return dispose;
}
