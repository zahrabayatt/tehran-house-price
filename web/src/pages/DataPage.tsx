import { useEffect, useState } from 'react';
import funnel from '../../public/data/funnel.json';
import listings from '../../public/data/listings.json';
import profile from '../../public/data/profile.json';
import summary from '../../public/data/data-summary.json';
import { GITHUB_URL } from '../config';
import { modelCell } from '../model/siteData';
import './data.css';

const SOURCE_URL = 'https://huggingface.co/datasets/divarofficial/real_estate_ads';
const TINDEX_URL = 'https://tindex.app/en/indicators/housing/average-housing-price-in-tehranm/';
const CARD_URL = GITHUB_URL ? `${GITHUB_URL}/blob/main/docs/DATA_CARD.md` : '';
const PAGE = 5;

const count = (n: number) => n.toLocaleString('en-US');
const pct = (share: number) => `${(share * 100).toFixed(1)}%`;
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A funnel step's row count, found by the start of its label. */
function rowsAt(start: string): number {
  const step = funnel.find((f) => f.label.startsWith(start));
  if (!step) throw new Error(`funnel.json has no step starting "${start}"`);
  return step.rows;
}

/** The cleaning funnel in five plain steps (every step is in the data card). */
export function funnelSteps() {
  return [
    { label: 'All ads in the dataset', rows: funnel[0].rows },
    { label: 'In Tehran', rows: rowsAt('Tehran') },
    { label: 'Apartments for sale, fixed price', rows: rowsAt('Fixed-price') },
    { label: 'Posted May to December 2024, no duplicates', rows: rowsAt('Exact duplicate') },
    { label: 'Without impossible sizes or prices', rows: funnel[funnel.length - 1].rows },
  ];
}

const removedBy = (start: string) => funnel.find((f) => f.label.startsWith(start))?.removed ?? 0;

