import type {
  ApartmentInput, Contribution, Estimate, InputWarning, Model, RawInput, Validated,
} from './types';

export const LATEST_YEAR = 1403;
export const YEAR_MIN = 1370;
export const YEAR_MAX = LATEST_YEAR;
export const YEAR_DEFAULT = 1395;
export const AREA_MIN = 25;
export const AREA_MAX = 600;
export const AREA_DEFAULT = 90;
export const ROOMS_MAX = 5;
export const ROOMS_DEFAULT = 2;
/** Areas above this are rare in the training data. */
export const LOW_DATA_AREA = 200;
/** Totals below this (billions of toman) are flagged as outside the model's range. */
export const TOO_SMALL_TOTAL = 0.5;

const SIZE_LABEL = 'Size and neighborhood';
const LABELS: Record<string, string> = {
  area: SIZE_LABEL,
  location: SIZE_LABEL,
  rooms: 'Bedrooms',
  age: 'Building age',
  parking: 'Parking',
  elevator: 'Elevator',
  storage: 'Storage',
};

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
}

function toFlag(v: unknown): 0 | 1 {
  return v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
}

/**
 * Clean a form's values into an input the model can use, and say what was changed.
 * The result is always finite: bad numbers are clamped or replaced, never passed on.
 */
export function validateInput(raw: RawInput): Validated {
  const warnings: InputWarning[] = [];

  // Area: clamp to the training range (infinities clamp too). Text or blank gets a default.
  let area = toNumber(raw.area);
  if (Number.isNaN(area)) {
    area = AREA_DEFAULT;
    warnings.push({ code: 'area', message: `Area was missing, so ${AREA_DEFAULT} m2 is used.` });
  } else if (area < AREA_MIN || area > AREA_MAX) {
    area = Math.min(AREA_MAX, Math.max(AREA_MIN, area));
    warnings.push({
      code: 'area',
      message: `Area is limited to ${AREA_MIN} to ${AREA_MAX} m2, the range the model learned from.`,
    });
  }
  if (area > LOW_DATA_AREA) {
    warnings.push({
      code: 'lowData',
      message: `Few apartments above ${LOW_DATA_AREA} m2 were in the data, so this estimate is less reliable.`,
    });
  }

  // Year: blank uses 1395; out of range or fractional is clamped.
  let year = toNumber(raw.year);
  if (Number.isNaN(year)) {
    year = YEAR_DEFAULT;
    warnings.push({
      code: 'year',
      message: `Construction year was blank, so ${YEAR_DEFAULT} is used.`,
    });
  } else {
    const fixed = Math.min(YEAR_MAX, Math.max(YEAR_MIN, Math.round(year)));
    if (fixed !== year) {
      warnings.push({
        code: 'year',
        message: `Construction year must be ${YEAR_MIN} to ${YEAR_MAX}; ${fixed} is used.`,
      });
    }
    year = fixed;
  }

  // Rooms: whole number from 0 to 5.
  let rooms = toNumber(raw.rooms);
  if (Number.isNaN(rooms)) {
    rooms = ROOMS_DEFAULT;
    warnings.push({
      code: 'rooms',
      message: `Bedrooms was blank, so ${ROOMS_DEFAULT} is used.`,
    });
  } else {
    const fixed = Math.min(ROOMS_MAX, Math.max(0, Math.round(rooms)));
    if (fixed !== rooms) {
      warnings.push({
        code: 'rooms',
        message: `Bedrooms must be a whole number from 0 to ${ROOMS_MAX}; ${fixed} is used.`,
      });
    }
    rooms = fixed;
  }

  const neighborhood = typeof raw.neighborhood === 'string' && raw.neighborhood !== ''
    ? raw.neighborhood : null;

  return {
    input: {
      area, neighborhood, rooms, year,
      parking: toFlag(raw.parking), elevator: toFlag(raw.elevator), storage: toFlag(raw.storage),
    },
    warnings,
  };
}

function lookupPrice(model: Model, neighborhood: string | null): { ppm2: number; used: boolean } {
  const table = model.location.lookup;
  // hasOwn: a slug like "constructor" must not find an inherited property.
  if (neighborhood !== null && Object.hasOwn(table, neighborhood)) {
    return { ppm2: table[neighborhood], used: false };
  }
  return { ppm2: model.location.fallback, used: true };
}

/** Raw value of a base feature (no power), before scaling. */
function baseValue(base: string, input: ApartmentInput, ppm2: number): number {
  switch (base) {
    case 'area': return input.area;
    case 'location': return (input.area * ppm2) / 1000;
    case 'rooms': return input.rooms;
    case 'age': return LATEST_YEAR - input.year;
    case 'parking': return Number(input.parking);
    case 'elevator': return Number(input.elevator);
    case 'storage': return Number(input.storage);
    default: throw new Error(`Unknown feature "${base}" in model`);
  }
}

/** Raw value of a feature such as "area" or "location^2", before scaling. */
export function featureValue(name: string, input: ApartmentInput, ppm2: number): number {
  const [base, power] = name.split('^');
  const x = baseValue(base, input, ppm2);
  return power === undefined ? x : x ** Number(power);
}

/** Estimate an asking price, in billions of toman, with a breakdown from the average apartment. */
export function predict(model: Model, input: ApartmentInput): Estimate {
  const { ppm2, used } = lookupPrice(model, input.neighborhood);
  const rows: Contribution[] = [];
  const index = new Map<string, number>();
  let total = model.bias;

  model.features.forEach((name, j) => {
    const sigma = model.scaling.sigma[j] > 0 ? model.scaling.sigma[j] : 1;
    const z = (featureValue(name, input, ppm2) - model.scaling.mu[j]) / sigma;
    const part = z * model.weights[j];
    total += part;

    const label = LABELS[name.split('^')[0]] ?? name;
    const at = index.get(label);
    if (at === undefined) {
      index.set(label, rows.length);
      rows.push({ label, value: part });
    } else {
      rows[at].value += part;
    }
  });

  return {
    total,
    baseline: model.bias,
    contributions: rows,
    tooSmall: total < TOO_SMALL_TOTAL,
    usedFallback: used,
  };
}
