/**
 * SVG path `d` parser → canonical PathGeometry (spec PTH-001/002).
 *
 * Accepts every path command (M/L/H/V/C/S/Q/T/A/Z, absolute and relative) and
 * normalizes to absolute Move/Line/Cubic/Close segments: H/V → L, Q/T → C
 * (degree elevation), S/T shorthand → reflected control points, A → one or more
 * cubic segments. Malformed input yields the segments parsed so far plus a
 * validation error rather than throwing (PTH-003).
 *
 * Pure math (no DOM/React/model).
 */
import type { PathGeometry, PathSegment } from "./pathTypes";

export interface ParsePathResult {
  geometry: PathGeometry;
  /** Non-fatal notes (e.g. truncated trailing numbers). */
  warnings: string[];
  /** Fatal parse error, when the input could not be interpreted at all. */
  error?: string;
}

export interface PathValidationLimits {
  maxSegments?: number;
  maxSubpaths?: number;
  maxCoordinate?: number;
}

const DEFAULT_LIMITS: Required<PathValidationLimits> = {
  maxSegments: 500_000,
  maxSubpaths: 100_000,
  maxCoordinate: 1e7,
};

const TOKEN_RE = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;

type Token = { cmd: string } | { num: number };

function tokenize(d: string): Token[] {
  const tokens: Token[] = [];
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(d)) !== null) {
    if (m[1] !== undefined) tokens.push({ cmd: m[1] });
    else tokens.push({ num: parseFloat(m[2]) });
  }
  return tokens;
}

/** Number of parameters each command consumes per repetition. */
const ARITY: Record<string, number> = {
  M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0,
};

/**
 * Convert an SVG elliptical arc (endpoint form) into a series of cubic segments.
 * Follows the SVG implementation notes (F.6). Returns [] for degenerate arcs.
 */
function arcToCubics(
  x1: number, y1: number,
  rx: number, ry: number,
  phiDeg: number, largeArc: boolean, sweep: boolean,
  x2: number, y2: number,
): Array<[number, number, number, number, number, number]> {
  if (x1 === x2 && y1 === y2) return [];
  if (rx === 0 || ry === 0) {
    // Degenerate → straight line, represented as a trivial cubic.
    return [[x1, y1, x2, y2, x2, y2]];
  }
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (phiDeg % 360) * (Math.PI / 180);
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  // Step 1: compute (x1', y1') in the rotated frame.
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  // Correct out-of-range radii.
  let rxs = rx * rx;
  let rys = ry * ry;
  const lambda = (x1p * x1p) / rxs + (y1p * y1p) / rys;
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
    rxs = rx * rx;
    rys = ry * ry;
  }

  // Step 2: compute center (cx', cy').
  const sign = largeArc !== sweep ? 1 : -1;
  let num = rxs * rys - rxs * y1p * y1p - rys * x1p * x1p;
  if (num < 0) num = 0;
  const den = rxs * y1p * y1p + rys * x1p * x1p;
  const co = den === 0 ? 0 : sign * Math.sqrt(num / den);
  const cxp = (co * (rx * y1p)) / ry;
  const cyp = (co * -(ry * x1p)) / rx;

  // Step 3: center in original coordinates.
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  // Step 4: start angle and sweep angle.
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    let a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angle(
    (x1p - cxp) / rx, (y1p - cyp) / ry,
    (-x1p - cxp) / rx, (-y1p - cyp) / ry,
  );
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  // Split into segments of at most 90°.
  const segCount = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const delta = dTheta / segCount;
  const t = (4 / 3) * Math.tan(delta / 4);
  const out: Array<[number, number, number, number, number, number]> = [];

  let theta = theta1;
  const pointAt = (a: number): [number, number] => {
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    return [
      cx + rx * cosA * cosPhi - ry * sinA * sinPhi,
      cy + rx * cosA * sinPhi + ry * sinA * cosPhi,
    ];
  };
  const derivAt = (a: number): [number, number] => {
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    return [
      -rx * sinA * cosPhi - ry * cosA * sinPhi,
      -rx * sinA * sinPhi + ry * cosA * cosPhi,
    ];
  };

  for (let i = 0; i < segCount; i++) {
    const a1 = theta;
    const a2 = theta + delta;
    const [p1x, p1y] = pointAt(a1);
    const [p2x, p2y] = pointAt(a2);
    const [d1x, d1y] = derivAt(a1);
    const [d2x, d2y] = derivAt(a2);
    out.push([
      p1x + t * d1x, p1y + t * d1y,
      p2x - t * d2x, p2y - t * d2y,
      p2x, p2y,
    ]);
    theta = a2;
  }
  return out;
}

