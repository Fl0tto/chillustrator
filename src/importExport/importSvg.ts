/**
 * Convert (untrusted) SVG text into model nodes + paint definitions.
 *
 * Pipeline: sanitizeSvg() -> walk the safe DOM -> emit SvgNode/PaintDefinition
 * objects with fresh ids. Never trusts raw markup: unsupported-but-safe elements
 * become UnknownSafeNode carrying pre-sanitized inner markup.
 *
 * Framework-independent apart from the sanitizer's DOM usage.
 */
import type {
  GradientStop,
  LinearGradientPaint,
  Matrix2D,
  NodeStyle,
  PaintDefinition,
  PaintReference,
  RadialGradientPaint,
  SvgDocumentModel,
  SvgNode,
} from "@/model/types";
import { identityMatrix, isIdentity } from "@/geometry/matrix";
import { createDocumentId, createNodeId, createPaintId } from "@/model/ids";
import { DEFAULT_DOC_HEIGHT, DEFAULT_DOC_WIDTH } from "@/model/document";
import { SCHEMA_VERSION } from "@/model/types";
import { sanitizeSvg, type SanitizeOptions } from "./sanitizeSvg";
import { parseStyle, initialStyle } from "./svgStyle";
import { parseTransform } from "./transform";
import { normalizeColor } from "./color";

export interface ImportSuccess {
  ok: true;
  /** All imported nodes; top-level nodes (parentId === null) are the roots. */
  nodes: SvgNode[];
  paints: PaintDefinition[];
  width?: number;
  height?: number;
  viewBox?: [number, number, number, number];
  warnings: string[];
}

export interface ImportFailure {
  ok: false;
  reason: string;
  warnings?: string[];
}

export type ImportResult = ImportSuccess | ImportFailure;

export type ImportOptions = SanitizeOptions;

/** Elements handled as structural/def scaffolding rather than artwork. */
const SKIP_ELEMENTS = new Set([
  "defs",
  "lineargradient",
  "radialgradient",
  "title",
  "desc",
  "metadata",
  "style",
  "symbol",
  "clippath",
  "mask",
  "pattern",
  "filter",
  "marker",
]);

function num(el: Element, name: string, fallback = 0): number {
  const v = el.getAttribute(name);
  if (v === null) return fallback;
  const n = parseFloat(v);
  return Number.isNaN(n) ? fallback : n;
}

/** Parse a length attribute (strips units), or undefined when absent/invalid. */
function parseLength(value: string | null): number | undefined {
  if (value === null) return undefined;
  const n = parseFloat(value);
  return Number.isNaN(n) ? undefined : n;
}

function parsePoints(raw: string | null): Array<{ x: number; y: number }> {
  if (!raw) return [];
  const nums = raw
    .split(/[\s,]+/)
    .map((t) => parseFloat(t))
    .filter((n) => !Number.isNaN(n));
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  return pts;
}

interface WalkContext {
  nodes: SvgNode[];
  warnings: string[];
  /** Old gradient/def id -> new PaintId. */
  paintMap: Map<string, string>;
}

/** Read the child-safe inner markup of an already-sanitized element. */
function innerMarkup(el: Element): string {
  try {
    const serializer = new XMLSerializer();
    return Array.from(el.childNodes)
      .map((n) => serializer.serializeToString(n))
      .join("");
  } catch {
    return "";
  }
}

/** Preserve safe unknown attributes (excluding ones we model explicitly). */
function collectExtraAttributes(el: Element, consumed: Set<string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (consumed.has(name)) continue;
    if (name === "style" || name === "transform" || name === "opacity") continue;
    if (name.startsWith("on")) continue;
    out[attr.name] = attr.value;
  }
  return out;
}

/**
 * Remap fill/stroke paint references (definition kind) onto freshly minted
 * PaintIds so they resolve against the imported paints.
 */
function remapPaintRefs(style: NodeStyle, fillRef: string | undefined, strokeRef: string | undefined, ctx: WalkContext): void {
  if (fillRef && style.fill && style.fill.kind === "definition") {
    const mapped = ctx.paintMap.get(fillRef);
    if (mapped) style.fill = { ...style.fill, value: mapped } as PaintReference;
    else style.fill = null; // dangling reference
  }
  if (strokeRef && style.stroke && style.stroke.kind === "definition") {
    const mapped = ctx.paintMap.get(strokeRef);
    if (mapped) style.stroke = { ...style.stroke, value: mapped } as PaintReference;
    else style.stroke = null;
  }
}

