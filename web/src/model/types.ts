/** The trained model as exported to model/model.json. Only fields the site reads are typed. */
export interface Model {
  version: number;
  /** Feature names in column order, e.g. "area", "location", "area^2". */
  features: string[];
  weights: number[];
  bias: number;
  scaling: { mu: number[]; sigma: number[] };
  location: {
    /** Neighborhood slug to median price per m2, in million toman. */
    lookup: Record<string, number>;
    /** Tehran-wide median, used for unknown or blank neighborhoods. */
    fallback: number;
  };
  hyperparameters?: { alpha: number; lambda: number; iterations: number };
  cost?: { train: number; selection: number; held_out: number };
  cost_history?: number[];
  cost_history_iterations?: number[];
  /** How far off the model was on listings it never trained on. */
  held_out_gap?: {
    median_billions: number;
    median_share_of_price: number;
    p90_billions: number;
    p90_share_of_price: number;
  };
  /** Months covered by the data, as "YYYY-MM". */
  date_range?: { start: string; end: string };
  /** Rows used in each time split. */
  rows?: { train: number; selection: number; held_out: number };
}

/** One apartment, after validation. Flags are 0 or 1. */
export interface ApartmentInput {
  /** Square metres. */
  area: number;
  /** Neighborhood slug; null or an unknown slug uses the Tehran-wide median. */
  neighborhood: string | null;
  /** Bedrooms, 0 to 5. */
  rooms: number;
  /** Construction year, Solar Hijri. */
  year: number;
  parking: boolean | 0 | 1;
  elevator: boolean | 0 | 1;
  storage: boolean | 0 | 1;
}

export interface Contribution {
  label: string;
  /** Billions of toman, relative to the average apartment. */
  value: number;
}

export interface Estimate {
  /** Asking price in billions of toman. Raw model output, never floored. */
  total: number;
  /** The average apartment's price (the bias). baseline + sum of contributions = total. */
  baseline: number;
  contributions: Contribution[];
  /** True when total is below 0.5 billion: the model is outside its range. */
  tooSmall: boolean;
  /** True when the neighborhood was blank or unknown and the Tehran-wide median was used. */
  usedFallback: boolean;
}

export type WarningCode = 'year' | 'area' | 'rooms' | 'lowData';

export interface InputWarning {
  code: WarningCode;
  message: string;
}

export interface Validated {
  input: ApartmentInput;
  warnings: InputWarning[];
}

/** What a form hands over: anything, including blanks and text. */
export interface RawInput {
  area?: unknown;
  neighborhood?: unknown;
  rooms?: unknown;
  year?: unknown;
  parking?: unknown;
  elevator?: unknown;
  storage?: unknown;
}
