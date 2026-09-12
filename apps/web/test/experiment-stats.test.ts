import { describe, expect, it } from "vitest";
import {
  SAFE_CONFIDENCE,
  conversionRate,
  confidence,
  upliftVsControl,
  visitorsNeededFor95,
} from "../lib/experiment-stats";

describe("experiment-stats", () => {
  it("computes conversion rate and guards the zero-visitor case", () => {
    expect(conversionRate({ conversions: 20, visitors: 100 })).toBeCloseTo(0.2, 10);
    expect(conversionRate({ conversions: 0, visitors: 0 })).toBe(0);
  });

  it("computes relative uplift vs the control", () => {
    // control 10%, variant 20% => +100% relative uplift.
    expect(
      upliftVsControl({ conversions: 10, visitors: 100 }, { conversions: 20, visitors: 100 }),
    ).toBeCloseTo(1, 10);
    // A worse variant is a negative uplift.
    expect(
      upliftVsControl({ conversions: 20, visitors: 100 }, { conversions: 10, visitors: 100 }),
    ).toBeCloseTo(-0.5, 10);
    // Undefined against a zero baseline.
    expect(
      upliftVsControl({ conversions: 0, visitors: 100 }, { conversions: 5, visitors: 100 }),
    ).toBeNull();
  });

  it("returns null confidence when an arm has no visitors or the rates are degenerate", () => {
    expect(confidence({ conversions: 0, visitors: 0 }, { conversions: 5, visitors: 100 })).toBeNull();
    // Both arms zero conversions => pooled variance is 0 => no signal.
    expect(confidence({ conversions: 0, visitors: 100 }, { conversions: 0, visitors: 100 })).toBeNull();
  });

  it("computes a known two-proportion confidence", () => {
    // control 50/1000 = 5%, variant 100/1000 = 10%. Pooled p = 0.075, SE ≈ 0.011779,
    // z ≈ 4.245 => two-sided confidence ≈ 0.99998.
    const c = confidence({ conversions: 50, visitors: 1000 }, { conversions: 100, visitors: 1000 });
    expect(c).not.toBeNull();
    expect(c!).toBeGreaterThan(0.999);
    expect(c!).toBeLessThanOrEqual(1);
  });

  it("keeps a small, noisy difference below the 95% safe bar and a strong one above it", () => {
    const weak = confidence({ conversions: 10, visitors: 100 }, { conversions: 12, visitors: 100 });
    const strong = confidence({ conversions: 100, visitors: 1000 }, { conversions: 140, visitors: 1000 });
    expect(weak!).toBeLessThan(SAFE_CONFIDENCE);
    expect(strong!).toBeGreaterThanOrEqual(SAFE_CONFIDENCE);
  });

  it("brackets the 95% confidence boundary", () => {
    // Symmetric equal arms: z = 1.96 => confidence = 0.95 exactly. Nudging the variant's
    // conversions across the z=1.96 point must move confidence across 0.95.
    // control 100/1000 (10%). Solve for the variant conversions on either side of z≈1.96.
    const control = { conversions: 100, visitors: 1000 };
    const below = confidence(control, { conversions: 126, visitors: 1000 })!; // z just under 1.96
    const above = confidence(control, { conversions: 130, visitors: 1000 })!; // z just over 1.96
    expect(below).toBeLessThan(SAFE_CONFIDENCE);
    expect(above).toBeGreaterThan(SAFE_CONFIDENCE);
  });

  it("sizes the visitors needed for 95% and returns null for a null effect", () => {
    expect(
      visitorsNeededFor95({ conversions: 100, visitors: 1000 }, { conversions: 100, visitors: 1000 }),
    ).toBeNull();
    // A small effect needs a large per-arm sample; a big effect needs far fewer.
    const smallEffect = visitorsNeededFor95(
      { conversions: 100, visitors: 1000 },
      { conversions: 110, visitors: 1000 },
    )!;
    const bigEffect = visitorsNeededFor95(
      { conversions: 100, visitors: 1000 },
      { conversions: 200, visitors: 1000 },
    )!;
    expect(Number.isInteger(smallEffect)).toBe(true);
    expect(smallEffect).toBeGreaterThan(bigEffect);
    expect(bigEffect).toBeGreaterThan(0);
  });
});
