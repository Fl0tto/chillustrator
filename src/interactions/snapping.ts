/**
 * Smart alignment (snapping) engine — PURE geometry, no store/DOM/React.
 *
 * Produces alignment candidates from the scene (artboard + other visible,
 * unlocked, non-selected objects near the viewport) and snaps a moving /
 * resizing selection or a placed anchor onto them. Snapping decisions use
 * SCREEN-space thresholds (converted to root units by the caller ÷ zoom) so the
 * feel is constant at every zoom, with hysteresis to stop flicker and a
 * movement-direction bias so the preferred candidate matches the drag.
 *
 * The engine also emits `SnapGuide`s (dotted line + label) for the overlay; the
 * overlay is separate from artwork so guides never reach exported SVG.
 *
 * OWNED BY: Agent D (interactions).
 */
import type { SvgDocumentModel } from "@/model/types";
import type { Bounds } from "@/geometry/bounds";
import type { Point } from "@/geometry/matrix";
import { selectionWorldBounds, worldMatrix } from "@/geometry/nodeGeometry";
import { isEmptyBounds, boundsIntersect } from "@/geometry/bounds";
import { isEffectivelyVisible, isEffectivelyLocked } from "@/model/tree";
import { parsePath } from "@/geometry/pathParser";
import { applyToPoint } from "@/geometry/matrix";

export type Axis = "x" | "y";

/** What a candidate line represents on its owning object (for labels). */
export type SnapRole =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "center"
  | "q25"
  | "q75"
  | "corner"
  | "anchor";

export interface SnapLine {
  axis: Axis;
  value: number;
  role: SnapRole;
  /** Perpendicular extent of the owning object (for drawing the guide). */
  span: [number, number];
  /** Optional marker point (corner/anchor) in root coords. */
  point?: Point;
}

export interface SnapCandidates {
  x: SnapLine[];
  y: SnapLine[];
}

/** A rendered alignment guide (root coordinates). */
export interface SnapGuide {
  axis: Axis;
  value: number;
  from: number;
  to: number;
  label: string;
  points?: Point[];
}

/** The moving selection's own snap positions on one axis. */
export interface MovingEdge {
  value: number;
  role: SnapRole;
}

const MAX_ANCHOR_CANDIDATES = 400;

// ---------------------------------------------------------------------------
// Candidate collection
// ---------------------------------------------------------------------------

function pathAnchorsWorld(doc: SvgDocumentModel, id: string): Point[] {
  const node = doc.nodes[id];
  if (!node || node.type !== "path") return [];
  const { geometry } = parsePath(node.d);
  const m = worldMatrix(doc, id);
  const pts: Point[] = [];
  for (const seg of geometry.segments) {
    if (seg.type === "M" || seg.type === "L") pts.push(applyToPoint(m, { x: seg.x, y: seg.y }));
    else if (seg.type === "C") pts.push(applyToPoint(m, { x: seg.x, y: seg.y }));
    if (pts.length >= MAX_ANCHOR_CANDIDATES) break;
  }
  return pts;
}

function pushBoxLines(x: SnapLine[], y: SnapLine[], b: Bounds): void {
  const spanX: [number, number] = [b.minX, b.maxX];
  const spanY: [number, number] = [b.minY, b.maxY];
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const q1x = b.minX + (b.maxX - b.minX) * 0.25;
  const q3x = b.minX + (b.maxX - b.minX) * 0.75;
  const q1y = b.minY + (b.maxY - b.minY) * 0.25;
  const q3y = b.minY + (b.maxY - b.minY) * 0.75;
  x.push(
    { axis: "x", value: b.minX, role: "left", span: spanY },
    { axis: "x", value: cx, role: "center", span: spanY },
    { axis: "x", value: b.maxX, role: "right", span: spanY },
    { axis: "x", value: q1x, role: "q25", span: spanY },
    { axis: "x", value: q3x, role: "q75", span: spanY },
  );
  y.push(
    { axis: "y", value: b.minY, role: "top", span: spanX },
    { axis: "y", value: cy, role: "center", span: spanX },
    { axis: "y", value: b.maxY, role: "bottom", span: spanX },
    { axis: "y", value: q1y, role: "q25", span: spanX },
    { axis: "y", value: q3y, role: "q75", span: spanX },
  );
  // Corners as point markers on both axes.
  for (const [px, py] of [
    [b.minX, b.minY],
    [b.maxX, b.minY],
    [b.maxX, b.maxY],
    [b.minX, b.maxY],
  ] as const) {
    x.push({ axis: "x", value: px, role: "corner", span: spanY, point: { x: px, y: py } });
    y.push({ axis: "y", value: py, role: "corner", span: spanX, point: { x: px, y: py } });
  }
}

