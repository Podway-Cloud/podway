/**
 * Conservative, clearly-labelled A/B statistics for the landing-experiments panel.
 *
 * These power the results zone's "uplift", "confidence", and "needs ~N more visitors" readouts.
 * They are deliberately simple and standard (a two-proportion z-test with a pooled variance, and
 * the textbook two-proportion sample-size formula) so the numbers are defensible, not a bespoke
 * model. A winner is only ever called "safe" at >= 95% confidence — the panel enforces that gate;
 * this module just reports the number.
 *
 * Pure functions only — no I/O, so they are unit-tested directly.
 */

/** 95% two-sided critical value (z for alpha = 0.05). */
export const Z_95_TWO_SIDED = 1.959963984540054;
/** z for 80% power (beta = 0.20) — the conventional power target for sample-size planning. */
export const Z_80_POWER = 0.8416212335729143;
/** The confidence bar at which the panel is allowed to call a winner "safe". */
export const SAFE_CONFIDENCE = 0.95;

export interface ProportionSample {
  conversions: number;
  visitors: number;
}

/** Conversion rate in [0, 1]; 0 when there are no visitors (avoids NaN). */
export function conversionRate(sample: ProportionSample): number {
  return sample.visitors > 0 ? sample.conversions / sample.visitors : 0;
}

/**
 * Abramowitz & Stegun 7.1.26 rational approximation of erf(x) (|error| < 1.5e-7).
 * Enough precision for a confidence readout that is only ever compared against 0.95.
 */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/**
 * Relative uplift of `variant`'s conversion rate versus the `control`, e.g. 0.2 = +20%.
 * Null when the control rate is 0 (uplift is undefined against a zero baseline).
 */
export function upliftVsControl(
  control: ProportionSample,
  variant: ProportionSample,
): number | null {
  const controlRate = conversionRate(control);
  if (controlRate <= 0) return null;
  return (conversionRate(variant) - controlRate) / controlRate;
}

/**
 * Two-sided confidence in [0, 1] that `variant` differs from `control`, from a two-proportion
 * z-test with a pooled variance (confidence = 1 - p-value). Null when either arm has no visitors
 * or the pooled variance is degenerate. Conservative: makes no continuity correction and does not
 * assume a direction.
 */
export function confidence(
  control: ProportionSample,
  variant: ProportionSample,
): number | null {
  const nControl = control.visitors;
  const nVariant = variant.visitors;
  if (nControl <= 0 || nVariant <= 0) return null;
  const pControl = control.conversions / nControl;
  const pVariant = variant.conversions / nVariant;
  const pPooled = (control.conversions + variant.conversions) / (nControl + nVariant);
  const standardError = Math.sqrt(pPooled * (1 - pPooled) * (1 / nControl + 1 / nVariant));
  if (standardError === 0) return null;
  const z = (pVariant - pControl) / standardError;
  return erf(Math.abs(z) / Math.SQRT2);
}

/**
 * Textbook per-arm sample size to detect the observed control→variant difference at 95%
 * confidence and 80% power. Returns the visitors required PER VARIANT (rounded up); compare it
 * against the smaller arm's current visitors for the "needs ~N more" readout. Null when the two
 * observed rates are identical (no effect to size for).
 */
export function visitorsNeededFor95(
  control: ProportionSample,
  variant: ProportionSample,
): number | null {
  const pControl = conversionRate(control);
  const pVariant = conversionRate(variant);
  if (pControl === pVariant) return null;
  const pBar = (pControl + pVariant) / 2;
  const term =
    Z_95_TWO_SIDED * Math.sqrt(2 * pBar * (1 - pBar)) +
    Z_80_POWER * Math.sqrt(pControl * (1 - pControl) + pVariant * (1 - pVariant));
  const perArm = (term * term) / (pVariant - pControl) ** 2;
  return Math.ceil(perArm);
}
