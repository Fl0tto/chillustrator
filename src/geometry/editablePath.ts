/**
 * Editable anchor/handle representation of a path, layered on top of the
 * canonical PathGeometry (M/L/C/Z). This is what the Pen tool builds and the
 * direct-selection (node) editor manipulates; it converts losslessly back into
 * PathGeometry so the result is always a normal, exportable PathNode.
 *
 * An anchor carries an on-curve point plus optional off-curve Bézier handles
 * (absolute coordinates): `handleOut` controls the segment leaving the anchor,
 * `handleIn` controls the segment arriving at it. A straight segment is one with
 * no handles on either side. `cornerRadius` rounds a straight corner at build
 * time, clamped to the adjacent segment lengths.
 *
 * Pure math: no DOM, no React, no model imports. Safe for workers and tests.
 */
import type { Point } from "./matrix";
import type { CubicSegment, PathGeometry, PathSegment } from "./pathTypes";

export type AnchorMode = "corner" | "smooth" | "symmetric";

export interface Anchor {
  x: number;
  y: number;
  /** Control point of the segment ARRIVING at this anchor, or null (straight). */
  handleIn: Point | null;
  /** Control point of the segment LEAVING this anchor, or null (straight). */
  handleOut: Point | null;
  mode: AnchorMode;
  /** Optional rounded-corner setback (root units) for a straight corner. */
  cornerRadius?: number;
}

export interface SubPath {
  anchors: Anchor[];
  closed: boolean;
}

export interface EditablePath {
  subpaths: SubPath[];
}

/** Cubic control-arm ratio approximating a quarter-circle fillet. */
const FILLET_KAPPA = 0.5522847498307936;
const EPS = 1e-6;

export function anchorPoint(a: Anchor): Point {
  return { x: a.x, y: a.y };
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
}

function isNullHandle(a: Anchor, h: Point | null): boolean {
  return h === null || samePoint(h, anchorPoint(a));
}

// ---------------------------------------------------------------------------
// PathGeometry → EditablePath
// ---------------------------------------------------------------------------

export function fromGeometry(geometry: PathGeometry): EditablePath {
  const subpaths: SubPath[] = [];
  let current: SubPath | null = null;

  const finish = () => {
    if (current && current.anchors.length > 0) subpaths.push(current);
    current = null;
  };

  for (const seg of geometry.segments) {
    switch (seg.type) {
      case "M":
        finish();
        current = {
          anchors: [{ x: seg.x, y: seg.y, handleIn: null, handleOut: null, mode: "corner" }],
          closed: false,
        };
        break;
      case "L":
        if (!current) break;
        current.anchors.push({ x: seg.x, y: seg.y, handleIn: null, handleOut: null, mode: "corner" });
        break;
      case "C": {
        if (!current) break;
        const prev = current.anchors[current.anchors.length - 1];
        prev.handleOut = { x: seg.x1, y: seg.y1 };
        current.anchors.push({
          x: seg.x,
          y: seg.y,
          handleIn: { x: seg.x2, y: seg.y2 },
          handleOut: null,
          mode: "corner",
        });
        break;
      }
      case "Z":
        if (current) {
          current.closed = true;
          // A closing curve often ends exactly on the start anchor: fold the
          // duplicate terminal anchor's incoming handle back onto the start.
          const anchors = current.anchors;
          if (anchors.length > 1) {
            const first = anchors[0];
            const last = anchors[anchors.length - 1];
            if (samePoint(anchorPoint(first), anchorPoint(last))) {
              first.handleIn = last.handleIn;
              anchors.pop();
            }
          }
          inferModes(current);
          finish();
        }
        break;
    }
  }
  finish();
  return { subpaths };
}

/** Classify each anchor's mode from its handles (smooth/symmetric/corner). */
function inferModes(sub: SubPath): void {
  for (const a of sub.anchors) {
    if (!a.handleIn || !a.handleOut) {
      a.mode = "corner";
      continue;
    }
    const inV = { x: a.x - a.handleIn.x, y: a.y - a.handleIn.y };
    const outV = { x: a.handleOut.x - a.x, y: a.handleOut.y - a.y };
    const inLen = Math.hypot(inV.x, inV.y);
    const outLen = Math.hypot(outV.x, outV.y);
    if (inLen < EPS || outLen < EPS) {
      a.mode = "corner";
      continue;
    }
    const cross = inV.x * outV.y - inV.y * outV.x;
    const dot = inV.x * outV.x + inV.y * outV.y;
    const collinear = Math.abs(cross) < EPS * (inLen * outLen) && dot > 0;
    if (!collinear) a.mode = "corner";
    else a.mode = Math.abs(inLen - outLen) < 1e-3 ? "symmetric" : "smooth";
  }
}