function makeBase(
  el: Element,
  id: string,
  type: SvgNode["type"],
  fallbackName: string,
  style: NodeStyle,
  opacity: number,
  transform: Matrix2D,
  parentId: string | null,
) {
  const name = el.getAttribute("id") || el.getAttribute("inkscape:label") || fallbackName;
  return {
    id,
    type,
    name,
    visible: el.getAttribute("visibility") !== "hidden" && el.getAttribute("display") !== "none",
    locked: false,
    opacity,
    transform,
    parentId,
    style,
  };
}

/**
 * Convert one element to a node (recursing into groups). Returns the new node id
 * or null when the element is skipped. Pushes created nodes into ctx.nodes.
 */
function walkElement(
  el: Element,
  parentId: string | null,
  inheritedStyle: NodeStyle,
  ctx: WalkContext,
): string | null {
  const tag = el.localName.toLowerCase();
  if (SKIP_ELEMENTS.has(tag)) return null;

  const { style, opacity, fillRef, strokeRef } = parseStyle(el, inheritedStyle);
  remapPaintRefs(style, fillRef, strokeRef, ctx);
  const transform = parseTransform(el.getAttribute("transform"));
  const id = createNodeId();

  switch (tag) {
    case "g": {
      const base = makeBase(el, id, "group", "Group", style, opacity, transform, parentId);
      const childIds: string[] = [];
      const groupNode: SvgNode = { ...base, type: "group", childIds };
      ctx.nodes.push(groupNode);
      for (const child of Array.from(el.children)) {
        const childId = walkElement(child, id, style, ctx);
        if (childId) childIds.push(childId);
      }
      return id;
    }
    case "rect": {
      const base = makeBase(el, id, "rect", "Rectangle", style, opacity, transform, parentId);
      const rx = parseLength(el.getAttribute("rx"));
      const ry = parseLength(el.getAttribute("ry"));
      ctx.nodes.push({
        ...base,
        type: "rect",
        x: num(el, "x"),
        y: num(el, "y"),
        width: num(el, "width"),
        height: num(el, "height"),
        rx: rx ?? ry ?? 0,
        ry: ry ?? rx ?? 0,
      });
      return id;
    }
    case "circle": {
      const base = makeBase(el, id, "ellipse", "Circle", style, opacity, transform, parentId);
      const r = num(el, "r");
      ctx.nodes.push({ ...base, type: "ellipse", cx: num(el, "cx"), cy: num(el, "cy"), rx: r, ry: r });
      return id;
    }
    case "ellipse": {
      const base = makeBase(el, id, "ellipse", "Ellipse", style, opacity, transform, parentId);
      ctx.nodes.push({
        ...base,
        type: "ellipse",
        cx: num(el, "cx"),
        cy: num(el, "cy"),
        rx: num(el, "rx"),
        ry: num(el, "ry"),
      });
      return id;
    }
    case "line": {
      const base = makeBase(el, id, "line", "Line", style, opacity, transform, parentId);
      ctx.nodes.push({
        ...base,
        type: "line",
        x1: num(el, "x1"),
        y1: num(el, "y1"),
        x2: num(el, "x2"),
        y2: num(el, "y2"),
      });
      return id;
    }
    case "polygon":
    case "polyline": {
      const base = makeBase(el, id, "polygon", tag === "polygon" ? "Polygon" : "Polyline", style, opacity, transform, parentId);
      ctx.nodes.push({
        ...base,
        type: "polygon",
        points: parsePoints(el.getAttribute("points")),
        closed: tag === "polygon",
      });
      return id;
    }
    case "path": {
      const base = makeBase(el, id, "path", "Path", style, opacity, transform, parentId);
      ctx.nodes.push({ ...base, type: "path", d: el.getAttribute("d") ?? "" });
      return id;
    }
    case "text": {
      const base = makeBase(el, id, "text", "Text", style, opacity, transform, parentId);
      const inline = el.getAttribute("style") ?? "";
      const getStyleProp = (p: string): string | undefined => {
        const m = new RegExp(`(?:^|;)\\s*${p}\\s*:\\s*([^;]+)`, "i").exec(inline);
        return m ? m[1].trim() : (el.getAttribute(p) ?? undefined);
      };
      const fontSize = parseLength(getStyleProp("font-size") ?? null) ?? 16;
      const weightRaw = getStyleProp("font-weight");
      const fontWeight: number | string = weightRaw
        ? (Number.isNaN(parseInt(weightRaw, 10)) ? weightRaw : parseInt(weightRaw, 10))
        : 400;
      const styleRaw = getStyleProp("font-style");
      const fontStyle = styleRaw === "italic" || styleRaw === "oblique" ? styleRaw : "normal";
      const anchorRaw = getStyleProp("text-anchor");
      const textAnchor = anchorRaw === "middle" || anchorRaw === "end" ? anchorRaw : "start";
      ctx.nodes.push({
        ...base,
        type: "text",
        x: num(el, "x"),
        y: num(el, "y"),
        text: el.textContent ?? "",
        fontFamily: getStyleProp("font-family") ?? "sans-serif",
        fontSize,
        fontWeight,
        fontStyle,
        letterSpacing: parseLength(getStyleProp("letter-spacing") ?? null) ?? 0,
        textAnchor,
      });
      return id;
    }
    case "image": {
      const href = el.getAttribute("href") ?? el.getAttribute("xlink:href") ?? "";
      const base = makeBase(el, id, "image", "Image", style, opacity, transform, parentId);
      ctx.nodes.push({
        ...base,
        type: "image",
        x: num(el, "x"),
        y: num(el, "y"),
        width: num(el, "width"),
        height: num(el, "height"),
        href,
      });
      return id;
    }
    default: {
      // Unsupported-but-safe element -> UnknownSafeNode with sanitized markup.
      const consumed = new Set<string>(["id"]);
      const base = makeBase(el, id, "unknown", tag, style, opacity, transform, parentId);
      ctx.nodes.push({
        ...base,
        type: "unknown",
        tagName: tag,
        innerMarkup: innerMarkup(el),
        extraAttributes: collectExtraAttributes(el, consumed),
      });
      ctx.warnings.push(`Imported <${tag}> as a read-only unknown node.`);
      return id;
    }
  }
}

