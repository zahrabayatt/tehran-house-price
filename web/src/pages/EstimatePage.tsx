import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PALETTE } from '../components/mapColours';
import { predict, validateInput } from '../model/predict';
import {
  choosable, loadEstimateData, monthLabel, priceBands, resolveHood, similarRange, type EstimateData,
} from '../model/siteData';
import { usePageTheme } from '../useTheme';
import './estimate.css';

const BASE = import.meta.env.BASE_URL;
// The map library is large, so it loads after the form and the estimate are on screen.
const NeighborhoodMap = lazy(() => import('../components/NeighborhoodMap'));
const DEFAULT_HOOD = 'Saadat Abad';
const DEFAULT_AREA = 85;
/** Tehran asking prices today against December 2024, rounded (docs/improvements, item 1). */
export const TODAY_FACTOR_TEXT = 'Tehran asking prices are about 3 times higher today. This estimate is not adjusted.';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: EstimateData };

function useEstimateData() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    loadEstimateData(BASE).then(
      (data) => live && setState({ status: 'ready', data }),
      (e: unknown) => {
        if (!live) return;
        const text = e instanceof Error ? e.message : String(e);
        setState({ status: 'error', message: text.startsWith('Could not load') ? text : `Could not load the page data. ${text}` });
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
  const { state, retry } = useEstimateData();
  return (
    <main className="page est-page">
      <h1>What was this apartment advertised for in late 2024?</h1>
      {state.status === 'loading' ? (
        <p role="status" className="notice">Loading the model and the map…</p>
      ) : null}
      {state.status === 'error' ? (
        <div role="alert" className="notice notice--error">
          <p>
            <strong>The estimator did not load.</strong> {state.message}
          </p>
          <button type="button" className="btn btn--outline" onClick={retry}>Try again</button>
        </div>
      ) : null}
      {state.status === 'ready' ? <Estimator data={state.data} /> : null}
    </main>
  );
}

function Estimator({ data }: { data: EstimateData }) {
  const { model, hoods, similar } = data;
  const theme = usePageTheme();
  const list = useMemo(() => choosable(hoods), [hoods]);
  const bands = useMemo(() => priceBands(list), [list]);
  const start = resolveHood(DEFAULT_HOOD, list);

  const [hoodId, setHoodId] = useState<number | null>(start?.id ?? null);
  const [hoodText, setHoodText] = useState(start?.properties.name ?? '');
  const [area, setArea] = useState(DEFAULT_AREA);
  const [rooms, setRooms] = useState('2');
  const [year, setYear] = useState('1395');
  const [parking, setParking] = useState(true);
  const [elevator, setElevator] = useState(true);
  const [storage, setStorage] = useState(true);

  const hood = list.find((f) => f.id === hoodId) ?? null;
  // The model knows Divar's neighborhood names; the official neighborhood brings the one most of its ads use.
  const { input, warnings } = validateInput({
    area, neighborhood: hood?.properties.divar ?? null, rooms, year, parking, elevator, storage,
  });
  const est = predict(model, input);
  const range = similarRange(similar, hood, input.area);
  const yearWarning = warnings.some((w) => w.code === 'year');
  const lowData = warnings.some((w) => w.code === 'lowData');
  const month = monthLabel(model.date_range.end);

  let hoodNote = 'Type to search, or click the map below.';
  // Kept to one line each, so the form never changes height.
  if (hood === null) hoodNote = hoodText.trim() === '' ? 'None chosen: using the Tehran median.' : 'No match. Pick from the list or the map.';
  else if (est.usedFallback) hoodNote = 'Few ads here: using the Tehran median.';

  const pick = (id: number) => {
    const f = list.find((x) => x.id === id);
    if (!f) return;
    setHoodId(id);
    setHoodText(f.properties.name);
  };
  const type = (text: string) => {
    setHoodText(text);
    setHoodId(resolveHood(text, list)?.id ?? null);
  };

  const colours = theme === 'dark' ? PALETTE.dark : PALETTE.light;
  const legend = [`under ${bands[0]}`, `${bands[0]} to ${bands[1]}`, `${bands[1]} to ${bands[2]}`, `${bands[2]} to ${bands[3]}`, `over ${bands[3]}`];

  return (
    <>
      <div className="est-grid">
        <form className="est-card est-form" aria-label="The apartment" onSubmit={(e) => e.preventDefault()}>
          <div className="est-field">
            <label htmlFor="hood">Neighborhood</label>
            <input id="hood" type="text" list="hood-options" autoComplete="off" placeholder="Start typing a neighborhood"
              value={hoodText} title={hoodText} onChange={(e) => type(e.target.value)} aria-describedby="hood-note"
              className="est-input" />
            <datalist id="hood-options">
              {list.map((f) => <option key={f.id} value={f.properties.name} />)}
            </datalist>
            <p id="hood-note" className={hood === null || est.usedFallback ? 'est-hint est-hint--warn' : 'est-hint'} role="status">
              {hoodNote}
            </p>
          </div>
          <div className="est-field">
            <div className="est-row">
              <label htmlFor="area">Area</label>
              <span className="mono">{input.area} m²</span>
            </div>
            <input id="area" type="range" min={25} max={250} step={1} value={area} onChange={(e) => setArea(Number(e.target.value))} />
          </div>
          <div className="est-two">
            <div className="est-field">
              <label htmlFor="rooms">Bedrooms</label>
              <select id="rooms" value={rooms} onChange={(e) => setRooms(e.target.value)} className="est-input">
                <option value="0">Studio</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5 or more</option>
              </select>
            </div>
            <div className="est-field">
              <label htmlFor="year">Year built</label>
              <input id="year" type="number" min={1370} max={1403} value={year} onChange={(e) => setYear(e.target.value)}
                aria-describedby="year-help" className="est-input mono" />
            </div>
          </div>
          <p id="year-help" className={yearWarning ? 'est-hint est-hint--warn' : 'est-hint'}>
            {yearWarning ? `Enter a Solar Hijri year from 1370 to 1403. Using ${input.year} for now.` : 'Solar Hijri year, 1370 to 1403'}
          </p>
          <fieldset className="est-has">
            <legend>Has</legend>
            {([['Parking', parking, setParking], ['Elevator', elevator, setElevator], ['Storage', storage, setStorage]] as const).map(
              ([name, on, set]) => (
                <label key={name} className={on ? 'est-chip on' : 'est-chip'}>
                  <input type="checkbox" checked={on} onChange={() => set(!on)} />
                  {name}
                </label>
              ),
            )}
          </fieldset>
        </form>

        <section className="est-card est-result" aria-label="Estimate" data-testid="result">
          <span className="est-tag">{month} price</span>
          <div aria-live="polite" aria-atomic="true">
            {est.tooSmall ? (
              <p className="est-big est-big--small" data-testid="too-small">Too small for this model to estimate</p>
            ) : (
              <p className="est-big" data-testid="estimate">
                {est.total.toFixed(1)}
                <span>billion toman</span>
              </p>
            )}
          </div>
          <p className="est-then" data-testid="similar">
            {range ? (
              <>Similar ads then: <b>{range.low.toFixed(1)} to {range.high.toFixed(1)} billion</b></>
            ) : (
              'Too few similar ads then to show a range.'
            )}
          </p>
          <p className="est-small est-src">{range ? range.source : ''}</p>
          <p className="est-small est-today">{TODAY_FACTOR_TEXT}</p>
          {lowData ? <p className="est-small est-warn">Few apartments this large were in the data, so this estimate is less reliable.</p> : null}
          <div className="est-links">
            <Link to="/lab">How was this calculated?</Link>
            <Link to="/data">How close is the model?</Link>
          </div>
        </section>
      </div>

      <section className="est-card est-mapcard" aria-label="Map">
        <Suspense fallback={<div className="hood-map" />}>
          <NeighborhoodMap data={hoods} bands={bands} selectedId={hoodId} onSelect={pick} dark={theme === 'dark'} />
        </Suspense>
        <div className="est-cap">
          <b data-testid="map-caption">
            {hood ? `${hood.properties.name}: ${hood.properties.ppm2} million toman per m² in 2024, from ${hood.properties.ads.toLocaleString('en-US')} ads` : 'Click a neighborhood to choose it.'}
          </b>
          <span className="est-legend" aria-label="Legend: million toman per square meter">
            {legend.map((t, i) => (
              <span key={t}><i className="sw" style={{ background: colours[i] }} />{t}</span>
            ))}
            <span className="u">million per m²</span>
          </span>
        </div>
      </section>
    </>
  );
}