// ---------------------------------------------------------------------------
// EditablePath → PathGeometry
// ---------------------------------------------------------------------------

/** Clamp a corner radius to no more than half of each adjacent segment length. */
export function clampCornerRadius(prev: Point, corner: Point, next: Point, radius: number): number {
  const lenA = Math.hypot(corner.x - prev.x, corner.y - prev.y);
  const lenB = Math.hypot(next.x - corner.x, next.y - corner.y);
  return Math.max(0, Math.min(radius, lenA / 2, lenB / 2));
}

interface EmitState {
  segments: PathSegment[];
  started: boolean;
}

function emitSegmentTo(state: EmitState, from: Anchor, to: Anchor): void {
  const out = isNullHandle(from, from.handleOut) ? null : from.handleOut;
  const inn = isNullHandle(to, to.handleIn) ? null : to.handleIn;
  if (!out && !inn) {
    state.segments.push({ type: "L", x: to.x, y: to.y });
  } else {
    state.segments.push({
      type: "C",
      x1: out ? out.x : from.x,
      y1: out ? out.y : from.y,
      x2: inn ? inn.x : to.x,
      y2: inn ? inn.y : to.y,
      x: to.x,
      y: to.y,
    });
  }
}

/**
 * Round a straight corner anchor: returns the entry/exit tangent points plus the
 * cubic that connects them, or null when the anchor is not a roundable corner.
 */
function filletFor(
  prev: Anchor,
  corner: Anchor,
  next: Anchor,
): { p1: Point; cubic: CubicSegment } | null {
  const r = corner.cornerRadius ?? 0;
  if (r <= 0) return null;
  // Only round true straight corners (no handles on either adjacent segment).
  if (
    !isNullHandle(prev, prev.handleOut) ||
    !isNullHandle(corner, corner.handleIn) ||
    !isNullHandle(corner, corner.handleOut) ||
    !isNullHandle(next, next.handleIn)
  ) {
    return null;
  }
  const P = anchorPoint(corner);
  const A = anchorPoint(prev);
  const B = anchorPoint(next);
  const t = clampCornerRadius(A, P, B, r);
  if (t < EPS) return null;
  const uA = norm({ x: A.x - P.x, y: A.y - P.y });
  const uB = norm({ x: B.x - P.x, y: B.y - P.y });
  if (!uA || !uB) return null;
  const p1 = { x: P.x + uA.x * t, y: P.y + uA.y * t };
  const p2 = { x: P.x + uB.x * t, y: P.y + uB.y * t };
  const c1 = { x: p1.x + (P.x - p1.x) * FILLET_KAPPA, y: p1.y + (P.y - p1.y) * FILLET_KAPPA };
  const c2 = { x: p2.x + (P.x - p2.x) * FILLET_KAPPA, y: p2.y + (P.y - p2.y) * FILLET_KAPPA };
  return { p1, cubic: { type: "C", x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: p2.x, y: p2.y } };
}

/**
 * True when the anchor at `index` can carry a rounded corner — both adjacent
 * segments must exist and be straight. Mirrors `filletFor`'s preconditions, and
 * is what the Corner tool / overlay use to decide what is targetable.
 */
export function isRoundableCorner(sub: SubPath, index: number): boolean {
  const n = sub.anchors.length;
  if (n < 3) return false;
  const a = sub.anchors[index];
  if (!a) return false;
  // An open subpath's endpoints have only one adjacent segment.
  if (!sub.closed && (index === 0 || index === n - 1)) return false;
  const prev = sub.anchors[(index - 1 + n) % n];
  const next = sub.anchors[(index + 1) % n];
  return (
    isNullHandle(a, a.handleIn) &&
    isNullHandle(a, a.handleOut) &&
    isNullHandle(prev, prev.handleOut) &&
    isNullHandle(next, next.handleIn)
  );
}

