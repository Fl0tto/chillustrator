/**
 * Serialize the document model to clean, portable SVG text (EXP-001).
 *
 * Mirrors the renderer's attribute mapping (renderer/renderAttributes.ts) so the
 * exported file matches on-screen output, but strips every editor-only concern:
 * no overlay handles, no data-* attributes, no scripts, no transient state
 * (spec §11 EXP-001, P-005). Framework- and DOM-independent (pure string build)
 * so it is safe in workers and unit tests.
 */
import type {
  NodeStyle,
  PaintDefinition,
  PaintReference,
  SvgDocumentModel,
  SvgNode,
} from "@/model/types";
import { isIdentity } from "@/geometry/matrix";

export interface SerializeOptions {
  /** Decimal precision for numeric attributes (P-005). Default 3. */
  precision?: number;
  /** Pretty-print with indentation and newlines. Default true. */
  pretty?: boolean;
  /** Emit node `id` attributes (OPT-008). Default false — cleaner output. */
  preserveIds?: boolean;
  /**
   * Include hidden (visible === false) nodes with `display="none"` instead of
   * omitting them (ADR-TODO-001). Default false — omit hidden nodes.
   */
  includeHidden?: boolean;
  /** Emit a generator comment/attribute. Default false. */
  includeMetadata?: boolean;
}

interface Resolved {
  precision: number;
  pretty: boolean;
  preserveIds: boolean;
  includeHidden: boolean;
  includeMetadata: boolean;
}

const SVG_NS = "http://www.w3.org/2000/svg";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Round to `precision` decimals and drop trailing zeros / negative zero. */
function fmt(n: number, precision: number): string {
  if (!Number.isFinite(n)) return "0";
  const v = Number(n.toFixed(precision));
  return Object.is(v, -0) ? "0" : String(v);
}

/** Escape a value for use inside a double-quoted XML attribute. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escape text content (element children). */
function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type Attr = [name: string, value: string];

function matrixAttr(m: SvgNode["transform"], p: number): Attr | null {
  if (isIdentity(m)) return null;
  return [
    "transform",
    `matrix(${fmt(m.a, p)} ${fmt(m.b, p)} ${fmt(m.c, p)} ${fmt(m.d, p)} ${fmt(m.e, p)} ${fmt(m.f, p)})`,
  ];
}

function paintValue(paint: PaintReference | null): string {
  if (!paint) return "none";
  return paint.kind === "solid" ? paint.value : `url(#${paint.value})`;
}

/** Style attributes, mirroring renderAttributes.styleToProps. */
function styleAttrs(style: NodeStyle, p: number): Attr[] {
  const attrs: Attr[] = [];
  attrs.push(["fill", paintValue(style.fill)]);
  if (style.fill && style.fill.opacity !== 1) attrs.push(["fill-opacity", fmt(style.fill.opacity, 4)]);
  if (style.fillRule !== "nonzero") attrs.push(["fill-rule", style.fillRule]);

  const hasStroke = style.stroke !== null && style.strokeWidth > 0;
  attrs.push(["stroke", hasStroke ? paintValue(style.stroke) : "none"]);
  if (hasStroke) {
    attrs.push(["stroke-width", fmt(style.strokeWidth, p)]);
    if (style.stroke && style.stroke.opacity !== 1)
      attrs.push(["stroke-opacity", fmt(style.stroke.opacity, 4)]);
    if (style.strokeLinecap !== "butt") attrs.push(["stroke-linecap", style.strokeLinecap]);
    if (style.strokeLinejoin !== "miter") attrs.push(["stroke-linejoin", style.strokeLinejoin]);
    if (style.strokeMiterlimit !== 4) attrs.push(["stroke-miterlimit", fmt(style.strokeMiterlimit, p)]);
    if (style.strokeDasharray.length > 0) {
      attrs.push(["stroke-dasharray", style.strokeDasharray.map((d) => fmt(d, p)).join(" ")]);
      if (style.strokeDashoffset !== 0)
        attrs.push(["stroke-dashoffset", fmt(style.strokeDashoffset, p)]);
    }
  }
  if (style.blendMode) attrs.push(["style", `mix-blend-mode:${style.blendMode}`]);
  return attrs;
}

function baseAttrs(node: SvgNode, o: Resolved): Attr[] {
  const attrs: Attr[] = [];
  if (o.preserveIds) attrs.push(["id", node.id]);
  const t = matrixAttr(node.transform, o.precision);
  if (t) attrs.push(t);
  if (node.opacity !== 1) attrs.push(["opacity", fmt(node.opacity, 4)]);
  if (!node.visible && o.includeHidden) attrs.push(["display", "none"]);
  return attrs;
}

