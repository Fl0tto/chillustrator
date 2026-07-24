/**
 * Parse an SVG `transform` attribute into a Matrix2D.
 *
 * Supports the SVG 1.1 transform list: matrix, translate, scale, rotate,
 * skewX, skewY, composed left-to-right (leftmost is outermost). Uses the
 * geometry/matrix helpers so conventions match the rest of the app.
 */
import type { Matrix2D } from "@/model/types";
import {
  composeAll,
  identityMatrix,
  multiply,
  rotate,
  scale,
  translate,
} from "@/geometry/matrix";

function skewX(deg: number): Matrix2D {
  return { a: 1, b: 0, c: Math.tan((deg * Math.PI) / 180), d: 1, e: 0, f: 0 };
}

function skewY(deg: number): Matrix2D {
  return { a: 1, b: Math.tan((deg * Math.PI) / 180), c: 0, d: 1, e: 0, f: 0 };
}

const TRANSFORM_RE = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi;

function numbers(raw: string): number[] {
  return raw
    .split(/[\s,]+/)
    .map((t) => parseFloat(t))
    .filter((n) => !Number.isNaN(n));
}

/**
 * Parse a transform attribute value. Returns the identity matrix for empty or
 * unparseable input (never throws) so import stays robust.
 */
export function parseTransform(input: string | null | undefined): Matrix2D {
  if (!input) return identityMatrix();
  const parts: Matrix2D[] = [];
  let match: RegExpExecArray | null;
  TRANSFORM_RE.lastIndex = 0;
  while ((match = TRANSFORM_RE.exec(input)) !== null) {
    const fn = match[1].toLowerCase();
    const args = numbers(match[2]);
    switch (fn) {
      case "matrix":
        if (args.length === 6) {
          parts.push({ a: args[0], b: args[1], c: args[2], d: args[3], e: args[4], f: args[5] });
        }
        break;
      case "translate":
        parts.push(translate(args[0] ?? 0, args[1] ?? 0));
        break;
      case "scale":
        parts.push(scale(args[0] ?? 1, args[1] ?? args[0] ?? 1));
        break;
      case "rotate":
        parts.push(rotate(args[0] ?? 0, args[1] ?? 0, args[2] ?? 0));
        break;
      case "skewx":
        parts.push(skewX(args[0] ?? 0));
        break;
      case "skewy":
        parts.push(skewY(args[0] ?? 0));
        break;
    }
  }
  if (parts.length === 0) return identityMatrix();
  if (parts.length === 1) return parts[0];
  return composeAll(...parts);
}

/** Compose two matrices where `parent` is applied outside `child`. */
export function composeParentChild(parent: Matrix2D, child: Matrix2D): Matrix2D {
  return multiply(parent, child);
}
