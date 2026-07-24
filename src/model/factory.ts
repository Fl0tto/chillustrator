/**
 * Factory helpers to create well-formed nodes with sensible defaults.
 * Framework-independent.
 */
import { identityMatrix } from "@/geometry/matrix";
import { createNodeId } from "./ids";
import type {
  EllipseNode,
  GroupNode,
  LineNode,
  Matrix2D,
  NodeStyle,
  PaintReference,
  PathNode,
  PolygonNode,
  RectNode,
  TextNode,
} from "./types";

export function solidPaint(color: string, opacity = 1): PaintReference {
  return { kind: "solid", value: color, opacity };
}

export function defaultStyle(overrides: Partial<NodeStyle> = {}): NodeStyle {
  return {
    fill: solidPaint("#4c8bf5", 1),
    stroke: null,
    strokeWidth: 1,
    strokeLinecap: "butt",
    strokeLinejoin: "miter",
    strokeMiterlimit: 4,
    strokeDasharray: [],
    strokeDashoffset: 0,
    fillRule: "nonzero",
    ...overrides,
  };
}

interface BaseInit {
  id?: string;
  name?: string;
  transform?: Matrix2D;
  style?: Partial<NodeStyle>;
  opacity?: number;
}

function base(init: BaseInit, fallbackName: string) {
  return {
    id: init.id ?? createNodeId(),
    name: init.name ?? fallbackName,
    visible: true,
    locked: false,
    opacity: init.opacity ?? 1,
    transform: init.transform ?? identityMatrix(),
    parentId: null,
    style: defaultStyle(init.style),
  };
}

export function createRect(
  init: BaseInit & { x: number; y: number; width: number; height: number; rx?: number; ry?: number },
): RectNode {
  return {
    ...base(init, "Rectangle"),
    type: "rect",
    x: init.x,
    y: init.y,
    width: init.width,
    height: init.height,
    rx: init.rx ?? 0,
    ry: init.ry ?? init.rx ?? 0,
  };
}

export function createEllipse(
  init: BaseInit & { cx: number; cy: number; rx: number; ry: number },
): EllipseNode {
  return {
    ...base(init, "Ellipse"),
    type: "ellipse",
    cx: init.cx,
    cy: init.cy,
    rx: init.rx,
    ry: init.ry,
  };
}

export function createLine(
  init: BaseInit & { x1: number; y1: number; x2: number; y2: number },
): LineNode {
  return {
    ...base(init, "Line"),
    type: "line",
    style: defaultStyle({ fill: null, stroke: solidPaint("#111111", 1), strokeWidth: 2, ...init.style }),
    x1: init.x1,
    y1: init.y1,
    x2: init.x2,
    y2: init.y2,
  };
}

export function createPolygon(
  init: BaseInit & { points: Array<{ x: number; y: number }>; closed?: boolean },
): PolygonNode {
  return {
    ...base(init, "Polygon"),
    type: "polygon",
    points: init.points,
    closed: init.closed ?? true,
  };
}

export function createText(
  init: BaseInit & {
    x: number;
    y: number;
    text: string;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number | string;
  },
): TextNode {
  return {
    ...base(init, "Text"),
    type: "text",
    style: defaultStyle({ fill: solidPaint("#111111", 1), ...init.style }),
    x: init.x,
    y: init.y,
    text: init.text,
    fontFamily: init.fontFamily ?? "Inter, system-ui, sans-serif",
    fontSize: init.fontSize ?? 48,
    fontWeight: init.fontWeight ?? 400,
    fontStyle: "normal",
    letterSpacing: 0,
    textAnchor: "start",
  };
}

export function createPath(init: BaseInit & { d: string }): PathNode {
  return {
    ...base(init, "Path"),
    type: "path",
    d: init.d,
  };
}

export function createGroup(init: BaseInit & { childIds?: string[] } = {}): GroupNode {
  return {
    ...base(init, "Group"),
    type: "group",
    style: defaultStyle({ fill: null, stroke: null }),
    childIds: init.childIds ?? [],
  };
}

/** Build a regular polygon's points centered at (cx, cy). */
export function regularPolygonPoints(
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  rotationDeg = -90,
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  const n = Math.max(3, Math.round(sides));
  const start = (rotationDeg * Math.PI) / 180;
  for (let i = 0; i < n; i++) {
    const a = start + (i * 2 * Math.PI) / n;
    pts.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
  }
  return pts;
}

/** Build a star's points (outer/inner alternating). */
export function starPoints(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  points: number,
  rotationDeg = -90,
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  const n = Math.max(3, Math.round(points));
  const start = (rotationDeg * Math.PI) / 180;
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = start + (i * Math.PI) / n;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}
