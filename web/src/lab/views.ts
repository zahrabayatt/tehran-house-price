import { costByDegree, costByLambda, errorHistogram, predictedVsActual } from './views/heldout';
import {
  dotProduct, featurePanels, lrCurves, lrW0, multiCost, multiWeights, scaleContour, scaleTrain, shapes, zscorePanels,
} from './views/many';
import {
  arrows, cleanDist, contour, costCurve, errorsPlot, fitPlot, gdCost, gdParams, priceHistogram, scatter, surface, tangent,
} from './views/one';
import { fitThree, polyFit, polyResiduals, powers, weightBars } from './views/poly';

/**
 * Every plot of the Lab, by name. The functions live in views/, split by part of the course:
 * one.ts (one feature), many.ts (many features), poly.ts (polynomials) and heldout.ts (the final step).
 */
export const VIEWS = {
  priceHistogram,
  priceVsArea: scatter('area', 'Area (m²)'),
  priceVsAge: scatter('age', 'Building age (years)'),
  cleanDist,
  fit: fitPlot,
  errors: errorsPlot,
  costCurve,
  contour,
  surface,
  tangent,
  arrows,
  gdCost,
  gdParams,
  dotProduct,
  shapes,
  featurePanels,
  multiCost,
  multiWeights,
  lrCurves,
  lrW0,
  zscorePanels,
  scaleContour,
  scaleTrain,
  polyFit,
  polyResiduals,
  powers,
  fitThree,
  weightBars,
  predictedVsActual,
  errorHistogram,
  costByDegree,
  costByLambda,
};
