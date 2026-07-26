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

/**
 * Baseline arc `d` for text `<textPath>` warp. The text rides the top of a circle
 * of the given radius; `direction` chooses which side of the circle and the sweep
 * so the text reads correctly. Centered on (cx, cy) — the text node's local origin.
 */
export function textArcPathD(
  spec: Extract<WarpSpec, { type: "arc" }>,
  cx: number,
  cy: number,
  width: number,
  precision = 4,
): string {
  const radius = Math.max(1, spec.radius);
  // Arc length ≈ text width → half-angle so the text spans the centred arc.
  const half = Math.min(Math.PI * 0.98, width / (2 * radius));
  const p = (n: number) => {
    const v = Number(n.toFixed(precision));
    return Object.is(v, -0) ? "0" : String(v);
  };

  // Build an arc centred so its midpoint sits at (cx, cy), curving per direction.
  // `sweep` flips for bottom/left so glyphs sit upright on that side.
  const horizontal = spec.direction === "top" || spec.direction === "bottom";
  const sweepUp = spec.direction === "top" || spec.direction === "right";

  let start: { x: number; y: number };
  let end: { x: number; y: number };
  if (horizontal) {
    const cyc = sweepUp ? cy + radius : cy - radius; // circle centre
    const sign = sweepUp ? -1 : 1;
    start = { x: cx - radius * Math.sin(half), y: cyc + sign * radius * Math.cos(half) };
    end = { x: cx + radius * Math.sin(half), y: cyc + sign * radius * Math.cos(half) };
  } else {
    const cxc = sweepUp ? cx - radius : cx + radius;
    const sign = sweepUp ? 1 : -1;
    start = { x: cxc + sign * radius * Math.cos(half), y: cy - radius * Math.sin(half) };
    end = { x: cxc + sign * radius * Math.cos(half), y: cy + radius * Math.sin(half) };
  }
  const largeArc = 0;
  const sweepFlag = sweepUp ? 1 : 0;
  return `M${p(start.x)} ${p(start.y)} A${p(radius)} ${p(radius)} 0 ${largeArc} ${sweepFlag} ${p(end.x)} ${p(end.y)}`;
}
