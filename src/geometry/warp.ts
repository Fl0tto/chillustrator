/**
 * Non-destructive warp math (feature wave 3, item 2).
 *
 * Deforms a PathGeometry by an arc (circle bend) or wave (sine) modifier. The
 * caller keeps the original geometry + WarpSpec on the node and re-evaluates this
 * on demand, so warps stay fully re-editable.
 *
 * Strategy: flatten curves to a dense polyline (reusing flattenGeometry), displace
 * every vertex, and rebuild an M/L PathGeometry preserving closed subpaths. Pure
 * math — no DOM/React/model imports.
 */
import type { WarpSpec } from "@/model/types";
import type { Point } from "./matrix";
import type { PathGeometry, PathSegment } from "./pathTypes";
import { flattenGeometry } from "./pathData";
import { geometryBounds } from "./pathData";
import { isEmptyBounds, type Bounds } from "./bounds";

/** Flattening tolerance (local units) before warping. Small = smoother arcs. */
const WARP_FLATTEN_TOLERANCE = 0.5;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Bend a point given in a LOCAL frame (origin on the bend axis, `u` along the
 * axis, `v` perpendicular) around a circle of `radius`. `sign` +1 arches one way,
 * -1 the other. Returns the bent local coordinates.
 */
function bendLocal(u: number, v: number, radius: number, sign: number): Point {
  const v0 = sign > 0 ? v : -v;
  const theta = u / radius;
  const rho = radius - v0;
  const bu = rho * Math.sin(theta);
  let bv = radius - rho * Math.cos(theta);
  if (sign < 0) bv = -bv;
  return { x: bu, y: bv };
}

/** Apply an arc warp to a single world point. */
function arcPoint(
  p: Point,
  spec: Extract<WarpSpec, { type: "arc" }>,
  b: Bounds,
): Point {
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const radius = Math.max(1e-3, spec.radius);
  const horizontal = spec.direction === "top" || spec.direction === "bottom";
  const sign = spec.direction === "top" || spec.direction === "right" ? 1 : -1;

  // Local frame: u = position along the bend axis, v = perpendicular offset.
  const u = horizontal ? p.x - cx : p.y - cy;
  const v = horizontal ? p.y - cy : p.x - cx;

  const bent = bendLocal(u, v, radius, sign);

  // Blend between the original offset and the bent one.
  const fu = lerp(u, bent.x, spec.amount);
  const fv = lerp(v, bent.y, spec.amount);

  return horizontal ? { x: cx + fu, y: cy + fv } : { x: cx + fv, y: cy + fu };
}

/** Apply a wave warp to a single point. */
function wavePoint(
  p: Point,
  spec: Extract<WarpSpec, { type: "wave" }>,
  b: Bounds,
): Point {
  const w = Math.max(1e-6, b.maxX - b.minX);
  const h = Math.max(1e-6, b.maxY - b.minY);
  if (spec.axis === "horizontal") {
    const s = (p.x - b.minX) / w;
    const disp = spec.direction * spec.amplitude * Math.sin(2 * Math.PI * spec.frequency * s + spec.phase);
    return { x: p.x, y: p.y + disp };
  }
  const s = (p.y - b.minY) / h;
  const disp = spec.direction * spec.amplitude * Math.sin(2 * Math.PI * spec.frequency * s + spec.phase);
  return { x: p.x + disp, y: p.y };
}

function warpPoint(p: Point, spec: WarpSpec, b: Bounds): Point {
  return spec.type === "arc" ? arcPoint(p, spec, b) : wavePoint(p, spec, b);
}

/**
 * Warp geometry by `spec`. `bounds` is the geometry's own bounds (pass a cached
 * value when available; otherwise it is computed). Returns a fresh PathGeometry.
 */
export function applyWarp(
  geometry: PathGeometry,
  spec: WarpSpec,
  bounds?: Bounds,
): PathGeometry {
  const b = bounds ?? geometryBounds(geometry);
  if (isEmptyBounds(b)) return geometry;
  const contours = flattenGeometry(geometry, WARP_FLATTEN_TOLERANCE);
  const segments: PathSegment[] = [];
  for (const contour of contours) {
    if (contour.points.length === 0) continue;
    contour.points.forEach((pt, i) => {
      const w = warpPoint(pt, spec, b);
      segments.push({ type: i === 0 ? "M" : "L", x: w.x, y: w.y });
    });
    if (contour.closed) segments.push({ type: "Z" });
  }
  return { segments };
}
