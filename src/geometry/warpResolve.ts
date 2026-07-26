/**
 * Resolve a node's non-destructive warp into concrete SVG output, shared by the
 * React renderer and the string serializer so on-screen and exported artwork
 * match exactly. Pure — no DOM/React.
 *
 * Shapes and paths warp into a new `d` string (arc + wave). Text uses a native
 * `<textPath>` on a generated arc baseline (arc only) and is handled by the
 * renderer/serializer directly via `textArcPathD`.
 */
import type { SvgNode, WarpSpec } from "@/model/types";
import { nodeToGeometry } from "./pathConvert";
import { parsePath } from "./pathParser";
import { applyWarp } from "./warp";
import { serializePath, geometryBounds } from "./pathData";
import type { PathGeometry } from "./pathTypes";

/** Def id for a text node's `<textPath>` arc baseline. */
export function textWarpArcId(nodeId: string): string {
  return `warp-${nodeId}`;
}

/** True when a text node has an arc warp that rides a `<textPath>`. */
export function hasTextArcWarp(node: SvgNode): boolean {
  return node.type === "text" && node.warp?.type === "arc";
}

/** Node types whose geometry can be warped into a path (`d`). */
export function isGeometryWarpable(node: SvgNode): boolean {
  return (
    node.type === "rect" ||
    node.type === "ellipse" ||
    node.type === "line" ||
    node.type === "polygon" ||
    node.type === "path"
  );
}

/** True when this node currently has an active geometry warp to render as a path. */
export function hasGeometryWarp(node: SvgNode): boolean {
  return Boolean(node.warp) && isGeometryWarpable(node);
}

/** Base geometry for a warpable node, in its local space. */
function baseGeometry(node: SvgNode): PathGeometry | null {
  if (node.type === "path") {
    const res = parsePath(node.d);
    return res.geometry.segments.length ? res.geometry : null;
  }
  return nodeToGeometry(node);
}

/**
 * Warped `d` string for a shape/path node, or null when the node has no warp or
 * cannot be warped.
 */
export function warpedPathD(node: SvgNode, precision = 4): string | null {
  if (!node.warp || !isGeometryWarpable(node)) return null;
  const geometry = baseGeometry(node);
  if (!geometry) return null;
  const warped = applyWarp(geometry, node.warp, geometryBounds(geometry));
  if (warped.segments.length === 0) return null;
  return serializePath(warped, precision);
}

/** Rough glyph advance as a fraction of font size (matches nodeGeometry). */
const TEXT_ADVANCE_FACTOR = 0.6;

/** Approximate rendered width of a text node's string. */
export function estimateTextWidth(node: Extract<SvgNode, { type: "text" }>): number {
  return Math.max(1, node.text.length * node.fontSize * TEXT_ADVANCE_FACTOR);
}

/**
 * The "apex" point where arc-warped text should be centred: the text's actual
 * visual centre, adjusted for its text-anchor, so the curved text sits where the
 * flat text was rather than shifting to the left edge.
 */
export function textArcCenter(node: Extract<SvgNode, { type: "text" }>): { x: number; y: number } {
  const w = estimateTextWidth(node);
  const anchorAdj = node.textAnchor === "start" ? w / 2 : node.textAnchor === "end" ? -w / 2 : 0;
  const arc = node.warp?.type === "arc" ? node.warp : null;
  const horizontal = !arc || arc.direction === "top" || arc.direction === "bottom";
  // Top/bottom curves keep the baseline at node.y; left/right use the visual mid.
  return {
    x: node.x + anchorAdj,
    y: horizontal ? node.y : node.y - node.fontSize * 0.35,
  };
}

/**
 * Baseline `d` for text `<textPath>` warp: a FULL circle of `spec.radius` built
 * from two 180° arcs, positioned so its path-midpoint (50%) is the apex on the
 * chosen side. The renderer/serializer place the text with `text-anchor="middle"`
 * + `startOffset="50%"`, so the text centres on the apex (`apexX`, `apexY`) and
 * wraps both ways along the circle — nothing is ever clipped, half-circle through
 * full-circle wraps work, and small radii are safe (no degenerate single arc).
 * `sweep` per direction keeps glyphs upright on that side.
 */
export function textArcPathD(
  spec: Extract<WarpSpec, { type: "arc" }>,
  apexX: number,
  apexY: number,
  precision = 4,
): string {
  const r = Math.max(1, spec.radius);
  const p = (n: number) => {
    const v = Number(n.toFixed(precision));
    return Object.is(v, -0) ? "0" : String(v);
  };

  // Circle centre relative to the apex, plus the diametrically-opposite start
  // point and the sweep that makes text read correctly on that side.
  let cx: number;
  let cy: number;
  let sweep: 0 | 1;
  switch (spec.direction) {
    case "top": // apex at top, centre below, clockwise
      cx = apexX; cy = apexY + r; sweep = 1; break;
    case "bottom": // apex at bottom, centre above, counter-clockwise
      cx = apexX; cy = apexY - r; sweep = 0; break;
    case "right": // apex at right, centre left, clockwise
      cx = apexX - r; cy = apexY; sweep = 1; break;
    default: // "left": apex at left, centre right, counter-clockwise
      cx = apexX + r; cy = apexY; sweep = 0; break;
  }
  // Start = point opposite the apex through the centre; mid = apex.
  const startX = 2 * cx - apexX;
  const startY = 2 * cy - apexY;
  return (
    `M${p(startX)} ${p(startY)} ` +
    `A${p(r)} ${p(r)} 0 1 ${sweep} ${p(apexX)} ${p(apexY)} ` +
    `A${p(r)} ${p(r)} 0 1 ${sweep} ${p(startX)} ${p(startY)}`
  );
}