function Trend() {
  const months = profile.months;
  const values = months.map((m) => m.median_price_per_m2);
  const lo = Math.floor(Math.min(...values) / 5) * 5;
  const hi = Math.ceil(Math.max(...values) / 5) * 5;
  const x = (i: number) => 50 + i * (600 / Math.max(1, months.length - 1));
  const y = (v: number) => 145 - ((v - lo) / (hi - lo)) * 110;
  const ticks = [];
  for (let v = lo; v <= hi; v += 5) ticks.push(v);
  const first = months[0];
  const last = months[months.length - 1];
  return (
    <svg viewBox="0 0 680 170" width="100%" role="img"
      aria-label={`Middle asking price per square meter by month in 2024, from ${first.median_price_per_m2.toFixed(1)} million in ${first.month} to ${last.median_price_per_m2.toFixed(1)} million in ${last.month}.`}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={40} x2={660} y1={y(v)} y2={y(v)} stroke="var(--rule)" />
          <text x={34} y={y(v) + 4} textAnchor="end" fontSize={12} fill="var(--mut)">{v}</text>
        </g>
      ))}
      <polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke="var(--ac)" strokeWidth={3} strokeLinejoin="round" />
      {months.map((m, i) => (
        <g key={m.month}>
          <circle cx={x(i)} cy={y(m.median_price_per_m2)} r={4.5} fill="var(--ac)" />
          <text x={x(i)} y={166} textAnchor="middle" fontSize={12} fill="var(--mut)">{MONTH_SHORT[Number(m.month.slice(5)) - 1]}</text>
          <text x={x(i)} y={y(m.median_price_per_m2) - 12} textAnchor="middle" fontSize={12} fill="var(--ink)" className="mono">
            {m.median_price_per_m2.toFixed(1)}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function DataPage() {
  useEffect(() => {
    document.title = 'Tehran House Price: Data';
  }, []);
  const [start, setStart] = useState(0);
  const steps = funnelSteps();
  const total = steps[0].rows;
  const clean = steps[steps.length - 1].rows;
  const { gap, simpleRule } = summary;
  const shown = Array.from({ length: Math.min(PAGE, listings.length) }, (_, i) => listings[(start + i) % listings.length]);
  const values = profile.months.map((m) => m.median_price_per_m2);

  return (
    <main className="page data-page">
      <div>
        <h1>The data behind the estimate</h1>
        <p className="lede">Real Divar apartment ads from 2024.</p>
      </div>

      <div className="dfacts">
        <div className="dfact"><b>{count(clean)}</b><span>apartment ads used</span></div>
        <div className="dfact"><b>May to Dec 2024</b><span>when the ads were posted</span></div>
        <div className="dfact"><b>{summary.neighborhoodsWithPrice}</b><span>neighborhoods with enough ads</span></div>
        <div className="dfact"><b>Asking prices</b><span>not sale prices</span></div>
      </div>

      <section className="dcard" aria-labelledby="h-f">
        <h2 id="h-f">From one million ads to {count(clean)}</h2>
        <p className="dsub">Divar published one million real-estate ads from across Iran. Only Tehran apartments for sale were kept.</p>
        <ol className="dfunnel" aria-label="Cleaning funnel">
          {steps.map((s) => (
            <li key={s.label} className="dstep">
              <span>{s.label}</span>
              <span className="dbar" aria-hidden="true"><i style={{ width: `${(s.rows / total) * 100}%` }} /></span>
              <span className="n">{count(s.rows)}</span>
            </li>
          ))}
        </ol>
        <details>
          <summary>Why ads were removed</summary>
          <p className="dsmall">
            {count(removedBy('Created'))} ads were outside May to December 2024, {count(removedBy('Exact duplicate'))} were exact
            duplicates, {count(removedBy('Area outside'))} had an area outside 25 to 600 m², and {count(removedBy('Price per m2'))} had
            a price per m² outside 12 to 600 million toman (typos such as a price of 1 toman). These limits were chosen from the
            shape of the data, before looking at the model's results. Every step is listed in the data card on GitHub.
          </p>
        </details>
      </section>

      <section className="dcard" aria-labelledby="h-a">
        <h2 id="h-a">How close is the model?</h2>
        <p className="dsub">Tested on {count(summary.heldOut)} ads from November and December 2024 that the model never saw while learning.</p>
        <div className="dacc">
          <div>
            <p className="dbig" data-testid="typical-miss">{pct(gap.median_share_of_price)}<small>typical miss</small></p>
            <p className="dsmall">About {gap.median_billions.toFixed(1)} billion toman. Half the estimates are closer than this, half are further off.</p>
            <p className="dsmall">For 9 in 10 ads the miss is under {gap.p90_billions.toFixed(1)} billion. The biggest misses are on unusual or very expensive apartments.</p>
          </div>
          <div>
            <table aria-label="Real test ads">
              <thead><tr><th>Real ad</th><th className="r">Asked</th><th className="r">Model</th><th className="r">Off by</th></tr></thead>
              <tbody>
                {shown.map((l, i) => {
                  const off = Math.round((Math.abs(l.model - l.asked) / l.asked) * 100);
                  return (
                    <tr key={`${start}-${i}`}>
                      <td>{l.neighborhood}, {l.area} m²</td>
                      <td className="r">{l.asked.toFixed(2)}</td>
                      <td className="r">{modelCell(l.model)}</td>
                      <td className="r"><span className={off > 30 ? 'off far' : 'off ok'}>{off}%</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button type="button" className="dbtn" onClick={() => setStart((s) => (s + PAGE) % listings.length)}>Show other ads</button>
            <p className="dsmall">Billion toman. A fixed random sample of the test ads, misses included.</p>
          </div>
        </div>
        <details>
          <summary>Compared with a simple rule</summary>
          <p className="dsmall">
            "Area times the neighborhood's median price per m²" misses a typical ad by {pct(simpleRule.median_share_of_price)}
            {simpleRule.median_share_of_price < gap.median_share_of_price ? ', slightly less than the model' : ', more than the model'}.
            The model was chosen before this comparison, and it does better on the most expensive apartments. This is reported as it came out.
          </p>
        </details>
      </section>

      <section className="dcard" aria-labelledby="h-t">
        <h2 id="h-t">Prices during 2024</h2>
        <p className="dsub">Middle asking price per m² across Tehran, by month.</p>
        <Trend />
        <p className="dsmall">
          Prices stayed between {Math.round(Math.min(...values))} and {Math.round(Math.max(...values))} million toman per m² in 2024.
          Tehran asking prices are about 3 times higher today (about 303 million per m² in October 2026,{' '}
          <a href={TINDEX_URL}>Tindex</a>); this site does not adjust for that.
        </p>
      </section>

      <div className="dtwo">
        <section className="dcard" aria-labelledby="h-k">
          <h2 id="h-k">What the model knows</h2>
          <p className="dsub">Uses</p>
          <div className="dchips">
            {['Area', 'Neighborhood', 'Bedrooms', 'Building age', 'Parking', 'Elevator', 'Storage'].map((c) => <span key={c} className="dchip yes">{c}</span>)}
          </div>
          <p className="dsub" style={{ marginTop: 16 }}>Cannot see</p>
          <div className="dchips">
            {['Floor', 'View', 'Condition and renovation', 'Exact street', 'Photos and description'].map((c) => <span key={c} className="dchip">{c}</span>)}
          </div>
        </section>
        <section className="dcard" aria-labelledby="h-l">
          <h2 id="h-l">Keep in mind</h2>
          <ul className="dlim">
            <li>These are asking prices. Final sale prices are often lower.</li>
            <li>All prices are from 2024 and are not adjusted to today.</li>
            <li>The data does not state the currency; toman is inferred from the size of the numbers.</li>
            <li>Neighborhoods with fewer than 15 ads cannot be chosen.</li>
          </ul>
        </section>
      </div>

      <p className="dsmall dfoot">
        Source: <a href={SOURCE_URL}>divarofficial/real_estate_ads</a> on Hugging Face, ODbL. Neighborhood boundaries: © OpenStreetMap
        contributors, ODbL.
        {CARD_URL ? <> Every technical detail is in the <a href={CARD_URL}>data card</a>.</> : null}
      </p>
    </main>
  );
}
