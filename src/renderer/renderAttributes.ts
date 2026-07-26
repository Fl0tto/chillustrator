/**
 * Map model style/paint onto React SVG presentation props.
 * Framework-light: returns plain prop objects; no DOM writes.
 */
import type { CSSProperties } from "react";
import type { NodeStyle, PaintReference, SvgNode } from "@/model/types";
import { toSvgTransform } from "@/geometry/matrix";
import { filterId, hasEffects } from "@/geometry/filters";

export function resolvePaint(paint: PaintReference | null): string {
  if (!paint) return "none";
  if (paint.kind === "solid") return paint.value;
  return `url(#${paint.value})`;
}

export interface StyleProps {
  fill: string;
  fillOpacity?: number;
  fillRule?: NodeStyle["fillRule"];
  stroke: string;
  strokeOpacity?: number;
  strokeWidth?: number;
  strokeLinecap?: NodeStyle["strokeLinecap"];
  strokeLinejoin?: NodeStyle["strokeLinejoin"];
  strokeMiterlimit?: number;
  strokeDasharray?: string;
  strokeDashoffset?: number;
  style?: CSSProperties;
}

export function styleToProps(style: NodeStyle): StyleProps {
  const hasStroke = style.stroke !== null && style.strokeWidth > 0;
  const props: StyleProps = {
    fill: resolvePaint(style.fill),
    stroke: resolvePaint(style.stroke),
  };
  if (style.fill) props.fillOpacity = style.fill.opacity;
  if (style.fillRule && style.fillRule !== "nonzero") props.fillRule = style.fillRule;
  if (hasStroke) {
    props.strokeWidth = style.strokeWidth;
    if (style.stroke) props.strokeOpacity = style.stroke.opacity;
    props.strokeLinecap = style.strokeLinecap;
    props.strokeLinejoin = style.strokeLinejoin;
    props.strokeMiterlimit = style.strokeMiterlimit;
    if (style.strokeDasharray.length > 0) {
      props.strokeDasharray = style.strokeDasharray.join(" ");
      props.strokeDashoffset = style.strokeDashoffset;
    }
  }
  if (style.blendMode) props.style = { mixBlendMode: style.blendMode as CSSProperties["mixBlendMode"] };
  return props;
}

/** Common attributes for every node element (transform, opacity, ids). */
export function baseNodeProps(node: SvgNode) {
  return {
    id: node.id,
    "data-node-id": node.id,
    "data-node-type": node.type,
    transform: toSvgTransform(node.transform),
    opacity: node.opacity === 1 ? undefined : node.opacity,
    // Non-destructive drop shadows are applied via a generated <filter> def.
    filter: hasEffects(node) ? `url(#${filterId(node.id)})` : undefined,
    // Hit-area is decoupled from paint: the interior stays clickable even when
    // fill is "none" (default for new shapes). Overlays/artboard stay
    // pointer-events:none; the live preview is inert via pointer capture.
    pointerEvents: "all" as const,
  };
}
