/**
 * Bidirectional mapping between SVG presentation attributes / inline style and
 * the model's NodeStyle. Import and export share this module so serialize →
 * import round-trips are symmetric (AT-006/AT-007).
 *
 * Framework-independent.
 */
import type {
  FillRule,
  NodeStyle,
  StrokeLinecap,
  StrokeLinejoin,
} from "@/model/types";
import { parsePaint, paintToSvgValue } from "./color";

/** SVG initial values, used as the base when an attribute is absent. */
export function initialStyle(): NodeStyle {
  return {
    fill: { kind: "solid", value: "#000000", opacity: 1 },
    stroke: null,
    strokeWidth: 1,
    strokeLinecap: "butt",
    strokeLinejoin: "miter",
    strokeMiterlimit: 4,
    strokeDasharray: [],
    strokeDashoffset: 0,
    fillRule: "nonzero",
  };
}

/** Parse `stroke-dasharray` into an array of numbers ([] for "none"). */
function parseDashArray(value: string): number[] {
  const v = value.trim().toLowerCase();
  if (!v || v === "none") return [];
  return v
    .split(/[\s,]+/)
    .map((t) => parseFloat(t))
    .filter((n) => !Number.isNaN(n) && n >= 0);
}

/** Split an inline `style` attribute into a lower-cased property map. */
export function parseInlineStyle(style: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!style) return out;
  for (const decl of style.split(";")) {
    const idx = decl.indexOf(":");
    if (idx <= 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim();
    if (prop) out[prop] = val;
  }
  return out;
}

/**
 * A minimal readable-property interface satisfied by SVG DOM elements. Kept
 * abstract so the parser is testable without a real DOM if needed.
 */
export interface AttrSource {
  getAttribute(name: string): string | null;
}

export interface ParsedStyleResult {
  style: NodeStyle;
  /** node.opacity (the `opacity` property is NOT inherited). */
  opacity: number;
  /** Old paint-def ids referenced by fill/stroke (pre-remap). */
  fillRef?: string;
  strokeRef?: string;
  blendMode?: string;
}

/**
 * Resolve the effective value of a presentation property, preferring inline
 * `style` over the presentation attribute (matching CSS cascade for SVG).
 */
function prop(
  el: AttrSource,
  inline: Record<string, string>,
  name: string,
): string | undefined {
  if (name in inline) return inline[name];
  const attr = el.getAttribute(name);
  return attr === null ? undefined : attr;
}

/**
 * Parse presentation attributes + inline style into a NodeStyle, layered on top
 * of an `inherited` style (SVG inheritance of fill/stroke/... is flattened here).
 */
