// Model Lab, step 7. Ported from the approved design draft docs/design/HouseLabStep7.html:
// the markup, then mount(), which runs the step's interactive code once its markup is on the page.
import katex from 'katex';

export const html = `<div id="main" class="skel" aria-busy="true">
    <div class="skonly" aria-hidden="true">
      <section class="card"><div class="sk" style="width:90px;height:14px;margin-bottom:12px"></div><div class="sk" style="width:36%;height:30px;margin-bottom:12px"></div><div class="sk" style="width:70%;height:16px;margin-bottom:22px"></div>
        <div class="sk" style="height:330px;border-radius:14px;margin-bottom:18px"></div><div class="two"><div class="sk" style="height:260px;border-radius:14px"></div><div class="sk" style="height:260px;border-radius:14px"></div></div></section>
    </div>
    <div class="live">
    <section class="card" aria-labelledby="st">
      <span class="tag">Step 7 of 14</span>
      <h2 id="st">Vectorization</h2>
      <p class="goal">With many features, a prediction is many multiplications added up. A loop does them one by one; a dot product does them all at once, with the same answer, much faster.</p>

      <figure class="plot">
        <div class="phead"><b>One ad, four features</b>
          <div class="hctl"><button id="prevAd" class="ibtn" type="button" aria-label="Previous ad">‹</button><span id="adLab" class="adlab"></span><button id="nextAd" class="ibtn" type="button" aria-label="Next ad">›</button></div></div>
        <div class="vec">
          <div class="vrow"><span class="vname">x <small>this ad</small></span><div class="cells" id="xc"></div></div>
          <div class="vrow"><span class="vname">w <small>weights</small></span><div class="cells" id="wc"></div></div>
          <div class="vrow"><span class="vname">w × x</span><div class="cells" id="pc"></div></div>
        </div>
        <div class="runbar">
          <div class="seg" role="group" aria-label="How to compute"><button class="on" data-m="loop" type="button">Loop, one at a time</button><button data-m="dot" type="button">Dot product, all at once</button></div>
          <button id="go" class="play2" type="button">▶ Run</button>
          <div class="result" aria-live="polite"><span>w · x + b =</span><b id="sum"></b><small id="sumNote"></small></div>
        </div>
        <figcaption class="note">Weights come from a least-squares fit on all 48,332 training ads using these four features. Bedrooms gets a negative weight: for the same area, more bedrooms means smaller rooms, and ads ask less for that.</figcaption>
      </figure>

      <div class="two" style="margin-top:18px">
        <figure class="plot">
          <div class="phead"><b>Every ad at once</b></div>
          <div class="shapes" id="shapes"></div>
          <figcaption class="note">The same dot product for every ad is one matrix product: 48,332 rows of 4 numbers times 4 weights gives 48,332 predictions.</figcaption>
        </figure>
        <figure class="plot">
          <div class="phead"><b>How much faster</b></div>
          <div class="race">
            <p class="small" style="margin:0 0 12px">A dot product of 1,000,000 numbers, measured when the model was trained:</p>
            <div class="rrow"><span>Python loop</span><div class="rbar"><i style="width:100%" class="slow"></i></div><b>257.7 ms</b></div>
            <div class="rrow"><span>NumPy np.dot</span><div class="rbar"><i style="width:.6%" class="fast"></i></div><b>0.59 ms</b></div>
            <p class="speed"><b>436×</b> faster, the same result.</p>
          </div>
          <figcaption class="note">With 48,332 ads, 4 features and hundreds of training steps, that is the difference between seconds and minutes.</figcaption>
        </figure>
      </div>
    </section>
    </div>
  </div>`;

export const mathHtml = `<div class="mrow" tabindex="0"><span id="m1"></span><p>Multiply matching elements, then add: one number.</p></div>
        <div class="mrow" tabindex="0"><span id="m2"></span><p>The same for every row of X at once. Shapes: (m, n) times (n) gives (m), one prediction per ad.</p></div>`;

export const skHtml = ``;

