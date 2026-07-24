/**
 * Approximate bounding box for an SVG path `d` string.
 *
 * This is a lightweight, dependency-free estimate used for model-level bounds
 * (e.g. alignment fallbacks) of imported paths. It samples all absolute/relative
 * command coordinates and control points. It over-estimates curved segments
 * slightly (uses control-point hull) which is acceptable for Phase 0.
 *
 * Accurate on-screen bounds come from the live DOM via getBBox (see domMeasure).
 */
import { emptyBounds, extendBounds, type Bounds } from "./bounds";

const COMMAND_RE = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;

function numbers(s: string): number[] {
  const out: number[] = [];
  const re = /-?\d*\.?\d+(?:[eE][-+]?\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) out.push(parseFloat(m[0]));
  return out;
}

export function approximatePathBounds(d: string): Bounds {
  let bounds = emptyBounds();
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let cmdMatch: RegExpExecArray | null;
  COMMAND_RE.lastIndex = 0;

  while ((cmdMatch = COMMAND_RE.exec(d)) !== null) {
    const cmd = cmdMatch[1];
    const args = numbers(cmdMatch[2]);
    const rel = cmd === cmd.toLowerCase();

    const add = (x: number, y: number) => {
      bounds = extendBounds(bounds, { x, y });
      cx = x;
      cy = y;
    };

    switch (cmd.toUpperCase()) {
      case "M": {
        for (let i = 0; i + 1 < args.length; i += 2) {
          const x = rel ? cx + args[i] : args[i];
          const y = rel ? cy + args[i + 1] : args[i + 1];
          add(x, y);
          if (i === 0) {
            startX = x;
            startY = y;
          }
        }
        break;
      }
      case "L": {
        for (let i = 0; i + 1 < args.length; i += 2) {
          add(rel ? cx + args[i] : args[i], rel ? cy + args[i + 1] : args[i + 1]);
        }
        break;
      }
      case "H": {
        for (const a of args) add(rel ? cx + a : a, cy);
        break;
      }
      case "V": {
        for (const a of args) add(cx, rel ? cy + a : a);
        break;
      }
      case "C": {
        for (let i = 0; i + 5 < args.length; i += 6) {
          const p = (k: number, base: number) => (rel ? base + args[i + k] : args[i + k]);
          bounds = extendBounds(bounds, { x: p(0, cx), y: p(1, cy) });
          bounds = extendBounds(bounds, { x: p(2, cx), y: p(3, cy) });
          add(p(4, cx), p(5, cy));
        }
        break;
      }
      case "S":
      case "Q": {
        for (let i = 0; i + 3 < args.length; i += 4) {
          const p = (k: number, base: number) => (rel ? base + args[i + k] : args[i + k]);
          bounds = extendBounds(bounds, { x: p(0, cx), y: p(1, cy) });
          add(p(2, cx), p(3, cy));
        }
        break;
      }
      case "T": {
        for (let i = 0; i + 1 < args.length; i += 2) {
          add(rel ? cx + args[i] : args[i], rel ? cy + args[i + 1] : args[i + 1]);
        }
        break;
      }
      case "A": {
        for (let i = 0; i + 6 < args.length; i += 7) {
          add(rel ? cx + args[i + 5] : args[i + 5], rel ? cy + args[i + 6] : args[i + 6]);
        }
        break;
      }
      case "Z": {
        cx = startX;
        cy = startY;
        break;
      }
    }
  }
  return bounds;
}
