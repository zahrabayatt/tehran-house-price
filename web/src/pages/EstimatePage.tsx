import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/Card';
import { PriceMap, type MapCell, type MapMarker } from '../components/PriceMap';
import { GITHUB_URL } from '../config';
import { predict, validateInput } from '../model/predict';
import {
  gapSentence, hexCenter, hexOpacities, listingPage, loadSiteData, modelCell, monthLabel,
  resolveNeighborhood, signed, slugTitle, type SiteData,
} from '../model/siteData';
import './estimate.css';

const BASE = import.meta.env.BASE_URL;
const DEFAULT_NEIGHBORHOOD = 'saadat-abad';
const DEFAULT_AREA = 85;
const FALLBACK_NOTE = 'Not enough listings here, using the Tehran median';
const BLANK_NOTE = 'No neighborhood chosen, using the Tehran median';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: SiteData };

function useSiteData() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    loadSiteData(BASE).then(
      (data) => live && setState({ status: 'ready', data }),
      (e: unknown) => {
        if (!live) return;
        const text = e instanceof Error ? e.message : String(e);
        const message = text.startsWith('Could not load') ? text : `Could not load the page data. ${text}`;
        setState({ status: 'error', message });
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);
  return { state, retry: () => setAttempt((a) => a + 1) };
}

export function EstimatePage() {
  useEffect(() => {
    document.title = 'Tehran House Price: Estimate';
  }, []);
  const { state, retry } = useSiteData();
  return (
    <main className="page">
      <div>
        <h1>What would this Tehran apartment be advertised for?</h1>
        <p className="lede">
          Describe an apartment and get an estimate from a model trained on real Divar listings, with every step of the
          calculation shown.
        </p>
      </div>
      {state.status === 'loading' ? (
        <p role="status" className="notice">
          Loading the model and the map…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <div role="alert" className="notice notice--error">
          <p>
            <strong>The estimator did not load.</strong> {state.message}
          </p>
          <button type="button" className="btn btn--outline" onClick={retry}>
            Try again
          </button>
        </div>
      ) : null}
      {state.status === 'ready' ? <Estimator data={state.data} /> : null}
    </main>
  );
}

