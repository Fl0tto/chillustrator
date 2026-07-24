/**
 * chillustrator — core document model types.
 *
 * This module is the authoritative contract for the document representation.
 * It is FRAMEWORK-INDEPENDENT: no React, no DOM, no store imports allowed here.
 *
 * Rules (see spec §7):
 *  - Normalized node storage keyed by stable id.
 *  - Parent/child order determines paint order.
 *  - Selection references ids, never object references.
 *  - UI-only state must never live on persisted nodes.
 *  - Safe unknown SVG attributes are preserved in `extraAttributes`.
 */

export type NodeId = string;
export type PaintId = string;

/** 2D affine matrix [a c e / b d f / 0 0 1] matching SVG/DOMMatrix conventions. */
export interface Matrix2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export type StrokeLinecap = "butt" | "round" | "square";
export type StrokeLinejoin = "miter" | "round" | "bevel";
export type FillRule = "nonzero" | "evenodd";

/**
 * A paint reference on a node's style.
 *  - kind "solid": `value` is a hex/named CSS color ("#rrggbb", "black", …).
 *  - kind "definition": `value` is a PaintId referring to document.paints
 *    (gradients/patterns). Serialized as url(#id).
 *  - kind "none" is represented by `null` on the style property.
 */
export interface PaintReference {
  kind: "solid" | "definition";
  value: string;
  opacity: number;
}

export interface NodeStyle {
  fill: PaintReference | null;
  stroke: PaintReference | null;
  strokeWidth: number;
  strokeLinecap: StrokeLinecap;
  strokeLinejoin: StrokeLinejoin;
  strokeMiterlimit: number;
  strokeDasharray: number[];
  strokeDashoffset: number;
  fillRule: FillRule;
  blendMode?: string;
}

export interface BaseNode {
  id: NodeId;
  type: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  transform: Matrix2D;
  parentId: NodeId | null;
  style: NodeStyle;
  extraAttributes?: Record<string, string>;
}

export interface RectNode extends BaseNode {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
  ry: number;
}

export interface EllipseNode extends BaseNode {
  type: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface LineNode extends BaseNode {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PolygonNode extends BaseNode {
  type: "polygon";
  points: Array<{ x: number; y: number }>;
  closed: boolean;
}

export interface PathNode extends BaseNode {
  type: "path";
  d: string;
  parsedPathVersion?: number;
}

export type FontStyle = "normal" | "italic" | "oblique";
export type TextAnchor = "start" | "middle" | "end";

export interface TextNode extends BaseNode {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  fontStyle: FontStyle;
  letterSpacing: number;
  textAnchor: TextAnchor;
}

export interface ImageNode extends BaseNode {
  type: "image";
  x: number;
  y: number;
  width: number;
  height: number;
  href: string;
}

export interface GroupNode extends BaseNode {
  type: "group";
  childIds: NodeId[];
}

/**
 * An imported element the editor does not natively model but considers safe.
 * Rendered read-only from its serialized tag name + attributes + inner markup.
 */
export interface UnknownSafeNode extends BaseNode {
  type: "unknown";
  tagName: string;
  /** Pre-sanitized inner SVG markup (safe, no scripts/handlers). May be empty. */
  innerMarkup: string;
}

export type SvgNode =
  | GroupNode
  | RectNode
  | EllipseNode
  | LineNode
  | PolygonNode
  | PathNode
  | TextNode
  | ImageNode
  | UnknownSafeNode;

export type SvgNodeType = SvgNode["type"];

/** Container nodes that own an ordered `childIds` list. */
export type ContainerNode = GroupNode;

// ---------------------------------------------------------------------------
// Paint definitions (gradients / patterns) — referenced by PaintReference.
// ---------------------------------------------------------------------------

export interface GradientStop {
  offset: number; // 0..1
  color: string; // hex/named
  opacity: number; // 0..1
}

export type GradientUnits = "objectBoundingBox" | "userSpaceOnUse";
export type SpreadMethod = "pad" | "reflect" | "repeat";

export interface LinearGradientPaint {
  id: PaintId;
  kind: "linearGradient";
  name: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  units: GradientUnits;
  spreadMethod: SpreadMethod;
  stops: GradientStop[];
  transform?: Matrix2D;
}

export interface RadialGradientPaint {
  id: PaintId;
  kind: "radialGradient";
  name: string;
  cx: number;
  cy: number;
  r: number;
  fx?: number;
  fy?: number;
  units: GradientUnits;
  spreadMethod: SpreadMethod;
  stops: GradientStop[];
  transform?: Matrix2D;
}

export type PaintDefinition = LinearGradientPaint | RadialGradientPaint;

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export interface DocumentMetadata {
  createdAt: string;
  updatedAt: string;
  generator?: string;
}

export interface SvgDocumentModel {
  schemaVersion: number;
  documentId: string;
  name: string;
  width: number;
  height: number;
  viewBox: [number, number, number, number];
  /** Top-level node ids in paint order (first painted first / bottom-most). */
  rootNodeIds: NodeId[];
  nodes: Record<NodeId, SvgNode>;
  paints: Record<PaintId, PaintDefinition>;
  metadata: DocumentMetadata;
}

export const SCHEMA_VERSION = 1;
