// Model Lab, step 14: log price. Why version 2 of the model predicts the log of the price, with
// the October comparison from training/compare_targets.py (lab-logprice.json).
import katex from 'katex';

export const html = `<div id="main" class="skel" aria-busy="true">
    <div class="skonly" aria-hidden="true">
      <section class="card"><div class="sk" style="width:90px;height:14px;margin-bottom:12px"></div><div class="sk" style="width:34%;height:30px;margin-bottom:12px"></div><div class="sk" style="width:70%;height:16px;margin-bottom:22px"></div>
        <div class="sk" style="height:90px;border-radius:14px;margin-bottom:16px"></div>
        <div class="sk" style="height:150px;border-radius:14px"></div></section>
    </div>
    <div class="live">
    <section class="card" aria-labelledby="st">
      <span class="tag">Step 14 of 15</span>
      <h2 id="st">Log price</h2>
      <p class="goal">Steps 4 to 13 judged the model by its miss in billions, squared. That makes a miss on an expensive flat count far more than the same share of miss on a cheap one. Measuring on the log of the price fixes that. It was the biggest improvement this project found.</p>

      <h3 class="h3b">The same two mistakes, measured two ways</h3>
      <p class="small lead">Two flats, and the model is <b>20% too high on both</b>. One is a cheap flat of 4 billion. The other is yours: drag to set its price.</p>
      <div class="player" role="group" aria-label="Your flat">
        <div class="prow">
          <label class="lam" for="price"><span>Your flat's asked price</span><span class="lw"><input id="price" type="range" min="1" max="40" step="0.5" value="20"></span><b id="pv">20.0 billion</b></label>
        </div>
      </div>

      <figure class="rulers" aria-labelledby="rcap">
        <div class="legend">
          <span class="key"><i class="kc"></i>Cheap flat: <b id="lgC"></b></span>
          <span class="key"><i class="kd"></i>Your flat: <b id="lgD"></b></span>
          <span class="key"><i class="kb"></i>a bar runs from the asked price to the estimate</span>
        </div>
        <div class="rrow">
          <div class="rhead"><b>Plain ruler</b><span>every billion is the same width. How version 1 measured a miss.</span></div>
          <svg id="r1" viewBox="0 0 520 64" width="100%" role="img"></svg>
          <div class="rval" id="rv1"></div>
        </div>
        <div class="rrow">
          <div class="rhead"><b>Log ruler</b><span>every doubling is the same width. How version 2 measures a miss.</span></div>
          <svg id="r2" viewBox="0 0 520 64" width="100%" role="img"></svg>
          <div class="rval" id="rv2"></div>
        </div>
        <figcaption id="rcap" class="note">On the plain ruler the same 20% mistake looks bigger the dearer the flat. On the log ruler it is always the same length, because log(a) − log(b) = log(a ÷ b) depends only on the share. The model's cost squares these lengths, so the cards below show what each ruler charges.</figcaption>
      </figure>

      <div class="three" id="three"></div>
      <p class="small" id="threeNote"></p>
    </section>

    <section class="card" aria-labelledby="st3">
      <h2 id="st3" class="h2b">Three ways, judged on October</h2>
      <p class="goal" id="cmpGoal"></p>
      <div class="cmp" id="cmp"></div>
      <h3 class="h3b">Typical miss by price, October</h3>
      <div class="bars" id="quarters"></div>
      <p class="small"><span class="key"><i class="kp"></i>Price (version 1)</span> <span class="key"><i class="kl"></i>Log price and log inputs (version 2)</span></p>
      <p class="small" id="cmpNote"></p>
    </section>

    <section class="card" aria-labelledby="st4">
      <h2 id="st4" class="h2b">What changed in the model</h2>
      <div class="two">
        <div class="box"><h3>The model now</h3><p class="small" id="model"></p></div>
        <div class="box"><h3>Still linear regression</h3><p class="small">w · x + b is the same weighted sum, trained by the same gradient descent on the same cost formula from step 4. Only the number it predicts, and two of its inputs, are logs. exp turns the answer back into billions of toman, and exp is always above zero, so no estimate can be zero or negative.</p></div>
      </div>
    </section>
    </div>
  </div>`;

export const mathHtml = `<div class="mrow" tabindex="0"><span id="m1"></span><p>The step 4 cost with one change: the model is compared with the log of each asked price.</p></div>
        <div class="mrow" tabindex="0"><span id="m2"></span><p>Why that helps: a gap between two logs depends only on the ratio of the prices, so the same share of miss costs the same for every flat.</p></div>
        <div class="mrow" tabindex="0"><span id="m3"></span><p>The estimate in billions: exp undoes the log.</p></div>`;