export interface CollectOptions {
  /** Only include objects intersecting this root-space viewport rect. */
  viewport?: Bounds;
  /** Include path anchor points as candidates. Default true. */
  includeAnchors?: boolean;
}

/**
 * Collect snap candidates: artboard edges/center/quarters plus every visible,
 * unlocked, non-excluded top-level object's edges/center/quarters/corners and
 * (optionally) path anchors, filtered to the viewport.
 */
export function collectSnapCandidates(
  doc: SvgDocumentModel,
  excludeIds: Iterable<string>,
  options: CollectOptions = {},
): SnapCandidates {
  const exclude = new Set(excludeIds);
  const x: SnapLine[] = [];
  const y: SnapLine[] = [];

  // Artboard.
  pushBoxLines(x, y, { minX: 0, minY: 0, maxX: doc.width, maxY: doc.height });

  const includeAnchors = options.includeAnchors ?? true;
  for (const id of doc.rootNodeIds) {
    if (exclude.has(id) || !isEffectivelyVisible(doc, id) || isEffectivelyLocked(doc, id)) continue;
    const b = selectionWorldBounds(doc, [id]);
    if (isEmptyBounds(b)) continue;
    if (options.viewport && !boundsIntersect(options.viewport, b)) continue;
    pushBoxLines(x, y, b);
    if (includeAnchors) {
      const anchors = pathAnchorsWorld(doc, id);
      for (const p of anchors) {
        x.push({ axis: "x", value: p.x, role: "anchor", span: [b.minY, b.maxY], point: p });
        y.push({ axis: "y", value: p.y, role: "anchor", span: [b.minX, b.maxX], point: p });
      }
    }
  }
  return { x, y };
}

// ---------------------------------------------------------------------------
// Snapping with direction bias + hysteresis
// ---------------------------------------------------------------------------

export interface AxisSnapState {
  /** The candidate value currently locked on this axis, or null. */
  value: number | null;
  role: SnapRole | null;
  movingRole: SnapRole | null;
}

export interface SnapState {
  x: AxisSnapState;
  y: AxisSnapState;
}

export function emptySnapState(): SnapState {
  return {
    x: { value: null, role: null, movingRole: null },
    y: { value: null, role: null, movingRole: null },
  };
}

/** Hysteresis: keep an existing lock until the pointer is this ×threshold away. */
const RELEASE_FACTOR = 1.8;
/**
 * Direction bias (×threshold): a gentle tiebreaker so equidistant candidates
 * resolve toward the drag direction, WITHOUT overriding a clearly closer one.
 */
const DIRECTION_BONUS = 0.08;

interface AxisSnapResult {
  offset: number;
  line: SnapLine | null;
  movingRole: SnapRole | null;
}

/**
 * Best snap on one axis. `dir` is the raw movement sign on this axis (used to
 * bias ranking). `prev` carries the previous frame's lock for hysteresis.
 */
export function snapAxis(
  moving: MovingEdge[],
  candidates: SnapLine[],
  threshold: number,
  dir: number,
  prev: AxisSnapState,
): AxisSnapResult {
  if (threshold <= 0) return { offset: 0, line: null, movingRole: null };

  // Schmitt-trigger hysteresis: while a lock is held, keep it until the pointer
  // leaves the WIDER release band — no flicker between nearby candidates.
  if (prev.value !== null && prev.movingRole !== null) {
    let keep: { offset: number; line: SnapLine; movingRole: SnapRole; dist: number } | null = null;
    for (const cand of candidates) {
      if (Math.abs(cand.value - prev.value) > 1e-6) continue;
      for (const edge of moving) {
        if (edge.role !== prev.movingRole) continue;
        const delta = cand.value - edge.value;
        const dist = Math.abs(delta);
        if (dist <= threshold * RELEASE_FACTOR && (!keep || dist < keep.dist)) {
          keep = { offset: delta, line: cand, movingRole: edge.role, dist };
        }
      }
    }
    if (keep) return { offset: keep.offset, line: keep.line, movingRole: keep.movingRole };
    // Lock broken → fall through and acquire afresh.
  }

  // Fresh acquire: best candidate within the (narrower) acquire band, with a
  // movement-direction bias toward the leading edge.
  let best: { score: number; offset: number; line: SnapLine; movingRole: SnapRole } | null = null;
  for (const cand of candidates) {
    for (const edge of moving) {
      const delta = cand.value - edge.value;
      const dist = Math.abs(delta);
      if (dist > threshold) continue;
      let score = dist;
      if (dir > 0 && (edge.role === "right" || edge.role === "q75")) score -= threshold * DIRECTION_BONUS;
      if (dir < 0 && (edge.role === "left" || edge.role === "q25")) score -= threshold * DIRECTION_BONUS;
      if (dir > 0 && (edge.role === "left" || edge.role === "q25")) score += threshold * DIRECTION_BONUS;
      if (dir < 0 && (edge.role === "right" || edge.role === "q75")) score += threshold * DIRECTION_BONUS;
      if (!best || score < best.score) {
        best = { score, offset: delta, line: cand, movingRole: edge.role };
      }
    }
  }
  if (!best) return { offset: 0, line: null, movingRole: null };
  return { offset: best.offset, line: best.line, movingRole: best.movingRole };
}