export function parseStyle(el: AttrSource, inherited: NodeStyle): ParsedStyleResult {
  const inline = parseInlineStyle(el.getAttribute("style"));
  const style: NodeStyle = {
    ...inherited,
    strokeDasharray: [...inherited.strokeDasharray],
    fill: inherited.fill ? { ...inherited.fill } : null,
    stroke: inherited.stroke ? { ...inherited.stroke } : null,
  };
  let fillRef: string | undefined;
  let strokeRef: string | undefined;

  const fill = prop(el, inline, "fill");
  if (fill !== undefined) {
    const parsed = parsePaint(fill);
    style.fill = parsed.paint;
    fillRef = parsed.refId;
  }
  const fillOpacity = prop(el, inline, "fill-opacity");
  if (fillOpacity !== undefined && style.fill) {
    const o = parseFloat(fillOpacity);
    if (!Number.isNaN(o)) style.fill = { ...style.fill, opacity: style.fill.opacity * clamp01(o) };
  }

  const stroke = prop(el, inline, "stroke");
  if (stroke !== undefined) {
    const parsed = parsePaint(stroke);
    style.stroke = parsed.paint;
    strokeRef = parsed.refId;
  }
  const strokeOpacity = prop(el, inline, "stroke-opacity");
  if (strokeOpacity !== undefined && style.stroke) {
    const o = parseFloat(strokeOpacity);
    if (!Number.isNaN(o)) style.stroke = { ...style.stroke, opacity: style.stroke.opacity * clamp01(o) };
  }

  const strokeWidth = prop(el, inline, "stroke-width");
  if (strokeWidth !== undefined) {
    const w = parseFloat(strokeWidth);
    if (!Number.isNaN(w)) style.strokeWidth = w;
  }
  const linecap = prop(el, inline, "stroke-linecap");
  if (linecap === "butt" || linecap === "round" || linecap === "square") {
    style.strokeLinecap = linecap as StrokeLinecap;
  }
  const linejoin = prop(el, inline, "stroke-linejoin");
  if (linejoin === "miter" || linejoin === "round" || linejoin === "bevel") {
    style.strokeLinejoin = linejoin as StrokeLinejoin;
  }
  const miter = prop(el, inline, "stroke-miterlimit");
  if (miter !== undefined) {
    const m = parseFloat(miter);
    if (!Number.isNaN(m)) style.strokeMiterlimit = m;
  }
  const dash = prop(el, inline, "stroke-dasharray");
  if (dash !== undefined) style.strokeDasharray = parseDashArray(dash);
  const dashOffset = prop(el, inline, "stroke-dashoffset");
  if (dashOffset !== undefined) {
    const d = parseFloat(dashOffset);
    if (!Number.isNaN(d)) style.strokeDashoffset = d;
  }
  const fillRule = prop(el, inline, "fill-rule");
  if (fillRule === "nonzero" || fillRule === "evenodd") style.fillRule = fillRule as FillRule;

  const blend = prop(el, inline, "mix-blend-mode");
  if (blend) style.blendMode = blend;

  // opacity (not inherited): default 1
  let opacity = 1;
  const op = prop(el, inline, "opacity");
  if (op !== undefined) {
    const o = parseFloat(op);
    if (!Number.isNaN(o)) opacity = clamp01(o);
  }

  const result: ParsedStyleResult = { style, opacity };
  if (fillRef) result.fillRef = fillRef;
  if (strokeRef) result.strokeRef = strokeRef;
  if (style.blendMode) result.blendMode = style.blendMode;
  return result;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// ---------------------------------------------------------------------------
// Serialization: NodeStyle -> attribute map (omitting SVG defaults)
// ---------------------------------------------------------------------------

const DEFAULT_FILL = "#000000";

/**
 * Convert a NodeStyle into the presentation attributes that need emitting,
 * omitting values equal to the SVG initial (so the output stays clean and
 * round-trips symmetrically with parseStyle).
 */
export function styleToAttributes(style: NodeStyle): Record<string, string> {
  const attrs: Record<string, string> = {};

  // Fill
  if (style.fill === null) {
    attrs.fill = "none";
  } else if (!(style.fill.kind === "solid" && style.fill.value.toLowerCase() === DEFAULT_FILL)) {
    attrs.fill = paintToSvgValue(style.fill);
  }
  if (style.fill && style.fill.opacity < 1) {
    attrs["fill-opacity"] = String(round(style.fill.opacity));
  }

  // Stroke (omit the whole cluster when there is no stroke).
  if (style.stroke !== null) {
    attrs.stroke = paintToSvgValue(style.stroke);
    if (style.stroke.opacity < 1) attrs["stroke-opacity"] = String(round(style.stroke.opacity));
    if (style.strokeWidth !== 1) attrs["stroke-width"] = String(round(style.strokeWidth));
    if (style.strokeLinecap !== "butt") attrs["stroke-linecap"] = style.strokeLinecap;
    if (style.strokeLinejoin !== "miter") attrs["stroke-linejoin"] = style.strokeLinejoin;
    if (style.strokeMiterlimit !== 4) attrs["stroke-miterlimit"] = String(round(style.strokeMiterlimit));
    if (style.strokeDasharray.length > 0) {
      attrs["stroke-dasharray"] = style.strokeDasharray.map((n) => round(n)).join(" ");
      if (style.strokeDashoffset !== 0) attrs["stroke-dashoffset"] = String(round(style.strokeDashoffset));
    }
  }

  if (style.fillRule !== "nonzero") attrs["fill-rule"] = style.fillRule;
  if (style.blendMode) attrs.style = `mix-blend-mode:${style.blendMode}`;

  return attrs;
}

function round(n: number): number {
  const v = Number(n.toFixed(4));
  return Object.is(v, -0) ? 0 : v;
}