// ---------------------------------------------------------------------------
// Gradient parsing
// ---------------------------------------------------------------------------

function parseStops(el: Element): GradientStop[] {
  const stops: GradientStop[] = [];
  for (const stop of Array.from(el.getElementsByTagName("stop"))) {
    const offsetRaw = stop.getAttribute("offset") ?? "0";
    const offset = offsetRaw.trim().endsWith("%")
      ? parseFloat(offsetRaw) / 100
      : parseFloat(offsetRaw);
    const inline = stop.getAttribute("style") ?? "";
    const styleProp = (p: string): string | undefined => {
      const m = new RegExp(`(?:^|;)\\s*${p}\\s*:\\s*([^;]+)`, "i").exec(inline);
      return m ? m[1].trim() : (stop.getAttribute(p) ?? undefined);
    };
    const colorRaw = styleProp("stop-color") ?? "#000000";
    const { color, alpha } = normalizeColor(colorRaw);
    const opacityRaw = styleProp("stop-opacity");
    const opacity = opacityRaw !== undefined ? parseFloat(opacityRaw) : alpha;
    stops.push({
      offset: Number.isNaN(offset) ? 0 : Math.max(0, Math.min(1, offset)),
      color,
      opacity: Number.isNaN(opacity) ? 1 : Math.max(0, Math.min(1, opacity)),
    });
  }
  return stops;
}

function parseGradientUnits(el: Element): "objectBoundingBox" | "userSpaceOnUse" {
  return el.getAttribute("gradientUnits") === "userSpaceOnUse"
    ? "userSpaceOnUse"
    : "objectBoundingBox";
}

function parseSpread(el: Element): "pad" | "reflect" | "repeat" {
  const s = el.getAttribute("spreadMethod");
  return s === "reflect" || s === "repeat" ? s : "pad";
}

function gradientTransform(el: Element): Matrix2D | undefined {
  const t = el.getAttribute("gradientTransform");
  if (!t) return undefined;
  const m = parseTransform(t);
  return isIdentity(m) ? undefined : m;
}

