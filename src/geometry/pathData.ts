/**
 * Serialize canonical PathGeometry back to an SVG `d` string, plus exact bounds
 * and polyline flattening (spec PTH-001/004).
 *
 * Pure math (no DOM/React/model).
 */
import type { Point, Matrix2D } from "./matrix";
import { applyToPoint } from "./matrix";
import { emptyBounds, extendBounds, type Bounds } from "./bounds";
import type { Contour, CubicSegment, PathGeometry } from "./pathTypes";

/** Round to `precision` decimals, dropping trailing zeros and negative zero. */
function fmt(n: number, precision: number): string {
  const v = Number(n.toFixed(precision));
  return Object.is(v, -0) ? "0" : String(v);
}

/** PathGeometry → SVG `d` string. */
export function serializePath(geometry: PathGeometry, precision = 3): string {
  const p = (n: number) => fmt(n, precision);
  const out: string[] = [];
  for (const seg of geometry.segments) {
    switch (seg.type) {
      case "M":
        out.push(`M${p(seg.x)} ${p(seg.y)}`);
        break;
      case "L":
        out.push(`L${p(seg.x)} ${p(seg.y)}`);
        break;
      case "C":
        out.push(`C${p(seg.x1)} ${p(seg.y1)} ${p(seg.x2)} ${p(seg.y2)} ${p(seg.x)} ${p(seg.y)}`);
        break;
      case "Z":
        out.push("Z");
        break;
    }
  }
  return out.join("");
}

// ---------------------------------------------------------------------------
// Cubic helpers
// ---------------------------------------------------------------------------

function cubicPointAt(p0: Point, c: CubicSegment, t: number): Point {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const cc = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c.x1 + cc * c.x2 + d * c.x,
    y: a * p0.y + b * c.y1 + cc * c.y2 + d * c.y,
  };
}

/** Parameter values in (0,1) where a cubic's coordinate derivative is zero. */
function cubicExtremaParams(p0: number, p1: number, p2: number, p3: number): number[] {
  // Derivative is quadratic: at^2 + bt + c.
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const ts: number[] = [];
  const eps = 1e-9;
  if (Math.abs(a) < eps) {
    if (Math.abs(b) > eps) ts.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      ts.push((-b + sq) / (2 * a));
      ts.push((-b - sq) / (2 * a));
    }
  }
  return ts.filter((t) => t > 0 && t < 1);
}

/** Exact bounding box of PathGeometry, accounting for cubic extrema (PTH-004). */
export function geometryBounds(geometry: PathGeometry): Bounds {
  let bounds = emptyBounds();
  let cur: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  for (const seg of geometry.segments) {
    switch (seg.type) {
      case "M":
        cur = { x: seg.x, y: seg.y };
        start = cur;
        bounds = extendBounds(bounds, cur);
        break;
      case "L":
        cur = { x: seg.x, y: seg.y };
        bounds = extendBounds(bounds, cur);
        break;
      case "C": {
        bounds = extendBounds(bounds, { x: seg.x, y: seg.y });
        const txs = cubicExtremaParams(cur.x, seg.x1, seg.x2, seg.x);
        const tys = cubicExtremaParams(cur.y, seg.y1, seg.y2, seg.y);
        for (const t of [...txs, ...tys]) {
          bounds = extendBounds(bounds, cubicPointAt(cur, seg, t));
        }
        cur = { x: seg.x, y: seg.y };
        break;
      }
      case "Z":
        cur = start;
        break;
    }
  }
  return bounds;
}

// ---------------------------------------------------------------------------
// Flattening & transform
// ---------------------------------------------------------------------------

/** Recursively flatten a cubic to points within `tolerance` (excludes p0). */
function flattenCubic(p0: Point, c: CubicSegment, tolerance: number, out: Point[], depth = 0): void {
  const p1: Point = { x: c.x1, y: c.y1 };
  const p2: Point = { x: c.x2, y: c.y2 };
  const p3: Point = { x: c.x, y: c.y };
  // Flatness: max distance of control points from the chord p0→p3.
  const d1 = pointLineDistance(p1, p0, p3);
  const d2 = pointLineDistance(p2, p0, p3);
  if (depth > 24 || d1 + d2 <= tolerance) {
    out.push(p3);
    return;
  }
  // Subdivide (de Casteljau at t=0.5).
  const m01 = mid(p0, p1);
  const m12 = mid(p1, p2);
  const m23 = mid(p2, p3);
  const m012 = mid(m01, m12);
  const m123 = mid(m12, m23);
  const m = mid(m012, m123);
  flattenCubic(p0, { type: "C", x1: m01.x, y1: m01.y, x2: m012.x, y2: m012.y, x: m.x, y: m.y }, tolerance, out, depth + 1);
  flattenCubic(m, { type: "C", x1: m123.x, y1: m123.y, x2: m23.x, y2: m23.y, x: p3.x, y: p3.y }, tolerance, out, depth + 1);
}

function mid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function pointLineDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

/**
 * Flatten geometry into polyline contours (one per subpath). Curves are
 * subdivided until within `tolerance` (world units). Used by the boolean engine
 * and polygon-based operations.
 */
export function flattenGeometry(geometry: PathGeometry, tolerance = 0.25): Contour[] {
  const contours: Contour[] = [];
  let current: Point[] = [];
  let closed = false;
  let cur: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };

  const finish = () => {
    if (current.length > 0) contours.push({ points: current, closed });
    current = [];
    closed = false;
  };

  for (const seg of geometry.segments) {
    switch (seg.type) {
      case "M":
        finish();
        cur = { x: seg.x, y: seg.y };
        start = cur;
        current = [cur];
        break;
      case "L":
        cur = { x: seg.x, y: seg.y };
        current.push(cur);
        break;
      case "C":
        flattenCubic(cur, seg, tolerance, current);
        cur = { x: seg.x, y: seg.y };
        break;
      case "Z":
        closed = true;
        cur = start;
        break;
    }
  }
  finish();
  return contours;
}

/** Apply an affine matrix to every coordinate of the geometry. */
export function transformGeometry(geometry: PathGeometry, m: Matrix2D): PathGeometry {
  const segments = geometry.segments.map((seg): typeof seg => {
    switch (seg.type) {
      case "M": {
        const p = applyToPoint(m, { x: seg.x, y: seg.y });
        return { type: "M", x: p.x, y: p.y };
      }
      case "L": {
        const p = applyToPoint(m, { x: seg.x, y: seg.y });
        return { type: "L", x: p.x, y: p.y };
      }
      case "C": {
        const c1 = applyToPoint(m, { x: seg.x1, y: seg.y1 });
        const c2 = applyToPoint(m, { x: seg.x2, y: seg.y2 });
        const e = applyToPoint(m, { x: seg.x, y: seg.y });
        return { type: "C", x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: e.x, y: e.y };
      }
      case "Z":
        return { type: "Z" };
    }
  });
  return { segments };
}
