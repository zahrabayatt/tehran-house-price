export interface MapCell {
  d: string;
  /** Neighborhood slug the cell belongs to. */
  slug: string;
  /** Readable name for the tooltip. */
  label: string;
  /** Median asking price per m2 in the cell, million toman. */
  value: number;
  /** Fill opacity, 0 to 1. */
  opacity: number;
}

export interface MapMarker {
  x: number;
  y: number;
  /** Omitted when the neighborhood has no name in the list. */
  label?: string;
}

type PriceMapProps = {
  cells: MapCell[];
  /** Null when the chosen neighborhood has no hexagon. */
  marker: MapMarker | null;
  onPick: (cellIndex: number) => void;
};

// Tehran's outline in the map's own coordinates (from OpenStreetMap, ODbL).
const OUTLINE =
  'M264 305 L282 311 L293 323 L342 344 L341 351 L344 357 L385 380 L397 393 L404 395 L432 391 L436 393 L435 397 L441 406 L443 419 L446 418 L447 412 L459 412 L458 415 L463 414 L468 421 L471 420 L462 402 L462 394 L471 388 L474 392 L487 395 L485 391 L488 390 L490 377 L493 377 L487 375 L487 370 L493 367 L499 354 L494 351 L496 349 L489 339 L483 338 L493 329 L493 322 L507 324 L513 321 L524 326 L521 323 L539 320 L539 317 L533 317 L543 304 L529 299 L517 287 L501 282 L502 272 L507 269 L507 260 L503 259 L505 256 L499 261 L490 254 L485 257 L481 251 L477 254 L466 248 L466 251 L459 255 L446 248 L442 256 L434 255 L425 261 L422 258 L419 262 L424 267 L422 271 L415 270 L411 264 L408 270 L402 271 L398 260 L397 271 L393 271 L390 275 L383 276 L379 273 L380 278 L377 281 L372 277 L373 280 L371 280 L366 277 L364 280 L360 277 L357 279 L358 286 L351 286 L341 292 L319 291 L312 288 L275 300 L267 295 L264 305 Z';

/** Hexagon map of Tehran shaded by price per m2. Click a cell to choose its neighborhood. */
export function PriceMap({ cells, marker, onPick }: PriceMapProps) {
  const anchor = marker ? (marker.x < 290 ? 'start' : marker.x > 520 ? 'end' : 'middle') : 'middle';
  return (
    <svg
      viewBox="250 235 310 200"
      role="img"
      aria-label="Map of Tehran shaded by price per square meter, with the selected neighborhood marked"
      className="map"
    >
      {cells.map((c, i) => (
        <path
          key={i}
          d={c.d}
          data-neighborhood={c.slug}
          fill="var(--ac)"
          fillOpacity={c.opacity}
          stroke="var(--sf)"
          strokeWidth={0.6}
          style={{ cursor: 'pointer' }}
          onClick={() => onPick(i)}
        >
          <title>{`${c.label}, about ${Math.round(c.value)} million toman per m²`}</title>
        </path>
      ))}
      <path
        d={OUTLINE}
        fill="none"
        stroke="var(--ink)"
        strokeWidth={1.2}
        strokeLinejoin="round"
        style={{ pointerEvents: 'none' }}
      />
      {marker ? (
        <g style={{ pointerEvents: 'none' }}>
          <circle data-testid="marker" cx={marker.x} cy={marker.y} r={4.5} fill="var(--ink)" stroke="var(--sf)" strokeWidth={1.5} />
          {marker.label ? (
            <text
              x={marker.x}
              y={marker.y - 8}
              textAnchor={anchor}
              fontSize={8}
              fontWeight={600}
              fill="var(--ink)"
              stroke="var(--sf)"
              strokeWidth={2.5}
              paintOrder="stroke"
            >
              {marker.label}
            </text>
          ) : null}
        </g>
      ) : null}
    </svg>
  );
}