/** Collect linear/radial gradient defs, returning paints and old->new id map. */
function collectPaints(root: Element): { paints: PaintDefinition[]; map: Map<string, string> } {
  const paints: PaintDefinition[] = [];
  const map = new Map<string, string>();

  const linear = Array.from(root.getElementsByTagName("linearGradient"));
  const radial = Array.from(root.getElementsByTagName("radialGradient"));
  // Resolve xlink:href stop inheritance in a simple pass.
  const byOldId = new Map<string, Element>();
  for (const el of [...linear, ...radial]) {
    const oldId = el.getAttribute("id");
    if (oldId) byOldId.set(oldId, el);
  }
  const resolveStops = (el: Element, seen = new Set<Element>()): GradientStop[] => {
    if (seen.has(el)) return [];
    seen.add(el);
    const own = parseStops(el);
    if (own.length > 0) return own;
    const href = el.getAttribute("href") ?? el.getAttribute("xlink:href");
    if (href && href.startsWith("#")) {
      const parent = byOldId.get(href.slice(1));
      if (parent) return resolveStops(parent, seen);
    }
    return own;
  };

  for (const el of linear) {
    const oldId = el.getAttribute("id");
    if (!oldId) continue;
    const newId = createPaintId();
    map.set(oldId, newId);
    const paint: LinearGradientPaint = {
      id: newId,
      kind: "linearGradient",
      name: oldId,
      x1: parseLength(el.getAttribute("x1")) ?? 0,
      y1: parseLength(el.getAttribute("y1")) ?? 0,
      x2: parseLength(el.getAttribute("x2")) ?? 1,
      y2: parseLength(el.getAttribute("y2")) ?? 0,
      units: parseGradientUnits(el),
      spreadMethod: parseSpread(el),
      stops: resolveStops(el),
    };
    const gt = gradientTransform(el);
    if (gt) paint.transform = gt;
    paints.push(paint);
  }
  for (const el of radial) {
    const oldId = el.getAttribute("id");
    if (!oldId) continue;
    const newId = createPaintId();
    map.set(oldId, newId);
    const paint: RadialGradientPaint = {
      id: newId,
      kind: "radialGradient",
      name: oldId,
      cx: parseLength(el.getAttribute("cx")) ?? 0.5,
      cy: parseLength(el.getAttribute("cy")) ?? 0.5,
      r: parseLength(el.getAttribute("r")) ?? 0.5,
      units: parseGradientUnits(el),
      spreadMethod: parseSpread(el),
      stops: resolveStops(el),
    };
    const fx = parseLength(el.getAttribute("fx"));
    const fy = parseLength(el.getAttribute("fy"));
    if (fx !== undefined) paint.fx = fx;
    if (fy !== undefined) paint.fy = fy;
    const gt = gradientTransform(el);
    if (gt) paint.transform = gt;
    paints.push(paint);
  }

  return { paints, map };
}

function parseViewBox(raw: string | null): [number, number, number, number] | undefined {
  if (!raw) return undefined;
  const n = raw.split(/[\s,]+/).map((t) => parseFloat(t)).filter((v) => !Number.isNaN(v));
  if (n.length !== 4) return undefined;
  return [n[0], n[1], n[2], n[3]];
}

/**
 * Import SVG text into model nodes + paints. Sanitizes first; returns a failure
 * result for malformed or unsafe-beyond-repair input.
 */
export function importSvg(text: string, options: ImportOptions = {}): ImportResult {
  const sanitized = sanitizeSvg(text, options);
  if (!sanitized.ok) {
    return { ok: false, reason: sanitized.reason };
  }
  const root = sanitized.root as unknown as Element;
  const warnings = [...sanitized.warnings];

  const { paints, map } = collectPaints(root);
  const ctx: WalkContext = { nodes: [], warnings, paintMap: map };

  for (const child of Array.from(root.children)) {
    walkElement(child, null, initialStyle(), ctx);
  }

  const viewBox = parseViewBox(root.getAttribute("viewBox"));
  const width = parseLength(root.getAttribute("width")) ?? viewBox?.[2];
  const height = parseLength(root.getAttribute("height")) ?? viewBox?.[3];

  const result: ImportSuccess = { ok: true, nodes: ctx.nodes, paints, warnings };
  if (width !== undefined) result.width = width;
  if (height !== undefined) result.height = height;
  if (viewBox) result.viewBox = viewBox;
  return result;
}

/**
 * Assemble a full document model from a successful import (IMP-001 / HST-005).
 * Nodes keyed by id; roots are the parentId === null nodes in original order.
 * The returned document is passed to store.loadDocument as one transaction.
 */
export function buildDocumentFromImport(result: ImportSuccess, name = "Imported"): SvgDocumentModel {
  const now = new Date().toISOString();
  const nodes: Record<string, SvgNode> = {};
  const rootNodeIds: string[] = [];
  for (const node of result.nodes) {
    nodes[node.id] = node;
    if (node.parentId === null) rootNodeIds.push(node.id);
  }
  const paints: Record<string, PaintDefinition> = {};
  for (const paint of result.paints) paints[paint.id] = paint;

  const width = result.width ?? result.viewBox?.[2] ?? DEFAULT_DOC_WIDTH;
  const height = result.height ?? result.viewBox?.[3] ?? DEFAULT_DOC_HEIGHT;
  const viewBox = result.viewBox ?? [0, 0, width, height];

  return {
    schemaVersion: SCHEMA_VERSION,
    documentId: createDocumentId(),
    name,
    width,
    height,
    viewBox,
    rootNodeIds,
    nodes,
    paints,
    metadata: { createdAt: now, updatedAt: now, generator: "chillustrator" },
  };
}

/** Convenience: the identity transform, exported for callers building nodes. */
export { identityMatrix };