// ---------------------------------------------------------------------------
// Move snapping (public)
// ---------------------------------------------------------------------------

const ROLE_LABEL: Record<SnapRole, string> = {
  left: "Left edge",
  right: "Right edge",
  top: "Top edge",
  bottom: "Bottom edge",
  center: "Center",
  q25: "25%",
  q75: "75%",
  corner: "Corner",
  anchor: "Anchor",
};

function guideLabel(movingRole: SnapRole, targetRole: SnapRole): string {
  if (movingRole === "anchor" || targetRole === "anchor") return "Anchor ↔ Anchor";
  if (movingRole === "center" && targetRole === "center") return "Center ↔ Center";
  if (
    (movingRole === "q25" || movingRole === "q75") &&
    (targetRole === "q25" || targetRole === "q75")
  ) {
    return `${ROLE_LABEL[movingRole]} ↔ ${ROLE_LABEL[targetRole]}`;
  }
  return `${ROLE_LABEL[movingRole]} ↔ ${ROLE_LABEL[targetRole]}`;
}

function movingEdgesX(b: Bounds): MovingEdge[] {
  const cx = (b.minX + b.maxX) / 2;
  return [
    { value: b.minX, role: "left" },
    { value: cx, role: "center" },
    { value: b.maxX, role: "right" },
    { value: b.minX + (b.maxX - b.minX) * 0.25, role: "q25" },
    { value: b.minX + (b.maxX - b.minX) * 0.75, role: "q75" },
  ];
}
function movingEdgesY(b: Bounds): MovingEdge[] {
  const cy = (b.minY + b.maxY) / 2;
  return [
    { value: b.minY, role: "top" },
    { value: cy, role: "center" },
    { value: b.maxY, role: "bottom" },
    { value: b.minY + (b.maxY - b.minY) * 0.25, role: "q25" },
    { value: b.minY + (b.maxY - b.minY) * 0.75, role: "q75" },
  ];
}

export interface MoveSnapResult {
  dx: number;
  dy: number;
  guides: SnapGuide[];
  state: SnapState;
}

/**
 * Snap a raw (dx, dy) move of `startBounds`. `threshold` is in root units.
 * `rawDx/rawDy` are the un-snapped deltas (for the direction bias). `prev` is the
 * previous frame's SnapState (hysteresis); pass `emptySnapState()` at gesture start.
 */
export function snapMove(
  startBounds: Bounds,
  dx: number,
  dy: number,
  candidates: SnapCandidates,
  threshold: number,
  prev: SnapState = emptySnapState(),
): MoveSnapResult {
  if (isEmptyBounds(startBounds)) {
    return { dx, dy, guides: [], state: emptySnapState() };
  }
  const movedX = translateBounds(startBounds, dx, 0);
  const movedY = translateBounds(startBounds, 0, dy);

  const rx = snapAxis(movingEdgesX(movedX), candidates.x, threshold, Math.sign(dx), prev.x);
  const ry = snapAxis(movingEdgesY(movedY), candidates.y, threshold, Math.sign(dy), prev.y);

  const outDx = dx + rx.offset;
  const outDy = dy + ry.offset;
  const finalBounds = translateBounds(startBounds, outDx, outDy);

  const guides: SnapGuide[] = [];
  const state = emptySnapState();
  if (rx.line && rx.movingRole) {
    state.x = { value: rx.line.value, role: rx.line.role, movingRole: rx.movingRole };
    guides.push(makeGuide("x", rx.line, finalBounds, rx.movingRole));
  }
  if (ry.line && ry.movingRole) {
    state.y = { value: ry.line.value, role: ry.line.role, movingRole: ry.movingRole };
    guides.push(makeGuide("y", ry.line, finalBounds, ry.movingRole));
  }
  return { dx: outDx, dy: outDy, guides, state };
}