function norm(v: Point): Point | null {
  const len = Math.hypot(v.x, v.y);
  if (len < EPS) return null;
  return { x: v.x / len, y: v.y / len };
}

export function toGeometry(path: EditablePath): PathGeometry {
  const segments: PathSegment[] = [];
  for (const sub of path.subpaths) {
    const n = sub.anchors.length;
    if (n === 0) continue;
    const state: EmitState = { segments, started: false };

    if (n === 1) {
      segments.push({ type: "M", x: sub.anchors[0].x, y: sub.anchors[0].y });
      continue;
    }

    // Precompute a fillet per anchor. Only interior corners can round (for a
    // closed subpath every anchor is interior); `null` = draw straight through.
    // filletFor also guarantees both segments adjacent to a fillet are straight,
    // so a filleted corner is always entered and left by a plain line.
    const fillets = sub.anchors.map((a, i) => {
      const interior = sub.closed || (i > 0 && i < n - 1);
      if (!interior) return null;
      return filletFor(sub.anchors[(i - 1 + n) % n], a, sub.anchors[(i + 1) % n]);
    });

    // A filleted start anchor is *re-entered* by the closing segment, so the
    // subpath must begin where its arc EXITS; the arc itself is emitted last.
    const startFillet = fillets[0];
    const start = startFillet
      ? { x: startFillet.cubic.x, y: startFillet.cubic.y }
      : anchorPoint(sub.anchors[0]);
    segments.push({ type: "M", x: start.x, y: start.y });

    const steps = sub.closed ? n : n - 1;
    for (let i = 1; i <= steps; i++) {
      const from = sub.anchors[i - 1];
      const toIndex = i % n;
      const to = sub.anchors[toIndex];
      const fillet = fillets[toIndex];
      if (fillet) {
        // Straight run into the entry tangent point, then the rounding arc.
        segments.push({ type: "L", x: fillet.p1.x, y: fillet.p1.y });
        segments.push(fillet.cubic);
      } else if (i === steps && sub.closed) {
        // A plain straight close needs no explicit segment — Z draws it.
        const straightClose = isNullHandle(from, from.handleOut) && isNullHandle(to, to.handleIn);
        if (!straightClose) emitSegmentTo(state, from, to);
      } else {
        emitSegmentTo(state, from, to);
      }
    }
    if (sub.closed) segments.push({ type: "Z" });
  }
  return { segments };
}

// ---------------------------------------------------------------------------
// Anchor editing helpers
// ---------------------------------------------------------------------------

/** Move an anchor's on-curve point, dragging its handles by the same delta. */
export function moveAnchor(a: Anchor, x: number, y: number): Anchor {
  const dx = x - a.x;
  const dy = y - a.y;
  return {
    ...a,
    x,
    y,
    handleIn: a.handleIn ? { x: a.handleIn.x + dx, y: a.handleIn.y + dy } : null,
    handleOut: a.handleOut ? { x: a.handleOut.x + dx, y: a.handleOut.y + dy } : null,
  };
}

/**
 * Drag one Bézier handle. For smooth/symmetric anchors the opposite handle is
 * kept collinear (symmetric also mirrors its length).
 */
export function dragHandle(a: Anchor, which: "in" | "out", x: number, y: number): Anchor {
  const next: Anchor = { ...a };
  const moved = { x, y };
  if (which === "in") next.handleIn = moved;
  else next.handleOut = moved;

  if (a.mode === "corner") return next;
  const opp = which === "in" ? "out" : "in";
  const oppHandle = opp === "in" ? next.handleIn : next.handleOut;
  const dir = { x: a.x - moved.x, y: a.y - moved.y }; // points from moved handle through the anchor
  const dirLen = Math.hypot(dir.x, dir.y);
  if (dirLen < EPS) return next;
  const u = { x: dir.x / dirLen, y: dir.y / dirLen };
  let oppLen = dirLen;
  if (a.mode === "smooth" && oppHandle) {
    oppLen = Math.hypot(oppHandle.x - a.x, oppHandle.y - a.y) || dirLen;
  }
  const mirrored = { x: a.x + u.x * oppLen, y: a.y + u.y * oppLen };
  if (opp === "in") next.handleIn = mirrored;
  else next.handleOut = mirrored;
  return next;
}

