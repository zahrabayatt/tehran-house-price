import type { Stage } from '../types';
import { GENERALIZING } from './general';
import { MANY_FEATURES } from './many';
import { ONE_FEATURE } from './one';

/** The 14 steps in teaching order. A step uses only what the steps before it introduced. */
export const STAGES: Stage[] = [...ONE_FEATURE, ...MANY_FEATURES, ...GENERALIZING];