export const skHtml = `<pre>from sklearn.compose import TransformedTargetRegressor</pre><p>Wraps a regressor so it learns a changed target.</p>
        <pre>model = TransformedTargetRegressor(
    LinearRegression(), func=np.log, inverse_func=np.exp)</pre><p>Trains on log(y) and answers with exp, as this project does by hand.</p>
        <pre>model.fit(X_train, y_train)</pre><p>X holds log(area), log(location) and the other features, scaled as in step 10.</p>
        <pre>estimate = model.predict(X_new)</pre><p>Already back in billions of toman.</p>`;

const MISS = 1.2; // every estimate in the first card is 20% too high
const REF = 4; // the cheap flat the dearer ones are compared with

/** Runs the step. `ctx.load(name)` gives its data; the returned function stops everything it started. */
export function mount(ctx) {
  const { setTimeout, dispose } = ctx.scope();
  const ns = 'http://www.w3.org/2000/svg';
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  const input = document.getElementById('price');

  function el(par, t, a, txt) {
    const e = document.createElementNS(ns, t);
    for (const k in a) e.setAttribute(k, a[k]);
    if (txt !== undefined) e.textContent = txt;
    par.appendChild(e);
    return e;
  }

  function drawMiss() {
    const p = Number(input.value);
    const miss = p * (MISS - 1);
    const billions = miss ** 2 / 2;
    const logCost = Math.log(MISS) ** 2 / 2;
    const refCost = (REF * (MISS - 1)) ** 2 / 2;
    document.getElementById('pv').textContent = `${p.toFixed(1)} billion`;
    drawRulers(p);
    document.getElementById('three').innerHTML = [
      ["Your flat's miss", miss.toFixed(2), 'billion toman, 20% of its price', 'var(--cd)'],
      ['Its cost on the plain ruler', billions.toFixed(2), '(bar length)² ÷ 2: grows with the price', 'var(--cp)'],
      ['Its cost on the log ruler', logCost.toFixed(4), '(bar length)² ÷ 2: the same for every flat', 'var(--cl)'],
    ]
      .map(
        ([t, v, s, c]) =>
          `<div class="num" style="--c:${c}"><span>${t}</span><b>${v}</b><small>${s}</small></div>`,
      )
      .join('');
    const times = billions / refCost;
    document.getElementById('threeNote').innerHTML =
      p === REF
        ? `Both flats are now the same. Drag the price up: on the plain ruler your flat's cost grows with the square of its price, while on the log ruler it never changes.`
        : `Your flat's miss costs <b>${times.toFixed(times < 10 ? 1 : 0)} times as much</b> as the cheap flat's on the plain ruler, and <b>exactly the same</b> on the log ruler. Gradient descent fixes whatever costs most, so on the plain ruler it works for the dear flats and lets cheap ones miss by a larger share.`;
  }

  // Two rulers, each with the cheap flat's mistake and yours drawn as bars from the asked
  // price to the estimate. Lanes keep the two bars apart when the prices are close.
  const L = 14,
    R = 506,
    AXIS = 40;
  const RULERS = {
    r1: { at: (v) => L + (v / 50) * (R - L), ticks: [0, 10, 20, 30, 40, 50] },
    r2: { at: (v) => L + (Math.log2(v) / 6) * (R - L), ticks: [1, 2, 4, 8, 16, 32, 64] },
  };

  function drawRuler(id, flats) {
    const { at, ticks } = RULERS[id];
    const svg = document.getElementById(id);
    svg.innerHTML = '';
    el(svg, 'line', { x1: L, x2: R, y1: AXIS, y2: AXIS, stroke: 'var(--ink)', 'stroke-width': 1.5 });
    for (const v of ticks) {
      el(svg, 'line', { x1: at(v), x2: at(v), y1: AXIS - 5, y2: AXIS + 5, stroke: 'var(--ink)', 'stroke-width': 1.5 });
      const anchor = v === ticks[0] ? 'start' : v === ticks[ticks.length - 1] ? 'end' : 'middle';
      el(svg, 'text', { x: at(v), y: AXIS + 21, 'text-anchor': anchor, 'font-size': 15, fill: 'var(--mut)' }, v);
    }
    flats.forEach(([price, colour], lane) => {
      const x1 = at(price),
        x2 = at(price * MISS),
        y = 8 + lane * 12;
      el(svg, 'line', { x1, x2: x1, y1: y, y2: AXIS, stroke: colour, 'stroke-width': 1, 'stroke-dasharray': '2 2' });
      el(svg, 'rect', { x: x1, y, width: Math.max(2, x2 - x1), height: 8, fill: colour, rx: 2 });
    });
  }

  function drawRulers(p) {
    const fmt = (v) => `${v.toFixed(1)} → ${(v * MISS).toFixed(1)} billion`;
    document.getElementById('lgC').textContent = fmt(REF);
    document.getElementById('lgD').textContent = fmt(p);
    const flats = [
      [REF, 'var(--cc)'],
      [p, 'var(--cd)'],
    ];
    drawRuler('r1', flats);
    drawRuler('r2', flats);
    const cheap = REF * (MISS - 1),
      yours = p * (MISS - 1),
      ratio = yours / cheap,
      logLen = Math.log(MISS);
    document.getElementById('r1').setAttribute(
      'aria-label',
      `Plain ruler, 0 to 50 billion. The cheap flat's bar is ${cheap.toFixed(2)} billion long, yours is ${yours.toFixed(2)}.`,
    );
    document.getElementById('r2').setAttribute(
      'aria-label',
      `Log ruler, 1 to 64 billion. Both bars are ${logLen.toFixed(3)} long.`,
    );
    document.getElementById('rv1').innerHTML =
      `<span>bar lengths</span><b>${cheap.toFixed(2)} and ${yours.toFixed(2)}</b><span>${p === REF ? 'the same' : `yours is ${ratio.toFixed(1)} times as long`}</span>`;
    document.getElementById('rv2').innerHTML =
      `<span>bar lengths</span><b>${logLen.toFixed(3)} and ${logLen.toFixed(3)}</b><span>the same, at any price</span>`;
  }

  function drawCompare(d) {
    const by = Object.fromEntries(d.approaches.map((a) => [a.key, a]));
    const best = d.approaches.reduce((a, b) => (b.median_share_of_price < a.median_share_of_price ? b : a));
    document.getElementById('cmpGoal').textContent =
      `Each way trained the same ${d.candidates} versions on May to September and kept its own best on October. ` +
      `Then the three winners were compared on October's ${d.ads.toLocaleString('en-US')} ads. November and December were not used.`;
    document.getElementById('cmp').innerHTML = d.approaches
      .map(
        (a) =>
          `<div class="cm${a === best ? ' win' : ''}"><span>${a.label}${a.key === 'price' ? ' (version 1)' : ''}${a === best ? ' (version 2)' : ''}</span><b>${pct(a.median_share_of_price)}</b><small>typical miss. One in ten off by more than ${pct(a.p90_share_of_price)}. Cost in billions ${a.cost_billions.toFixed(2)}.</small></div>`,
      )
      .join('');
    const p = by.price,
      l = by.log_both;
    const mx = Math.max(...p.quarters.map((q) => q.median_share), ...l.quarters.map((q) => q.median_share));
    const row = (cls, label, v) =>
      `<div class="hb ${cls}"><span>${label}</span><span class="tr"><i style="width:${(v / mx) * 100}%"></i></span><b>${pct(v)}</b></div>`;
    document.getElementById('quarters').innerHTML = p.quarters
      .map((q, i) => {
        const name = `${q.from.toFixed(1)} to ${q.to.toFixed(1)}`;
        return `<div class="qg"><p class="ql">${['Cheapest quarter', 'Second quarter', 'Third quarter', 'Dearest quarter'][i]}: ${name} billion</p>${row('p', 'price', q.median_share)}${row('l', 'log', l.quarters[i].median_share)}</div>`;
      })
      .join('');
    const b = by.log_price;
    document.getElementById('cmpNote').innerHTML =
      `Taking the log of the price alone made things worse (${pct(b.median_share_of_price)}): a straight line cannot connect plain area to log price, because on the log scale price bends. ` +
      `Taking the log of area and location as well puts both sides on the same ruler, where the relationship really is straight: log(price) is close to log(area) + log(price per m²). ` +
      `The gain is biggest on cheap flats; the dearest quarter loses a little.`;
    document.getElementById('model').innerHTML =
      `f(x) = exp(w · x + b), with <b>${l.features.join(', ')}</b> and λ = ${l.lambda}.`;
  }

  const K = (s, id) => katex.render(s, document.getElementById(id), { throwOnError: false, displayMode: true });
  K('J(\\mathbf{w},b) = \\frac{1}{2m}\\sum_{i=1}^{m}\\big(\\mathbf{w}\\cdot\\mathbf{x}^{(i)}+b-\\ln y^{(i)}\\big)^2', 'm1');
  K('\\ln a - \\ln b = \\ln\\frac{a}{b}', 'm2');
  K('f(\\mathbf{x}) = e^{\\,\\mathbf{w}\\cdot\\mathbf{x}+b}', 'm3');

  input.addEventListener('input', drawMiss);
  const main = document.getElementById('main');
  ctx.load('house-logprice.json').then((d) => {
    setTimeout(() => {
      main.classList.remove('skel');
      main.setAttribute('aria-busy', 'false');
      drawMiss();
      drawCompare(d);
    }, 300);
  });

  return dispose;
}
