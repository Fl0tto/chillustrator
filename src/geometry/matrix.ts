/**
 * 2D affine matrix utilities.
 *
 * Matrix2D = [a c e]   maps (x, y) -> (a*x + c*y + e, b*x + d*y + f)
 *            [b d f]
 *            [0 0 1]
 *
 * Pure math, framework- and DOM-independent (safe for the model layer, workers,
 * and unit tests). Mirrors SVG/DOMMatrix (a,b,c,d,e,f) conventions.
 */
import type { Matrix2D } from "@/model/types";

export type { Matrix2D };

export interface Point {
  x: number;
  y: number;
}

export function identityMatrix(): Matrix2D {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

export function isIdentity(m: Matrix2D, epsilon = 1e-9): boolean {
  return (
    Math.abs(m.a - 1) < epsilon &&
    Math.abs(m.b) < epsilon &&
    Math.abs(m.c) < epsilon &&
    Math.abs(m.d - 1) < epsilon &&
    Math.abs(m.e) < epsilon &&
    Math.abs(m.f) < epsilon
  );
}

/** Returns m1 * m2 (apply m2 first, then m1). */
export function multiply(m1: Matrix2D, m2: Matrix2D): Matrix2D {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

/** Compose a chain left-to-right: composeAll(A, B, C) = A * B * C. */
export function composeAll(...matrices: Matrix2D[]): Matrix2D {
  return matrices.reduce((acc, m) => multiply(acc, m), identityMatrix());
}

export function translate(tx: number, ty: number): Matrix2D {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

export function scale(sx: number, sy: number = sx): Matrix2D {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

/** Rotation by `degrees`, optionally around center (cx, cy). */
export function rotate(degrees: number, cx = 0, cy = 0): Matrix2D {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const r: Matrix2D = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
  if (cx === 0 && cy === 0) return r;
  return composeAll(translate(cx, cy), r, translate(-cx, -cy));
}

export function determinant(m: Matrix2D): number {
  return m.a * m.d - m.b * m.c;
}

/** Inverse matrix, or null if the matrix is (near-)singular. */
export function invert(m: Matrix2D): Matrix2D | null {
  const det = determinant(m);
  if (Math.abs(det) < 1e-12) return null;
  const invDet = 1 / det;
  return {
    a: m.d * invDet,
    b: -m.b * invDet,
    c: -m.c * invDet,
    d: m.a * invDet,
    e: (m.c * m.f - m.d * m.e) * invDet,
    f: (m.b * m.e - m.a * m.f) * invDet,
  };
}

export function applyToPoint(m: Matrix2D, p: Point): Point {
  return {
    x: m.a * p.x + m.c * p.y + m.e,
    y: m.b * p.x + m.d * p.y + m.f,
  };
}

/** Apply only the linear part (ignore translation) — for vectors/deltas. */
export function applyToVector(m: Matrix2D, p: Point): Point {
  return { x: m.a * p.x + m.c * p.y, y: m.b * p.x + m.d * p.y };
}

/** Apply an arbitrary transform `t` around a pivot point. */
export function aroundOrigin(t: Matrix2D, ox: number, oy: number): Matrix2D {
  return composeAll(translate(ox, oy), t, translate(-ox, -oy));
}

export interface DecomposedTransform {
  translateX: number;
  translateY: number;
  /** Rotation in degrees. */
  rotation: number;
  scaleX: number;
  scaleY: number;
  /** Skew (shear) angle in degrees along X. */
  skewX: number;
}

/** Decompose an affine matrix for inspector display (translate/rotate/scale/skew). */
export function decompose(m: Matrix2D): DecomposedTransform {
  const { a, b, c, d, e, f } = m;
  const scaleX = Math.hypot(a, b);
  const rotation = Math.atan2(b, a);
  // Remove rotation to compute shear and scaleY.
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const cShear = c * cos + d * sin;
  const dShear = -c * sin + d * cos;
  const scaleY = dShear;
  const skewX = scaleY !== 0 ? Math.atan2(cShear, scaleY) : 0;
  return {
    translateX: e,
    translateY: f,
    rotation: (rotation * 180) / Math.PI,
    scaleX,
    scaleY,
    skewX: (skewX * 180) / Math.PI,
  };
}

/** Serialize a matrix to an SVG transform attribute value. */
export function toSvgTransform(m: Matrix2D, precision = 6): string {
  const r = (n: number) => {
    const v = Number(n.toFixed(precision));
    return Object.is(v, -0) ? 0 : v;
  };
  return `matrix(${r(m.a)} ${r(m.b)} ${r(m.c)} ${r(m.d)} ${r(m.e)} ${r(m.f)})`;
}

export function matrixEquals(a: Matrix2D, b: Matrix2D, epsilon = 1e-9): boolean {
  return (
    Math.abs(a.a - b.a) < epsilon &&
    Math.abs(a.b - b.b) < epsilon &&
    Math.abs(a.c - b.c) < epsilon &&
    Math.abs(a.d - b.d) < epsilon &&
    Math.abs(a.e - b.e) < epsilon &&
    Math.abs(a.f - b.f) < epsilon
  );
}
