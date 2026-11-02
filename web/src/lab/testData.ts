import listings from '../../public/data/listings.json';
import sample from '../../public/data/sample.json';
import model from '../../../model/model.json';
import type { Listing } from '../model/siteData';
import type { Model } from '../model/types';
import type { LabInputs } from './context';
import { makeCtx } from './context';
import type { Sample } from './engine';

/** The real sample, listings and model, for tests. */
export const inputs: LabInputs = {
  sample: sample as unknown as Sample,
  listings: listings as unknown as Listing[],
  model: model as unknown as Model,
};

export const ctx = makeCtx(inputs);
