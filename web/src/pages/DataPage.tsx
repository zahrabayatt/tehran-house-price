import { useEffect } from 'react';
import funnel from '../../public/data/funnel.json';
import profile from '../../public/data/profile.json';
import { monthLabel } from '../model/siteData';
import './data.css';

const SOURCE_URL = 'https://huggingface.co/datasets/divarofficial/real_estate_ads';

const count = (n: number) => n.toLocaleString('en-US');

/** Share of rows with a missing value: "0%", or a percentage with enough digits to be non-zero. */
export function missingShare(share: number): string {
  if (share === 0) return '0%';
  const pct = share * 100;
  if (pct >= 1) return `${pct.toFixed(1)}%`;
  if (pct >= 0.1) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(3)}%`;
}

const nullShare = (column: string) => profile.null_shares.find((n) => n.column === column)?.share ?? 0;

export function DataPage() {
  useEffect(() => {
    document.title = 'Tehran House Price: Data';
  }, []);

  const total = funnel[0].rows;
  const { stored_raw: stored, clean, train, selection, held_out: heldOut } = profile.row_counts;
  const removed = stored - clean;
  const months = profile.months;
  const perM2 = months.map((m) => m.median_price_per_m2);
  const monthRows = months.map((m) => m.rows);
  const nb = profile.neighborhoods;
  const noCoordinates = nullShare('location_latitude');

  return (
    <main className="page data-page">
      <div>
        <h1>Where the numbers come from</h1>
        <p className="lede">
          One million real estate ads released by Divar, narrowed down to apartments for sale in Tehran. These are
          advertised prices, not completed sales.
        </p>
      </div>

      <dl className="data-facts">
        <div>
          <dt>Source</dt>
          <dd>
            <a href={SOURCE_URL}>divarofficial/real_estate_ads</a>
          </dd>
        </div>
        <div>
          <dt>License</dt>
          <dd>ODbL</dd>
        </div>
        <div>
          <dt>Period used</dt>
          <dd>May to December 2024</dd>
        </div>
        <div>
          <dt>Data type</dt>
          <dd>Advertised, not transacted</dd>
        </div>
      </dl>

      <section className="data-section" aria-labelledby="funnel-h">
        <h2 id="funnel-h">From one million ads to the training set</h2>
        <ol className="funnel" aria-label="Cleaning funnel">
          {funnel.map((f) => (
            <li key={f.label} className="funnel__row">
              <span className="funnel__label">
                {f.label}
                {f.removed > 0 ? <span className="funnel__removed"> (removed {count(f.removed)})</span> : null}
              </span>
              <span className="funnel__track" aria-hidden="true">
                <span className="funnel__bar" style={{ width: `${Math.max((f.rows / total) * 100, 0.5)}%` }} />
              </span>
              <span className="funnel__count mono">{count(f.rows)}</span>
            </li>
          ))}
        </ol>
        <p className="small">
          {count(clean)} apartment ads remain: {count(train)} to train the model, {count(selection)} to choose its
          settings, and {count(heldOut)} kept back for the final check. The bounds in the last two steps were picked
          from the shape of the data, not to make the model look better.
        </p>
      </section>

      <section className="data-section" aria-labelledby="fields-h">
        <h2 id="fields-h">Fields used</h2>
        <div className="data-scroll" role="region" aria-label="Fields table" tabIndex={0}>
          <table className="data-table" aria-label="Fields used">
            <thead>
              <tr>
                <th scope="col">Source field</th>
                <th scope="col">Used as</th>
                <th scope="col">Processing</th>
                <th scope="col" className="num">
                  Missing
                </th>
              </tr>
            </thead>
            <tbody>
              {profile.fields.map((f) => (
                <tr key={f.src}>
                  <td className="mono">{f.src}</td>
                  <td>{f.use}</td>
                  <td className="muted">{f.proc}</td>
                  <td className="num mono">{missingShare(f.null_share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small">
          Missing is the share of the {count(stored)} stored ads that lack the value, so 0.001% is a single ad. Ad
          titles, descriptions and user fields are never loaded. Coordinates were used only to build the map&apos;s
          hexagon medians and are not on the site.
        </p>
      </section>

      <section className="data-section" aria-labelledby="months-h">
        <h2 id="months-h">Month by month</h2>
        <table className="data-table data-table--months" aria-label="Ads by month">
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col" className="num">
                Ads
              </th>
              <th scope="col" className="num">
                Median price (billion toman)
              </th>
              <th scope="col" className="num">
                Median per m² (million toman)
              </th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <th scope="row">{monthLabel(m.month)}</th>
                <td className="num mono">{count(m.rows)}</td>
                <td className="num mono">{m.median_price.toFixed(2)}</td>
                <td className="num mono">{m.median_price_per_m2.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="data-notes" aria-label="Time, quality and coverage">
        <div>
          <h3>Time</h3>
          <p>
            Training covers ads created from May to December 2024. Each month holds {count(Math.min(...monthRows))} to{' '}
            {count(Math.max(...monthRows))} ads, and the median price per m² stays between {Math.min(...perM2).toFixed(1)}{' '}
            and {Math.max(...perM2).toFixed(1)} million toman. Months after December 2024 are not represented.
          </p>
        </div>
        <div>
          <h3>Quality</h3>
          <p>
            Ads can contain typos, duplicates and placeholder prices. Cleaning removed {count(removed)} of{' '}
            {count(stored)} stored ads ({((removed / stored) * 100).toFixed(1)}%) and reports every step above.
          </p>
        </div>
        <div>
          <h3>Coverage</h3>
          <p>
            Of {count(nb.total)} neighborhoods, {count(nb.with_own_median)} have 30 or more training ads and their own
            median. The others use the Tehran median of {nb.fallback_median.toFixed(2)} million toman per m², so
            estimates there are less specific. {(noCoordinates * 100).toFixed(1)}% of ads have no coordinates; they
            still count toward the estimate but not the map.
          </p>
        </div>
      </section>

      <section className="data-section" aria-labelledby="limits-h">
        <h2 id="limits-h">Limitations</h2>
        <ul className="data-limits">
          <li>
            Asking prices are not sale prices. An ad can be negotiable, out of date, or repeated under another ad type.
          </li>
          <li>
            Eight months of data cannot show seasons or a long-run trend. The market this site shows is as of December
            2024.
          </li>
          <li>
            The price unit is not stated in the data. Toman is inferred from the size of the numbers, and the data card
            in the repository explains how.
          </li>
          <li>Building age stops at 34 years, because the oldest group in the ads is simply &quot;before 1370&quot;.</li>
          <li>A neighborhood label is the website&apos;s, and one label can cover areas with different price levels.</li>
        </ul>
        <p className="small">
          Processed data carries the same ODbL license and attribution as the source. City outline: OpenStreetMap, ODbL.
        </p>
      </section>
    </main>
  );
}