/** Change an anchor's continuity mode, adjusting handles to satisfy it. */
export function setAnchorMode(a: Anchor, mode: AnchorMode, neighborPrev?: Point, neighborNext?: Point): Anchor {
  const next: Anchor = { ...a, mode };
  if (mode === "corner") return next;

  // Ensure both handles exist so smooth/symmetric is meaningful.
  const base = 1 / 3;
  let hIn = a.handleIn;
  let hOut = a.handleOut;
  if (!hIn && neighborPrev) hIn = { x: a.x + (neighborPrev.x - a.x) * base, y: a.y + (neighborPrev.y - a.y) * base };
  if (!hOut && neighborNext) hOut = { x: a.x + (neighborNext.x - a.x) * base, y: a.y + (neighborNext.y - a.y) * base };
  if (!hIn && hOut) hIn = { x: 2 * a.x - hOut.x, y: 2 * a.y - hOut.y };
  if (!hOut && hIn) hOut = { x: 2 * a.x - hIn.x, y: 2 * a.y - hIn.y };
  if (!hIn || !hOut) return next;

  // Average the two handle directions to a common tangent.
  const dIn = { x: a.x - hIn.x, y: a.y - hIn.y };
  const dOut = { x: hOut.x - a.x, y: hOut.y - a.y };
  const inLen = Math.hypot(dIn.x, dIn.y);
  const outLen = Math.hypot(dOut.x, dOut.y);
  const tangent = norm({ x: dIn.x + dOut.x, y: dIn.y + dOut.y }) ?? norm(dOut) ?? { x: 1, y: 0 };
  if (mode === "symmetric") {
    const len = (inLen + outLen) / 2;
    next.handleIn = { x: a.x - tangent.x * len, y: a.y - tangent.y * len };
    next.handleOut = { x: a.x + tangent.x * len, y: a.y + tangent.y * len };
  } else {
    next.handleIn = { x: a.x - tangent.x * inLen, y: a.y - tangent.y * inLen };
    next.handleOut = { x: a.x + tangent.x * outLen, y: a.y + tangent.y * outLen };
  }
  return next;
}

/** Convert the segment between anchors i-1 and i to a straight line. */
export function makeSegmentStraight(sub: SubPath, index: number): void {
  const a = sub.anchors[index - 1];
  const b = sub.anchors[index];
  if (a) a.handleOut = null;
  if (b) b.handleIn = null;
}

/**
 * Convert the segment between anchors i-1 and i to a curve, seeding gentle
 * handles at 1/3 and 2/3 along the straight chord.
 */
export function makeSegmentCurved(sub: SubPath, index: number): void {
  const a = sub.anchors[index - 1];
  const b = sub.anchors[index];
  if (!a || !b) return;
  a.handleOut = { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 };
  b.handleIn = { x: b.x + (a.x - b.x) / 3, y: b.y + (a.y - b.y) / 3 };
}

/** Total number of anchors across all subpaths. */
export function anchorCount(path: EditablePath): number {
  return path.subpaths.reduce((n, s) => n + s.anchors.length, 0);
}

/** Locate a flat anchor index → { sub, anchor } coordinates. */
export function locateAnchor(path: EditablePath, flatIndex: number): { sub: number; anchor: number } | null {
  let remaining = flatIndex;
  for (let s = 0; s < path.subpaths.length; s++) {
    const len = path.subpaths[s].anchors.length;
    if (remaining < len) return { sub: s, anchor: remaining };
    remaining -= len;
  }
  return null;
}

/** Every anchor with its flat index and world point (for overlay + hit-testing). */
export function flatAnchors(path: EditablePath): Array<{ index: number; sub: number; anchor: number; a: Anchor }> {
  const out: Array<{ index: number; sub: number; anchor: number; a: Anchor }> = [];
  let index = 0;
  for (let s = 0; s < path.subpaths.length; s++) {
    const anchors = path.subpaths[s].anchors;
    for (let i = 0; i < anchors.length; i++) {
      out.push({ index, sub: s, anchor: i, a: anchors[i] });
      index++;
    }
  }
  return out;
}

export function clonePath(path: EditablePath): EditablePath {
  return {
    subpaths: path.subpaths.map((s) => ({
      closed: s.closed,
      anchors: s.anchors.map((a) => ({
        ...a,
        handleIn: a.handleIn ? { ...a.handleIn } : null,
        handleOut: a.handleOut ? { ...a.handleOut } : null,
      })),
    })),
  };
}
