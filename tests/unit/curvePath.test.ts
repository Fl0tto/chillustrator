import { describe, expect, it } from "vitest";
import {
  cubicFromBend,
  curveBendPoint,
  curvePathGeometry,
  equivalentCurveRadius,
} from "@/geometry/curvePath";

function cubicAtHalf(
  start: { x: number; y: number },
  c: ReturnType<typeof cubicFromBend>,
) {
  const t = 0.5;
  const mt = 1 - t;
  return {
    x:
      mt * mt * mt * start.x +
      3 * mt * mt * t * c.x1 +
      3 * mt * t * t * c.x2 +
      t * t * t * c.x,
    y:
      mt * mt * mt * start.y +
      3 * mt * mt * t * c.y1 +
      3 * mt * t * t * c.y2 +
      t * t * t * c.y,
  };
}

describe("curve tool geometry", () => {
  it("maps signed bend to the cubic midpoint exactly", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 100, y: 0 };
    for (const bend of [-30, 0, 25]) {
      const cubic = cubicFromBend(start, end, bend);
      const mid = cubicAtHalf(start, cubic);
      const target = curveBendPoint(start, end, bend);
      expect(mid.x).toBeCloseTo(target.x, 8);
      expect(mid.y).toBeCloseTo(target.y, 8);
    }
  });

  it("flips alignment when bend crosses zero", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 100, y: 0 };
    expect(curveBendPoint(start, end, 20).y).toBeGreaterThan(0);
    expect(curveBendPoint(start, end, -20).y).toBeLessThan(0);
  });

  it("emits one normal cubic segment per chained curve", () => {
    const g = curvePathGeometry(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 150, y: 80 },
      ],
      [20, -15],
    );
    expect(g.segments.map((s) => s.type)).toEqual(["M", "C", "C"]);
  });

  it("reports an infinite radius for a straight segment", () => {
    expect(equivalentCurveRadius({ x: 0, y: 0 }, { x: 100, y: 0 }, 0)).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(equivalentCurveRadius({ x: 0, y: 0 }, { x: 100, y: 0 }, 20)).toBeGreaterThan(0);
  });
});