/** Safe unknown/aria attributes preserved from import (SEC-004 allowlist-ish). */
function extraAttrs(node: SvgNode): Attr[] {
  const extra = node.extraAttributes;
  if (!extra) return [];
  const out: Attr[] = [];
  for (const [name, value] of Object.entries(extra)) {
    const lower = name.toLowerCase();
    if (lower.startsWith("on")) continue; // never emit event handlers
    if (lower === "id" || lower === "transform" || lower === "style" || lower === "opacity") continue;
    out.push([name, value]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Element emission
// ---------------------------------------------------------------------------

function attrString(attrs: Attr[]): string {
  return attrs.map(([n, v]) => ` ${n}="${escapeAttr(v)}"`).join("");
}

interface Writer {
  lines: string[];
  push(depth: number, text: string): void;
}

function makeWriter(pretty: boolean): Writer {
  const lines: string[] = [];
  return {
    lines,
    push(depth, text) {
      lines.push(pretty ? "  ".repeat(depth) + text : text);
    },
  };
}

function nodeAttrs(node: SvgNode, o: Resolved): Attr[] {
  const attrs = baseAttrs(node, o);
  if (node.type !== "group" && node.type !== "unknown" && node.type !== "image") {
    attrs.push(...styleAttrs(node.style, o.precision));
  }
  const p = o.precision;
  switch (node.type) {
    case "rect":
      attrs.push(["x", fmt(node.x, p)], ["y", fmt(node.y, p)], ["width", fmt(node.width, p)], ["height", fmt(node.height, p)]);
      if (node.rx) attrs.push(["rx", fmt(node.rx, p)]);
      if (node.ry) attrs.push(["ry", fmt(node.ry, p)]);
      break;
    case "ellipse":
      attrs.push(["cx", fmt(node.cx, p)], ["cy", fmt(node.cy, p)], ["rx", fmt(node.rx, p)], ["ry", fmt(node.ry, p)]);
      break;
    case "line":
      attrs.push(["x1", fmt(node.x1, p)], ["y1", fmt(node.y1, p)], ["x2", fmt(node.x2, p)], ["y2", fmt(node.y2, p)]);
      break;
    case "polygon":
      attrs.push(["points", node.points.map((pt) => `${fmt(pt.x, p)},${fmt(pt.y, p)}`).join(" ")]);
      break;
    case "path":
      attrs.push(["d", node.d]);
      break;
    case "text":
      attrs.push(["x", fmt(node.x, p)], ["y", fmt(node.y, p)], ["font-family", node.fontFamily], ["font-size", fmt(node.fontSize, p)]);
      if (node.fontWeight !== 400 && node.fontWeight !== "normal") attrs.push(["font-weight", String(node.fontWeight)]);
      if (node.fontStyle !== "normal") attrs.push(["font-style", node.fontStyle]);
      if (node.letterSpacing) attrs.push(["letter-spacing", fmt(node.letterSpacing, p)]);
      if (node.textAnchor !== "start") attrs.push(["text-anchor", node.textAnchor]);
      break;
    case "image":
      attrs.push(["x", fmt(node.x, p)], ["y", fmt(node.y, p)], ["width", fmt(node.width, p)], ["height", fmt(node.height, p)], ["href", node.href]);
      break;
  }
  attrs.push(...extraAttrs(node));
  return attrs;
}

function tagFor(node: SvgNode): string {
  switch (node.type) {
    case "group":
      return "g";
    case "ellipse":
      return "ellipse";
    case "polygon":
      return node.closed ? "polygon" : "polyline";
    case "unknown":
      return node.tagName;
    default:
      return node.type;
  }
}

function writeNode(
  node: SvgNode,
  nodes: Record<string, SvgNode>,
  o: Resolved,
  w: Writer,
  depth: number,
): void {
  if (!node.visible && !o.includeHidden) return;
  const tag = tagFor(node);
  const attrs = nodeAttrs(node, o);

  if (node.type === "group") {
    if (node.childIds.length === 0) return; // OPT-002: drop empty groups
    w.push(depth, `<g${attrString(attrs)}>`);
    for (const childId of node.childIds) {
      const child = nodes[childId];
      if (child) writeNode(child, nodes, o, w, depth + 1);
    }
    w.push(depth, `</g>`);
    return;
  }
  if (node.type === "text") {
    w.push(depth, `<text${attrString(attrs)}>${escapeText(node.text)}</text>`);
    return;
  }
  if (node.type === "unknown") {
    if (node.innerMarkup.trim()) {
      w.push(depth, `<${tag}${attrString(attrs)}>`);
      w.push(depth + 1, node.innerMarkup);
      w.push(depth, `</${tag}>`);
    } else {
      w.push(depth, `<${tag}${attrString(attrs)} />`);
    }
    return;
  }
  w.push(depth, `<${tag}${attrString(attrs)} />`);
}

// ---------------------------------------------------------------------------
// Defs (gradients) — only those actually referenced (P-005 / OPT-001)
// ---------------------------------------------------------------------------

function collectReferencedPaintIds(doc: SvgDocumentModel, includeHidden: boolean): Set<string> {
  const used = new Set<string>();
  const visit = (node: SvgNode) => {
    if (!node.visible && !includeHidden) return;
    for (const ref of [node.style.fill, node.style.stroke]) {
      if (ref && ref.kind === "definition") used.add(ref.value);
    }
    if (node.type === "group") {
      for (const id of node.childIds) {
        const child = doc.nodes[id];
        if (child) visit(child);
      }
    }
  };
  for (const id of doc.rootNodeIds) {
    const node = doc.nodes[id];
    if (node) visit(node);
  }
  return used;
}

function writePaint(paint: PaintDefinition, o: Resolved, w: Writer, depth: number): void {
  const p = o.precision;
  const attrs: Attr[] = [["id", paint.id]];
  if (paint.kind === "linearGradient") {
    attrs.push(["x1", fmt(paint.x1, p)], ["y1", fmt(paint.y1, p)], ["x2", fmt(paint.x2, p)], ["y2", fmt(paint.y2, p)]);
  } else {
    attrs.push(["cx", fmt(paint.cx, p)], ["cy", fmt(paint.cy, p)], ["r", fmt(paint.r, p)]);
    if (paint.fx !== undefined) attrs.push(["fx", fmt(paint.fx, p)]);
    if (paint.fy !== undefined) attrs.push(["fy", fmt(paint.fy, p)]);
  }
  if (paint.units !== "objectBoundingBox") attrs.push(["gradientUnits", paint.units]);
  if (paint.spreadMethod !== "pad") attrs.push(["spreadMethod", paint.spreadMethod]);
  if (paint.transform) {
    attrs.push([
      "gradientTransform",
      `matrix(${fmt(paint.transform.a, p)} ${fmt(paint.transform.b, p)} ${fmt(paint.transform.c, p)} ${fmt(paint.transform.d, p)} ${fmt(paint.transform.e, p)} ${fmt(paint.transform.f, p)})`,
    ]);
  }
  const tag = paint.kind;
  w.push(depth, `<${tag}${attrString(attrs)}>`);
  for (const stop of paint.stops) {
    const stopAttrs: Attr[] = [["offset", fmt(stop.offset, 4)], ["stop-color", stop.color]];
    if (stop.opacity !== 1) stopAttrs.push(["stop-opacity", fmt(stop.opacity, 4)]);
    w.push(depth + 1, `<stop${attrString(stopAttrs)} />`);
  }
  w.push(depth, `</${tag}>`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function serializeSvg(doc: SvgDocumentModel, options: SerializeOptions = {}): string {
  const o: Resolved = {
    precision: options.precision ?? 3,
    pretty: options.pretty ?? true,
    preserveIds: options.preserveIds ?? false,
    includeHidden: options.includeHidden ?? false,
    includeMetadata: options.includeMetadata ?? false,
  };
  const w = makeWriter(o.pretty);
  const [vx, vy, vw, vh] = doc.viewBox;

  const rootAttrs: Attr[] = [
    ["xmlns", SVG_NS],
    ["width", fmt(doc.width, o.precision)],
    ["height", fmt(doc.height, o.precision)],
    ["viewBox", `${fmt(vx, o.precision)} ${fmt(vy, o.precision)} ${fmt(vw, o.precision)} ${fmt(vh, o.precision)}`],
  ];
  if (o.includeMetadata) rootAttrs.push(["data-generator", "chillustrator"]);

  w.push(0, `<svg${attrString(rootAttrs)}>`);

  const usedPaints = collectReferencedPaintIds(doc, o.includeHidden);
  const paints = Object.values(doc.paints).filter((p) => usedPaints.has(p.id));
  if (paints.length > 0) {
    w.push(1, `<defs>`);
    for (const paint of paints) writePaint(paint, o, w, 2);
    w.push(1, `</defs>`);
  }

  for (const id of doc.rootNodeIds) {
    const node = doc.nodes[id];
    if (node) writeNode(node, doc.nodes, o, w, 1);
  }

  w.push(0, `</svg>`);
  return w.lines.join(o.pretty ? "\n" : "");
}