/** Runs the step. `ctx.load(name)` gives its data; the returned function stops everything it started. */
export function mount(ctx) {
  const { setTimeout, requestAnimationFrame, cancelAnimationFrame, win, dispose } = ctx.scope();

  let V = null,
    ai = 0,
    mode = 'loop',
    busy = false;
  const NAMES = ['Area', 'Bedrooms', 'Age', 'Parking'],
    UNITS = ['m²', '', 'years', '0 or 1'];
  const fm = (v, d = 2) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
  function cells() {
    const ad = V.ads[ai],
      x = ad.slice(0, 4);
    document.getElementById('adLab').textContent =
      'Ad ' + (ai + 1) + ' of ' + V.ads.length + ' · asked ' + ad[4].toFixed(1) + ' billion';
    document.getElementById('xc').innerHTML = x
      .map(
        (v, j) => `<div class="cell" id="x${j}">${v}<small>${NAMES[j]}${UNITS[j] ? ', ' + UNITS[j] : ''}</small></div>`,
      )
      .join('');
    document.getElementById('wc').innerHTML = V.w
      .map(
        (v, j) =>
          `<div class="cell" id="w${j}">${fm(v, 3)}<small>per ${NAMES[j].toLowerCase() === 'area' ? 'm²' : NAMES[j].toLowerCase() === 'age' ? 'year' : NAMES[j].toLowerCase()}</small></div>`,
      )
      .join('');
    document.getElementById('pc').innerHTML = x
      .map((v, j) => `<div class="cell prod" id="p${j}">${fm(v * V.w[j])}<small>${v} × ${fm(V.w[j], 3)}</small></div>`)
      .join('');
    document.getElementById('sum').textContent = '…';
    document.getElementById('sumNote').textContent = 'press Run';
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function run() {
    if (busy) return;
    busy = true;
    cells();
    const ad = V.ads[ai],
      x = ad.slice(0, 4);
    let total = 0;
    if (mode === 'loop') {
      for (let j = 0; j < 4; j++) {
        ['x', 'w'].forEach((k) => document.getElementById(k + j).classList.add('hot'));
        await wait(450);
        total += x[j] * V.w[j];
        document.getElementById('p' + j).classList.add('on');
        document.getElementById('sum').textContent = fm(total);
        document.getElementById('sumNote').textContent = 'running total after ' + (j + 1) + ' of 4';
        await wait(350);
        ['x', 'w'].forEach((k) => document.getElementById(k + j).classList.remove('hot'));
      }
    } else {
      for (let j = 0; j < 4; j++) {
        ['x', 'w'].forEach((k) => document.getElementById(k + j).classList.add('hot'));
      }
      await wait(400);
      for (let j = 0; j < 4; j++) {
        document.getElementById('p' + j).classList.add('on');
        total += x[j] * V.w[j];
      }
      await wait(250);
      for (let j = 0; j < 4; j++) ['x', 'w'].forEach((k) => document.getElementById(k + j).classList.remove('hot'));
    }
    const pred = total + V.b;
    document.getElementById('sum').textContent = fm(pred);
    document.getElementById('sumNote').textContent =
      'billion (b = ' + fm(V.b, 2) + ' added). The ad asked ' + ad[4].toFixed(1) + '.';
    busy = false;
  }
  function shapes() {
    const m = V.m.toLocaleString('en-US');
    document.getElementById('shapes').innerHTML =
      `<div class="mat" style="width:120px;height:150px">X<br>${m} × 4</div><span class="op">·</span><div class="mat" style="width:34px;height:120px">w<br>4</div><span class="op">+ b =</span><div class="mat" style="width:44px;height:150px">ŷ<br>${m}</div>`;
  }
  document.getElementById('go').onclick = run;
  document.getElementById('nextAd').onclick = () => {
    if (busy) return;
    ai = (ai + 1) % V.ads.length;
    cells();
  };
  document.getElementById('prevAd').onclick = () => {
    if (busy) return;
    ai = (ai - 1 + V.ads.length) % V.ads.length;
    cells();
  };
  document.querySelectorAll('.seg button').forEach(
    (b) =>
      (b.onclick = () => {
        mode = b.dataset.m;
        document.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b));
        cells();
      }),
  );
  const K = (s, id) => katex.render(s, document.getElementById(id), { throwOnError: false, displayMode: true });
  K('\\mathbf{w}\\cdot\\mathbf{x} = w_0x_0 + w_1x_1 + w_2x_2 + w_3x_3 = \\sum_{j=0}^{n-1} w_j x_j', 'm1');
  K('\\hat{\\mathbf{y}} = \\mathbf{X}\\mathbf{w} + b', 'm2');
  const main = document.getElementById('main');
  ctx.load('house-vec.json').then((d) => {
    V = d;
    setTimeout(() => {
      main.classList.remove('skel');
      main.setAttribute('aria-busy', 'false');
      cells();
      shapes();
    }, 400);
  });

  return dispose;
}
