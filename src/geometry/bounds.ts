/**
 * Axis-aligned bounding box utilities. Framework-independent, pure math.
 */
import type { Matrix2D } from "@/model/types";
import { applyToPoint, type Point } from "./matrix";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function rectToBounds(r: Rect): Bounds {
  return { minX: r.x, minY: r.y, maxX: r.x + r.width, maxY: r.y + r.height };
}

export function boundsToRect(b: Bounds): Rect {
  return { x: b.minX, y: b.minY, width: b.maxX - b.minX, height: b.maxY - b.minY };
}

export function boundsCenter(b: Bounds): Point {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

export function emptyBounds(): Bounds {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function isEmptyBounds(b: Bounds): boolean {
  return !(b.maxX >= b.minX && b.maxY >= b.minY) || !isFinite(b.minX);
}

export function extendBounds(b: Bounds, p: Point): Bounds {
  return {
    minX: Math.min(b.minX, p.x),
    minY: Math.min(b.minY, p.y),
    maxX: Math.max(b.maxX, p.x),
    maxY: Math.max(b.maxY, p.y),
  };
}

export function unionBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function unionAll(list: Bounds[]): Bounds {
  return list.reduce((acc, b) => unionBounds(acc, b), emptyBounds());
}

/** Transform an AABB by a matrix and return the AABB of the result. */
export function transformBounds(b: Bounds, m: Matrix2D): Bounds {
  if (isEmptyBounds(b)) return b;
  const corners: Point[] = [
    { x: b.minX, y: b.minY },
    { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY },
    { x: b.minX, y: b.maxY },
  ];
  let out = emptyBounds();
  for (const c of corners) out = extendBounds(out, applyToPoint(m, c));
  return out;
}

export function boundsContainPoint(b: Bounds, p: Point): boolean {
  return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** True when `inner` is fully contained by `outer` (used by marquee selection). */
export function boundsContainBounds(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.minX >= outer.minX &&
    inner.maxX <= outer.maxX &&
    inner.minY >= outer.minY &&
    inner.maxY <= outer.maxY
  );
}
