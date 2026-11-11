// Model Lab, step 2. Ported from the approved design draft docs/design/HouseLabStep2.html:
// the markup, then mount(), which runs the step's interactive code once its markup is on the page.
import katex from 'katex';

export const html = `<div id="main" class="skel" aria-busy="true">
    <div class="skonly" aria-hidden="true">
      <section class="card"><div class="sk" style="width:90px;height:14px;margin-bottom:12px"></div><div class="sk" style="width:36%;height:30px;margin-bottom:12px"></div><div class="sk" style="width:70%;height:16px;margin-bottom:22px"></div>
        <div class="split"><div class="sk" style="height:470px;border-radius:14px"></div><div class="sk" style="height:470px;border-radius:14px"></div></div></section>
    </div>
    <div class="live">
    <section class="card" aria-labelledby="st">
      <span class="tag">Step 2 of 15</span>
      <h2 id="st">Cleaning</h2>
      <p class="goal">Some ads have impossible numbers. Drag the four limits to decide which ads the model may learn from.</p>
      <div class="split">
        <figure class="plot">
          <div class="phead"><b>Every stored ad: area and price per m²</b></div>
          <div class="pbox"><canvas id="dots" aria-hidden="true"></canvas><svg id="plot" viewBox="0 0 620 400" width="100%" role="group" aria-label="Area against price per square meter for all stored ads, with draggable cleaning limits"></svg></div>
          <figcaption class="note">Both axes grow ten times per grid line, so typos thousands of times too big or too small still fit. Green ads are kept, orange ads are removed. Ads beyond the edges are drawn on the edge.</figcaption>
        </figure>
        <div class="side" aria-live="polite">
          <h3>With these limits</h3>
          <div class="counts">
            <span>Kept</span><b class="k" id="cKept"></b>
            <span>Removed</span><b class="r" id="cRem"></b>
            <span class="sub">area out of range</span><b class="sub" id="cArea"></b>
            <span class="sub">price per m² out of range</span><b class="sub" id="cPpm"></b>
            <span style="color:var(--mut)">All stored ads</span><b id="cAll"></b>
          </div>
          <h3>Real ads that are removed</h3>
          <div class="ex">
            <div><b>285 m² for 89,000 billion</b><br>312,000 million per m²: extra zeros</div>
            <div><b>1,616 m² for 1,616 toman</b><br>the area typed into the price</div>
            <div><b>1 m² for 5 million toman</b><br>a placeholder, not a flat</div>
            <div><b>9,999,999 m² for 300 billion</b><br>a filler number for area</div>
          </div>
        </div>
      </div>
      <div class="chips" role="group" aria-label="Presets"><span class="try">Try:</span><button class="chip on" data-p="live" type="button">The live model's limits</button><button class="chip" data-p="all" type="button">Keep everything</button><button class="chip" data-p="strict" type="button">Too strict</button></div>
      <p class="pnote" id="pnote"></p>
    </section>
    </div>
  </div>`;

export const mathHtml = `<p id="m1" style="font-size:19px;margin:6px 0 10px"></p>
        <p style="color:var(--mut);margin:0">Price per m² catches mistakes that the price alone would hide: a 1 m² "flat" for 5 million toman has an ordinary price but an impossible price per m². The limits were chosen from the shape of the data, before training, never to make the model look better.</p>`;

export const skHtml = ``;