function Estimator({ data }: { data: SiteData }) {
  const { model, neighborhoods, hexes, listings } = data;
  const labelOf = (slug: string) => neighborhoods.find((n) => n.id === slug)?.label;

  const [hoodId, setHoodId] = useState<string | null>(DEFAULT_NEIGHBORHOOD);
  const [hoodText, setHoodText] = useState(labelOf(DEFAULT_NEIGHBORHOOD) ?? '');
  const [pickedHex, setPickedHex] = useState<number | null>(null);
  const [area, setArea] = useState(DEFAULT_AREA);
  const [rooms, setRooms] = useState('2');
  const [year, setYear] = useState('1395');
  const [parking, setParking] = useState(true);
  const [elevator, setElevator] = useState(true);
  const [storage, setStorage] = useState(true);
  const [page, setPage] = useState(0);

  const cells: MapCell[] = useMemo(() => {
    const ops = hexOpacities(hexes);
    return hexes.map((h, i) => ({
      d: h.d,
      slug: h.neighborhood,
      label: neighborhoods.find((n) => n.id === h.neighborhood)?.label ?? slugTitle(h.neighborhood),
      value: h.value,
      opacity: ops[i],
    }));
  }, [hexes, neighborhoods]);

  // Always clean the form values before the model sees them.
  const { input, warnings } = validateInput({
    area, neighborhood: hoodId, rooms, year, parking, elevator, storage,
  });
  const est = predict(model, input);

  const yearWarning = warnings.some((w) => w.code === 'year');
  const lowData = warnings.some((w) => w.code === 'lowData');
  const market = monthLabel(model.date_range.end);
  const perM2 = Math.round((est.total / input.area) * 1000);

  const pickFromMap = (i: number) => {
    const slug = cells[i].slug;
    setHoodId(slug);
    setHoodText(cells[i].label);
    setPickedHex(i);
  };
  const typeNeighborhood = (text: string) => {
    setHoodText(text);
    setHoodId(resolveNeighborhood(text, neighborhoods)?.id ?? null);
    setPickedHex(null);
  };

  // The marker shows only for a neighborhood that has a hexagon, at that hexagon's center.
  let marker: MapMarker | null = null;
  if (hoodId !== null) {
    const at = pickedHex !== null && cells[pickedHex].slug === hoodId
      ? pickedHex
      : cells.findIndex((c) => c.slug === hoodId);
    if (at >= 0) {
      const c = hexCenter(cells[at].d);
      marker = { x: c.x, y: c.y, label: labelOf(hoodId) };
    }
  }

  let hoodNote = '';
  if (est.usedFallback) hoodNote = hoodId === null && hoodText.trim() === '' ? BLANK_NOTE : FALLBACK_NOTE;
  const hoodShown = est.usedFallback ? 'Tehran median' : (labelOf(hoodId ?? '') ?? 'Tehran median');

  const max = Math.max(...est.contributions.map((c) => Math.abs(c.value)), 0.01);
  const gap = gapSentence(model.held_out_gap);
  const totalRows = model.rows.train + model.rows.selection + model.rows.held_out;

  const goToCheck = () => {
    const el = document.getElementById('check');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el?.focus({ preventScroll: true });
  };

  return (
    <>
      <section className="estimate-grid">
        <form className="card form" aria-labelledby="form-title" onSubmit={(e) => e.preventDefault()}>
          <h2 id="form-title">The apartment</h2>
          <div className="field">
            <label htmlFor="hood">Neighborhood</label>
            <input
              id="hood"
              type="text"
              list="hood-options"
              autoComplete="off"
              placeholder="Start typing a neighborhood"
              value={hoodText}
              onChange={(e) => typeNeighborhood(e.target.value)}
              aria-describedby="hood-note"
              className="control"
            />
            <datalist id="hood-options">
              {neighborhoods.map((n) => (
                <option key={n.id} value={n.label} />
              ))}
            </datalist>
            <div id="hood-note" className="help help--warn" role="status">
              {hoodNote}
            </div>
          </div>
          <div className="field field--tight">
            <div className="row-between">
              <label htmlFor="area">Area</label>
              <span className="mono">{input.area} m²</span>
            </div>
            <input
              id="area"
              type="range"
              min={35}
              max={250}
              step={1}
              value={area}
              onChange={(e) => setArea(Number(e.target.value))}
              className="slider"
            />
          </div>
          <div className="two-up">
            <div className="field">
              <label htmlFor="rooms">Bedrooms</label>
              <select id="rooms" value={rooms} onChange={(e) => setRooms(e.target.value)} className="control">
                <option value="0">Studio</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5 or more</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="year">Year built</label>
              <input
                id="year"
                type="number"
                min={1370}
                max={1403}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                aria-describedby="year-help"
                className="control"
              />
            </div>
          </div>
          <div id="year-help" className={yearWarning ? 'help help--warn' : 'help'}>
            {yearWarning
              ? `Enter a Solar Hijri year from 1370 to 1403. Using ${input.year} for now.`
              : 'Solar Hijri year, 1370 to 1403'}
          </div>
          <fieldset className="has">
            <legend>Has</legend>
            <label className="check">
              <input type="checkbox" checked={parking} onChange={() => setParking(!parking)} />
              Parking
            </label>
            <label className="check">
              <input type="checkbox" checked={elevator} onChange={() => setElevator(!elevator)} />
              Elevator
            </label>
            <label className="check">
              <input type="checkbox" checked={storage} onChange={() => setStorage(!storage)} />
              Storage
            </label>
          </fieldset>
        </form>

        <div className="card map-card">
          <PriceMap cells={cells} marker={marker} onPick={pickFromMap} />
          <div className="legend">
            <span className="legend__scale">
              Lower price per m²
              {[0.2, 0.4, 0.6, 0.85].map((o) => (
                <span key={o} className="swatch" style={{ opacity: o }} />
              ))}
              Higher
            </span>
            <span>Click to choose an area, or type it on the left. No individual listing is shown.</span>
          </div>
        </div>

        <section className="result" data-testid="result" aria-live="polite" aria-label="Estimate">
          <div>
            <div className="result__kicker">Estimated asking price</div>
            {est.tooSmall ? (
              <div className="result__small" data-testid="too-small">
                Too small for this model to estimate
              </div>
            ) : (
              <>
                <div className="result__big" data-testid="estimate">
                  ≈ {est.total.toFixed(1)}
                </div>
                <div className="result__unit">billion toman</div>
              </>
            )}
          </div>
          <dl className="result__facts">
            {est.tooSmall ? null : (
              <>
                <dt>Per square meter</dt>
                <dd className="mono">≈ {perM2} million</dd>
              </>
            )}
            <dt>Neighborhood</dt>
            <dd data-testid="result-hood">{hoodShown}</dd>
          </dl>
          <div className="result__foot">
            <h2>Market as of {market}</h2>
            <p>
              Today’s prices may be very different. This is an advertised-price estimate, not a sale price or an
              appraisal.{' '}
              <button type="button" className="linklike" onClick={goToCheck}>
                See how far off it can be
              </button>
              .
            </p>
          </div>
        </section>
      </section>

      {lowData ? (
        <div role="status" className="notice notice--warn">
          Few listings this large were available, so treat this estimate with extra caution.
        </div>
      ) : null}

      <section className="two-cards">
        <Card title="How the model reached this number" className="breakdown">
          <div data-testid="breakdown" className="breakdown__rows">
            <div className="brow" data-row>
              <span>Average apartment</span>
              <div className="bar" />
              <span className="mono brow__v">{est.baseline.toFixed(2)}</span>
            </div>
            {est.contributions.map((c) => (
              <div className="brow" data-row key={c.label}>
                <span>{c.label}</span>
                <div className="bar">
                  <div
                    className="bar__fill"
                    style={{
                      width: `${(Math.abs(c.value) / max) * 100}%`,
                      background: c.value < 0 ? 'var(--mut)' : 'var(--ac)',
                    }}
                  />
                </div>
                <span className="mono brow__v">{signed(c.value)}</span>
              </div>
            ))}
            <div className="brow brow--total">
              <span>{est.tooSmall ? 'Sum of the rows' : 'Total, in billions'}</span>
              <span />
              <span className="mono brow__v">{est.total.toFixed(2)}</span>
            </div>
          </div>
          {est.tooSmall ? (
            <p className="small">
              These rows add up to a value too small to be a price, so no estimate is shown.
            </p>
          ) : null}
          <p className="small">
            These numbers describe patterns in the ads, not causes. For example, an elevator may look negative because of
            the other features it comes with.
          </p>
          <p className="small">
            In a linear model this list is the whole calculation. <Link to="/lab">Learn how in the Model Lab</Link>.
          </p>
        </Card>

        <Card className="check-card">
          <div id="check" tabIndex={-1} className="stack">
          <div className="check-head">
            <div>
              <h2>How far off can it be?</h2>
              <p className="small">Real listings the model never trained on, including its misses.</p>
            </div>
            <button type="button" className="btn btn--outline" onClick={() => setPage(page + 1)}>
              Show other listings
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Neighborhood</th>
                  <th scope="col">Area</th>
                  <th scope="col" className="num">Asked</th>
                  <th scope="col" className="num">Model</th>
                  <th scope="col" className="num">Difference (billion)</th>
                </tr>
              </thead>
              <tbody>
                {listingPage(listings, page).map((l, i) => (
                  <tr key={`${page}-${i}`}>
                    <td>{l.neighborhood}</td>
                    <td>{l.area} m²</td>
                    <td className="num mono">{l.asked.toFixed(2)}</td>
                    <td className="num mono">{modelCell(l.model)}</td>
                    <td className="num mono">{signed(l.difference)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small">{gap}</p>
          </div>
        </Card>
      </section>

      <section aria-label="About this project" className="about">
        <div>
          <div className="about__k">The project</div>
          <div className="about__v">Linear regression, written from scratch</div>
        </div>
        <div>
          <div className="about__k">Data</div>
          <div className="about__v">{totalRows.toLocaleString('en-US')} Tehran apartment listings from Divar</div>
        </div>
        <div>
          <div className="about__k">Not in the model</div>
          <div className="about__v">Condition, view, floor plan</div>
        </div>
        <div className="about__links">
          <Link to="/lab" className="btn btn--solid">
            See how it works
          </Link>
          {GITHUB_URL ? (
            <a href={GITHUB_URL} className="about__github">
              GitHub
            </a>
          ) : null}
        </div>
        <p className="about__wide">{gap}</p>
        <p className="about__wide">
          A simple rule, area times the neighborhood median, did slightly better on a typical listing. The model was
          chosen for its lower overall cost.
        </p>
      </section>
    </>
  );
}