function makeGuide(axis: Axis, line: SnapLine, movingBounds: Bounds, movingRole: SnapRole): SnapGuide {
  const perpLo = axis === "x" ? Math.min(line.span[0], movingBounds.minY) : Math.min(line.span[0], movingBounds.minX);
  const perpHi = axis === "x" ? Math.max(line.span[1], movingBounds.maxY) : Math.max(line.span[1], movingBounds.maxX);
  const guide: SnapGuide = {
    axis,
    value: line.value,
    from: perpLo,
    to: perpHi,
    label: guideLabel(movingRole, line.role),
  };
  if (line.point) guide.points = [line.point];
  return guide;
}

function translateBounds(b: Bounds, dx: number, dy: number): Bounds {
  return { minX: b.minX + dx, minY: b.minY + dy, maxX: b.maxX + dx, maxY: b.maxY + dy };
}

// ---------------------------------------------------------------------------
// Point (anchor) snapping — for the Pen tool and node editor
// ---------------------------------------------------------------------------

export interface PointSnapResult {
  x: number;
  y: number;
  guides: SnapGuide[];
}

/** Snap a single placed/moved point onto candidate lines (both axes independent). */
export function snapPoint(
  p: Point,
  candidates: SnapCandidates,
  threshold: number,
): PointSnapResult {
  const moveX = [{ value: p.x, role: "center" as SnapRole }];
  const moveY = [{ value: p.y, role: "center" as SnapRole }];
  const rx = snapAxis(moveX, candidates.x, threshold, 0, { value: null, role: null, movingRole: null });
  const ry = snapAxis(moveY, candidates.y, threshold, 0, { value: null, role: null, movingRole: null });
  const outX = p.x + rx.offset;
  const outY = p.y + ry.offset;
  const guides: SnapGuide[] = [];
  const final = { minX: outX, minY: outY, maxX: outX, maxY: outY };
  if (rx.line) guides.push(makeGuide("x", rx.line, final, "anchor"));
  if (ry.line) guides.push(makeGuide("y", ry.line, final, "anchor"));
  return { x: outX, y: outY, guides };
}

// ---------------------------------------------------------------------------
// Rotation snapping — nearby / parallel / perpendicular angles
// ---------------------------------------------------------------------------

/** Normalize degrees into [0, 360). */
function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export interface RotationSnapResult {
  deg: number;
  guide: string | null;
}

/**
 * Collect candidate rotation angles (degrees) from nearby objects' current
 * rotations, plus their parallels (+180) and perpendiculars (+90/+270).
 */
export function collectRotationAngles(doc: SvgDocumentModel, excludeIds: Iterable<string>): number[] {
  const exclude = new Set(excludeIds);
  const set = new Set<number>();
  // Absolute reference angles.
  for (const base of [0, 45, 90, 135]) set.add(base);
  for (const id of doc.rootNodeIds) {
    if (exclude.has(id) || !isEffectivelyVisible(doc, id)) continue;
    const node = doc.nodes[id];
    if (!node) continue;
    const m = node.transform;
    const angle = norm360((Math.atan2(m.b, m.a) * 180) / Math.PI);
    for (const off of [0, 90, 180, 270]) set.add(norm360(angle + off));
  }
  return [...set];
}

/**
 * Snap an absolute rotation (degrees) to the nearest candidate angle within
 * `thresholdDeg`. Returns a guide label ("Parallel", "90°", or the angle).
 */
export function snapRotation(
  absoluteDeg: number,
  candidates: number[],
  thresholdDeg: number,
): RotationSnapResult {
  const target = norm360(absoluteDeg);
  let best: { deg: number; diff: number } | null = null;
  for (const c of candidates) {
    const cc = norm360(c);
    let diff = Math.abs(target - cc);
    if (diff > 180) diff = 360 - diff;
    if (diff <= thresholdDeg && (!best || diff < best.diff)) best = { deg: cc, diff };
  }
  if (!best) return { deg: absoluteDeg, guide: null };
  // Preserve winding: snap to the nearest equivalent of best.deg to absoluteDeg.
  const snapped = absoluteDeg + shortestDelta(target, best.deg);
  let label: string;
  const b = best.deg % 90;
  if (Math.abs(b) < 1e-6) label = best.deg % 180 === 0 ? "Parallel" : "90°";
  else label = `${Math.round(best.deg)}°`;
  return { deg: snapped, guide: label };
}

function shortestDelta(from: number, to: number): number {
  let d = to - from;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}