/**
 * Parse a path `d` string into normalized absolute PathGeometry.
 */
export function parsePath(d: string, limits: PathValidationLimits = {}): ParsePathResult {
  const lim = { ...DEFAULT_LIMITS, ...limits };
  const warnings: string[] = [];
  const segments: PathSegment[] = [];
  if (typeof d !== "string" || d.trim() === "") {
    return { geometry: { segments }, warnings, error: "Empty path data" };
  }

  const tokens = tokenize(d);
  let i = 0;
  let cx = 0, cy = 0;      // current point
  let sx = 0, sy = 0;      // current subpath start
  let subpaths = 0;
  // Reflection control points for S/T.
  let prevCubicCtrlX = 0, prevCubicCtrlY = 0;
  let prevQuadCtrlX = 0, prevQuadCtrlY = 0;
  let prevType = "";

  const bad = (v: number) => !Number.isFinite(v) || Math.abs(v) > lim.maxCoordinate;

  const nextNum = (): number | null => {
    const tok = tokens[i];
    if (!tok || !("num" in tok)) return null;
    i++;
    return tok.num;
  };

  while (i < tokens.length) {
    const tok = tokens[i];
    if (!("cmd" in tok)) {
      // A bare number with no command: SVG repeats the previous command, but a
      // leading stray number is invalid.
      return { geometry: { segments }, warnings, error: "Path data must start with a command" };
    }
    const cmd = tok.cmd;
    i++;

    if (cmd === "Z" || cmd === "z") {
      segments.push({ type: "Z" });
      cx = sx;
      cy = sy;
      prevType = "Z";
      continue;
    }

    const rel = cmd === cmd.toLowerCase();
    const CMD = cmd.toUpperCase();
    const arity = ARITY[CMD];
    if (arity === undefined) {
      return { geometry: { segments }, warnings, error: `Unknown command "${cmd}"` };
    }

    // A command letter may be followed by multiple parameter sets (implicit
    // repetition). After the first M/m, repeats act as L/l.
    let first = true;
    while (true) {
      // Stop when the next token is a command, not a number.
      if (!tokens[i] || !("num" in tokens[i])) break;

      const args: number[] = [];
      for (let k = 0; k < arity; k++) {
        const n = nextNum();
        if (n === null) {
          warnings.push(`Truncated parameters for "${cmd}"`);
          return { geometry: { segments }, warnings };
        }
        args.push(n);
      }

      let effective = CMD;
      if (CMD === "M" && !first) effective = "L";

      switch (effective) {
        case "M": {
          const x = rel ? cx + args[0] : args[0];
          const y = rel ? cy + args[1] : args[1];
          if (bad(x) || bad(y)) return { geometry: { segments }, warnings, error: "Coordinate out of range" };
          segments.push({ type: "M", x, y });
          cx = x; cy = y; sx = x; sy = y;
          subpaths++;
          if (subpaths > lim.maxSubpaths) return { geometry: { segments }, warnings, error: "Too many subpaths" };
          break;
        }
        case "L": {
          const x = rel ? cx + args[0] : args[0];
          const y = rel ? cy + args[1] : args[1];
          if (bad(x) || bad(y)) return { geometry: { segments }, warnings, error: "Coordinate out of range" };
          segments.push({ type: "L", x, y });
          cx = x; cy = y;
          break;
        }
        case "H": {
          const x = rel ? cx + args[0] : args[0];
          if (bad(x)) return { geometry: { segments }, warnings, error: "Coordinate out of range" };
          segments.push({ type: "L", x, y: cy });
          cx = x;
          break;
        }
        case "V": {
          const y = rel ? cy + args[0] : args[0];
          if (bad(y)) return { geometry: { segments }, warnings, error: "Coordinate out of range" };
          segments.push({ type: "L", x: cx, y });
          cy = y;
          break;
        }
        case "C": {
          const x1 = rel ? cx + args[0] : args[0];
          const y1 = rel ? cy + args[1] : args[1];
          const x2 = rel ? cx + args[2] : args[2];
          const y2 = rel ? cy + args[3] : args[3];
          const x = rel ? cx + args[4] : args[4];
          const y = rel ? cy + args[5] : args[5];
          segments.push({ type: "C", x1, y1, x2, y2, x, y });
          prevCubicCtrlX = x2; prevCubicCtrlY = y2;
          cx = x; cy = y;
          break;
        }
        case "S": {
          const x2 = rel ? cx + args[0] : args[0];
          const y2 = rel ? cy + args[1] : args[1];
          const x = rel ? cx + args[2] : args[2];
          const y = rel ? cy + args[3] : args[3];
          const reflect = prevType === "C" || prevType === "S";
          const x1 = reflect ? 2 * cx - prevCubicCtrlX : cx;
          const y1 = reflect ? 2 * cy - prevCubicCtrlY : cy;
          segments.push({ type: "C", x1, y1, x2, y2, x, y });
          prevCubicCtrlX = x2; prevCubicCtrlY = y2;
          cx = x; cy = y;
          break;
        }
        case "Q": {
          const qx = rel ? cx + args[0] : args[0];
          const qy = rel ? cy + args[1] : args[1];
          const x = rel ? cx + args[2] : args[2];
          const y = rel ? cy + args[3] : args[3];
          // Elevate quadratic to cubic.
          const x1 = cx + (2 / 3) * (qx - cx);
          const y1 = cy + (2 / 3) * (qy - cy);
          const x2 = x + (2 / 3) * (qx - x);
          const y2 = y + (2 / 3) * (qy - y);
          segments.push({ type: "C", x1, y1, x2, y2, x, y });
          prevQuadCtrlX = qx; prevQuadCtrlY = qy;
          cx = x; cy = y;
          break;
        }
        case "T": {
          const x = rel ? cx + args[0] : args[0];
          const y = rel ? cy + args[1] : args[1];
          const reflect = prevType === "Q" || prevType === "T";
          const qx = reflect ? 2 * cx - prevQuadCtrlX : cx;
          const qy = reflect ? 2 * cy - prevQuadCtrlY : cy;
          const x1 = cx + (2 / 3) * (qx - cx);
          const y1 = cy + (2 / 3) * (qy - cy);
          const x2 = x + (2 / 3) * (qx - x);
          const y2 = y + (2 / 3) * (qy - y);
          segments.push({ type: "C", x1, y1, x2, y2, x, y });
          prevQuadCtrlX = qx; prevQuadCtrlY = qy;
          cx = x; cy = y;
          break;
        }
        case "A": {
          const rx = args[0];
          const ry = args[1];
          const rot = args[2];
          const large = args[3] !== 0;
          const sweep = args[4] !== 0;
          const x = rel ? cx + args[5] : args[5];
          const y = rel ? cy + args[6] : args[6];
          const cubics = arcToCubics(cx, cy, rx, ry, rot, large, sweep, x, y);
          for (const c of cubics) {
            segments.push({ type: "C", x1: c[0], y1: c[1], x2: c[2], y2: c[3], x: c[4], y: c[5] });
          }
          if (cubics.length === 0 && (cx !== x || cy !== y)) {
            segments.push({ type: "L", x, y });
          }
          cx = x; cy = y;
          break;
        }
      }

      prevType = effective;
      first = false;
      if (segments.length > lim.maxSegments) {
        return { geometry: { segments }, warnings, error: "Too many path segments" };
      }
      if (arity === 0) break;
    }
  }

  if (segments.length === 0) {
    return { geometry: { segments }, warnings, error: "No drawable segments" };
  }
  return { geometry: { segments }, warnings };
}
