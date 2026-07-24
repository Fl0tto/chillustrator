/**
 * Convert primitive shape nodes to canonical PathGeometry (spec CVP-001..003).
 *
 * Works in each node's LOCAL coordinate space; the caller keeps the node's
 * existing `transform`, so conversion is visually identity. Rounded rectangles,
 * circles, and ellipses become curved cubic segments (never polygon
 * approximations). Pure math (no DOM/React).
 */
import type {
  EllipseNode,
  LineNode,
  PolygonNode,
  RectNode,
  SvgNode,
} from "@/model/types";
import type { PathGeometry, PathSegment } from "./pathTypes";

/** Cubic control-arm length for a quarter-circle/ellipse arc. */
const KAPPA = 0.5522847498307936;

export function rectToGeometry(node: RectNode): PathGeometry {
  const { x, y, width, height } = node;
  const w = Math.abs(width);
  const h = Math.abs(height);
  let rx = Math.min(Math.max(node.rx, 0), w / 2);
  let ry = Math.min(Math.max(node.ry || node.rx, 0), h / 2);
  if (rx === 0 || ry === 0) {
    rx = 0;
    ry = 0;
  }
  const x0 = x;
  const y0 = y;
  const x1 = x + w;
  const y1 = y + h;

  if (rx === 0 && ry === 0) {
    return {
      segments: [
        { type: "M", x: x0, y: y0 },
        { type: "L", x: x1, y: y0 },
        { type: "L", x: x1, y: y1 },
        { type: "L", x: x0, y: y1 },
        { type: "Z" },
      ],
    };
  }

  const cx = rx * KAPPA;
  const cy = ry * KAPPA;
  const segments: PathSegment[] = [
    { type: "M", x: x0 + rx, y: y0 },
    { type: "L", x: x1 - rx, y: y0 },
    { type: "C", x1: x1 - rx + cx, y1: y0, x2: x1, y2: y0 + ry - cy, x: x1, y: y0 + ry },
    { type: "L", x: x1, y: y1 - ry },
    { type: "C", x1: x1, y1: y1 - ry + cy, x2: x1 - rx + cx, y2: y1, x: x1 - rx, y: y1 },
    { type: "L", x: x0 + rx, y: y1 },
    { type: "C", x1: x0 + rx - cx, y1: y1, x2: x0, y2: y1 - ry + cy, x: x0, y: y1 - ry },
    { type: "L", x: x0, y: y0 + ry },
    { type: "C", x1: x0, y1: y0 + ry - cy, x2: x0 + rx - cx, y2: y0, x: x0 + rx, y: y0 },
    { type: "Z" },
  ];
  return { segments };
}

export function ellipseToGeometry(node: EllipseNode): PathGeometry {
  const { cx, cy, rx, ry } = node;
  const ox = rx * KAPPA;
  const oy = ry * KAPPA;
  const segments: PathSegment[] = [
    { type: "M", x: cx + rx, y: cy },
    { type: "C", x1: cx + rx, y1: cy + oy, x2: cx + ox, y2: cy + ry, x: cx, y: cy + ry },
    { type: "C", x1: cx - ox, y1: cy + ry, x2: cx - rx, y2: cy + oy, x: cx - rx, y: cy },
    { type: "C", x1: cx - rx, y1: cy - oy, x2: cx - ox, y2: cy - ry, x: cx, y: cy - ry },
    { type: "C", x1: cx + ox, y1: cy - ry, x2: cx + rx, y2: cy - oy, x: cx + rx, y: cy },
    { type: "Z" },
  ];
  return { segments };
}

export function lineToGeometry(node: LineNode): PathGeometry {
  return {
    segments: [
      { type: "M", x: node.x1, y: node.y1 },
      { type: "L", x: node.x2, y: node.y2 },
    ],
  };
}

export function polygonToGeometry(node: PolygonNode): PathGeometry {
  if (node.points.length === 0) return { segments: [] };
  const segments: PathSegment[] = [{ type: "M", x: node.points[0].x, y: node.points[0].y }];
  for (let i = 1; i < node.points.length; i++) {
    segments.push({ type: "L", x: node.points[i].x, y: node.points[i].y });
  }
  if (node.closed) segments.push({ type: "Z" });
  return { segments };
}

/** True if this node type can be converted to a path (CVP-001). */
export function isConvertibleToPath(node: SvgNode): boolean {
  return (
    node.type === "rect" ||
    node.type === "ellipse" ||
    node.type === "line" ||
    node.type === "polygon" ||
    node.type === "path"
  );
}

/**
 * Convert a supported primitive to PathGeometry in its local space, or null when
 * the node is not a convertible primitive.
 */
export function nodeToGeometry(node: SvgNode): PathGeometry | null {
  switch (node.type) {
    case "rect":
      return rectToGeometry(node);
    case "ellipse":
      return ellipseToGeometry(node);
    case "line":
      return lineToGeometry(node);
    case "polygon":
      return polygonToGeometry(node);
    default:
      return null;
  }
}