/** Runs the step. `ctx.load(name)` gives its data; the returned function stops everything it started. */
export function mount(ctx) {
  const { setTimeout, requestAnimationFrame, cancelAnimationFrame, win, dispose } = ctx.scope();

  const svg = document.getElementById('plot'),
    cv = document.getElementById('dots'),
    ns = 'http://www.w3.org/2000/svg';
  const L = 64,
    R = 600,
    T = 14,
    B = 344,
    AX = [5, 5000],
    PY = [0.01, 30000];
  const lg = Math.log10,
    fx = (a) => L + ((lg(Math.min(Math.max(a, AX[0]), AX[1])) - lg(AX[0])) / (lg(AX[1]) - lg(AX[0]))) * (R - L),
    fy = (v) => B - ((lg(Math.min(Math.max(v, PY[0]), PY[1])) - lg(PY[0])) / (lg(PY[1]) - lg(PY[0]))) * (B - T);
  const ix = (x) => Math.pow(10, lg(AX[0]) + ((x - L) / (R - L)) * (lg(AX[1]) - lg(AX[0]))),
    iy = (y) => Math.pow(10, lg(PY[0]) + ((B - y) / (B - T)) * (lg(PY[1]) - lg(PY[0])));
  const PRESETS = {
    live: {
      aL: 25,
      aH: 600,
      pL: 12,
      pH: 600,
      note: 'The limits the live model uses: 81,603 ads kept, 1,751 removed (2.1%).',
    },
    all: {
      aL: 0,
      aH: Infinity,
      pL: 0,
      pH: Infinity,
      note: "Keep everything: typos with prices thousands of times too high stay in, and they would pull the model's line far off.",
    },
    strict: {
      aL: 60,
      aH: 200,
      pL: 50,
      pH: 250,
      note: 'Too strict: small flats, large flats and cheap or luxury areas are thrown away, so the model would never learn them.',
    },
  };
  let P = [],
    b = { ...PRESETS.live },
    raf = 0;
  function el(t, a, txt, par) {
    const e = document.createElementNS(ns, t);
    for (const k in a) e.setAttribute(k, a[k]);
    if (txt !== undefined) e.textContent = txt;
    (par || svg).appendChild(e);
    return e;
  }
  const lab = (k, v, u) =>
    ((k === 'aL' || k === 'pL') && v <= (k === 'aL' ? AX[0] : PY[0])) ||
    ((k === 'aH' || k === 'pH') && v >= (k === 'aH' ? AX[1] : PY[1]))
      ? 'no limit'
      : fmt(v) + u;
  const fmt = (v) =>
    v >= 1000
      ? Math.round(v).toLocaleString('en-US')
      : v >= 10
        ? Math.round(v) + ''
        : v >= 1
          ? v.toFixed(1)
          : v.toPrecision(2);
  function paint() {
    const r = svg.getBoundingClientRect(),
      dpr = window.devicePixelRatio || 1,
      s = r.width / 620;
    cv.style.width = r.width + 'px';
    cv.style.height = r.height + 'px';
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    const c = cv.getContext('2d');
    c.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
    c.clearRect(0, 0, 620, 400);
    const cs = getComputedStyle(document.getElementById('main')),
      ok = cs.getPropertyValue('--ac').trim(),
      no = cs.getPropertyValue('--warn').trim();
    let kept = 0,
      ra = 0,
      rp = 0;
    for (const [a, p] of P) {
      const inA = a >= b.aL && a <= b.aH,
        inP = p >= b.pL && p <= b.pH;
      const k = inA && inP;
      if (k) kept++;
      else if (!inA) ra++;
      else rp++;
      c.fillStyle = k ? ok : no;
      c.globalAlpha = k ? 0.06 : 0.55;
      c.beginPath();
      c.arc(fx(a), fy(p), k ? 1.8 : 2.4, 0, 6.283);
      c.fill();
    }
    document.getElementById('cKept').textContent = kept.toLocaleString('en-US');
    document.getElementById('cRem').textContent = (P.length - kept).toLocaleString('en-US');
    document.getElementById('cArea').textContent = ra.toLocaleString('en-US');
    document.getElementById('cPpm').textContent = rp.toLocaleString('en-US');
    document.getElementById('cAll').textContent = P.length.toLocaleString('en-US');
  }
  function draw() {
    svg.innerHTML = '';
    [10, 30, 100, 300, 1000, 3000].forEach((v) => {
      el('line', { x1: fx(v), x2: fx(v), y1: T, y2: B, stroke: 'var(--rule)' });
      el(
        'text',
        { x: fx(v), y: B + 18, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--mut)' },
        v.toLocaleString('en-US'),
      );
    });
    [0.1, 1, 10, 100, 1000, 10000].forEach((v) => {
      el('line', { x1: L, x2: R, y1: fy(v), y2: fy(v), stroke: 'var(--rule)' });
      el(
        'text',
        { x: L - 8, y: fy(v) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--mut)' },
        v < 1 ? v : v.toLocaleString('en-US'),
      );
    });
    el(
      'text',
      { x: (L + R) / 2, y: B + 42, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--mut)' },
      'Area (m²)',
    );
    el(
      'text',
      {
        x: 16,
        y: (T + B) / 2,
        'text-anchor': 'middle',
        'font-size': 13,
        fill: 'var(--mut)',
        transform: 'rotate(-90 16 ' + (T + B) / 2 + ')',
      },
      'Price per m² (million toman)',
    );
    el('rect', {
      x: fx(b.aL),
      y: fy(b.pH),
      width: fx(b.aH) - fx(b.aL),
      height: fy(b.pL) - fy(b.pH),
      fill: 'var(--ac)',
      opacity: 0.07,
      stroke: 'var(--ac)',
      'stroke-width': 1.5,
    });
    const H = [
      ['aL', 'v'],
      ['aH', 'v'],
      ['pL', 'h'],
      ['pH', 'h'],
    ];
    H.forEach(([k, dir]) => {
      const g = el('g', {
        class: 'handle',
        tabindex: 0,
        role: 'slider',
        'aria-label': {
          aL: 'Smallest area',
          aH: 'Largest area',
          pL: 'Lowest price per m²',
          pH: 'Highest price per m²',
        }[k],
        'aria-valuenow': b[k],
      });
      const isV = dir === 'v',
        pos = isV ? fx(b[k]) : fy(b[k]);
      if (isV) {
        el(
          'line',
          { x1: pos, x2: pos, y1: T, y2: B, stroke: 'var(--ac)', 'stroke-width': 2, 'stroke-dasharray': '5 4' },
          undefined,
          g,
        );
        el('rect', { x: pos - 9, y: T, width: 18, height: B - T, fill: 'transparent' }, undefined, g);
        el('circle', { cx: pos, cy: B - 14, r: 7, fill: 'var(--ac)' }, undefined, g);
        el(
          'text',
          {
            x: pos + (k === 'aL' ? -10 : 10),
            y: T + 14,
            'text-anchor': k === 'aL' ? 'end' : 'start',
            'font-size': 12,
            'font-weight': 600,
            fill: 'var(--ac)',
          },
          lab(k, b[k], ' m²'),
          g,
        );
      } else {
        el(
          'line',
          { x1: L, x2: R, y1: pos, y2: pos, stroke: 'var(--ac)', 'stroke-width': 2, 'stroke-dasharray': '5 4' },
          undefined,
          g,
        );
        el('rect', { x: L, y: pos - 9, width: R - L, height: 18, fill: 'transparent' }, undefined, g);
        el('circle', { cx: L + 14, cy: pos, r: 7, fill: 'var(--ac)' }, undefined, g);
        el(
          'text',
          {
            x: R - 4,
            y: pos + (k === 'pL' ? 16 : -8),
            'text-anchor': 'end',
            'font-size': 12,
            'font-weight': 600,
            fill: 'var(--ac)',
          },
          lab(k, b[k], ' million per m²'),
          g,
        );
      }
      g.style.cursor = isV ? 'ew-resize' : 'ns-resize';
      g.addEventListener('pointerdown', (e) => {
        // Each move redraws the chart, which replaces this handle, so the drag is followed on
        // the window rather than on the handle itself.
        e.preventDefault();
        const mv = (ev) => {
          const pt = svg.createSVGPoint();
          pt.x = ev.clientX;
          pt.y = ev.clientY;
          const q = pt.matrixTransform(svg.getScreenCTM().inverse());
          const cx = Math.max(L, Math.min(R, isV ? q.x : q.y)),
            atEdge = isV ? cx <= L + 2 || cx >= R - 2 : q.y <= T + 2 || q.y >= B - 2;
          let v = isV ? ix(Math.max(L, Math.min(R, q.x))) : iy(Math.max(T, Math.min(B, q.y)));
          v = +v.toPrecision(2);
          if (atEdge) {
            if (k === 'aL' || k === 'pL') v = 0;
            else v = Infinity;
          }
          if (k === 'aL') v = Math.min(v, b.aH);
          if (k === 'aH') v = Math.max(v, b.aL);
          if (k === 'pL') v = Math.min(v, b.pH);
          if (k === 'pH') v = Math.max(v, b.pL);
          b[k] = v;
          setPreset(null);
          schedule();
        };
        const up = () => {
          window.removeEventListener('pointermove', mv);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
        };
        window.addEventListener('pointermove', mv);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      });
      g.addEventListener('keydown', (e) => {
        const up = ['ArrowUp', 'ArrowRight'].includes(e.key),
          dn = ['ArrowDown', 'ArrowLeft'].includes(e.key);
        if (!up && !dn) return;
        e.preventDefault();
        b[k] = +(b[k] * (up ? 1.1 : 1 / 1.1)).toPrecision(2);
        setPreset(null);
        draw();
        paint();
        svg.querySelector('[aria-label="' + g.getAttribute('aria-label') + '"]').focus();
      });
    });
  }
  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      draw();
      paint();
    });
  }
  function setPreset(k) {
    document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.p === k));
    document.getElementById('pnote').textContent = k ? PRESETS[k].note : '';
  }
  document.querySelectorAll('.chip').forEach(
    (c) =>
      (c.onclick = () => {
        b = { ...PRESETS[c.dataset.p] };
        setPreset(c.dataset.p);
        draw();
        paint();
      }),
  );
  katex.render(
    '\\text{keep ad } i \\text{ if } \\; a_{\\text{low}} \\le \\text{area}^{(i)} \\le a_{\\text{high}} \\;\\text{ and }\\; \\text{low} \\le \\frac{y^{(i)}}{\\text{area}^{(i)}} \\le \\text{high}',
    document.getElementById('m1'),
    { throwOnError: false },
  );
  const main = document.getElementById('main');
  ctx.load('house-clean-points.json').then((d) => {
    P = d;
    setTimeout(() => {
      main.classList.remove('skel');
      main.setAttribute('aria-busy', 'false');
      setPreset('live');
      draw();
      paint();
    }, 400);
  });
  win.addEventListener('resize', () => {
    if (P.length) {
      draw();
      paint();
    }
  });

  return dispose;
}
