/**
 * Node-local geometry and world-matrix resolution.
 *
 * "Local bounds" = the node's geometry in its OWN coordinate space, before its
 * `transform` is applied. "World bounds" = local bounds transformed by the full
 * ancestor matrix chain, expressed in root SVG user units.
 *
 * These are model-derived (exact for primitives; approximate for path/text).
 * Pixel-accurate on-screen bounds come from the DOM (see domMeasure.ts).
 */
import type { Matrix2D, SvgDocumentModel, SvgNode } from "@/model/types";
import { composeAll, identityMatrix, type Point } from "./matrix";
import {
  emptyBounds,
  transformBounds,
  unionAll,
  type Bounds,
  isEmptyBounds,
} from "./bounds";
import { approximatePathBounds } from "./pathBounds";

/** Estimated average glyph advance as a fraction of font size (rough). */
const TEXT_ADVANCE_FACTOR = 0.6;

/** Local (pre-transform) bounds of a single node, ignoring children. */
export function localSelfBounds(node: SvgNode): Bounds {
  switch (node.type) {
    case "rect":
      return { minX: node.x, minY: node.y, maxX: node.x + node.width, maxY: node.y + node.height };
    case "ellipse":
      return {
        minX: node.cx - node.rx,
        minY: node.cy - node.ry,
        maxX: node.cx + node.rx,
        maxY: node.cy + node.ry,
      };
    case "image":
      return { minX: node.x, minY: node.y, maxX: node.x + node.width, maxY: node.y + node.height };
    case "line":
      return {
        minX: Math.min(node.x1, node.x2),
        minY: Math.min(node.y1, node.y2),
        maxX: Math.max(node.x1, node.x2),
        maxY: Math.max(node.y1, node.y2),
      };
    case "polygon": {
      if (node.points.length === 0) return emptyBounds();
      let b = emptyBounds();
      for (const p of node.points) {
        b = {
          minX: Math.min(b.minX, p.x),
          minY: Math.min(b.minY, p.y),
          maxX: Math.max(b.maxX, p.x),
          maxY: Math.max(b.maxY, p.y),
        };
      }
      return b;
    }
    case "path":
      return approximatePathBounds(node.d);
    case "text": {
      const width = node.text.length * node.fontSize * TEXT_ADVANCE_FACTOR;
      const ascent = node.fontSize * 0.8;
      const descent = node.fontSize * 0.2;
      let minX = node.x;
      if (node.textAnchor === "middle") minX = node.x - width / 2;
      else if (node.textAnchor === "end") minX = node.x - width;
      return { minX, minY: node.y - ascent, maxX: minX + width, maxY: node.y + descent };
    }
    case "group":
      return emptyBounds();
    case "unknown":
      return emptyBounds();
  }
}

/** Resolve the world matrix (root -> node-local) for a node id. */
export function worldMatrix(doc: SvgDocumentModel, nodeId: string): Matrix2D {
  const chain: Matrix2D[] = [];
  let current: SvgNode | undefined = doc.nodes[nodeId];
  while (current) {
    chain.unshift(current.transform);
    current = current.parentId ? doc.nodes[current.parentId] : undefined;
  }
  if (chain.length === 0) return identityMatrix();
  return composeAll(...chain);
}

/** Parent world matrix (root -> parent-local); identity for root nodes. */
export function parentWorldMatrix(doc: SvgDocumentModel, nodeId: string): Matrix2D {
  const node = doc.nodes[nodeId];
  if (!node || !node.parentId) return identityMatrix();
  return worldMatrix(doc, node.parentId);
}

/** World-space (root user-unit) bounds of a node including its descendants. */
export function worldBounds(doc: SvgDocumentModel, nodeId: string): Bounds {
  const node = doc.nodes[nodeId];
  if (!node) return emptyBounds();
  const world = worldMatrix(doc, nodeId);

  if (node.type === "group") {
    const childBounds = node.childIds
      .map((id) => worldBounds(doc, id))
      .filter((b) => !isEmptyBounds(b));
    return childBounds.length ? unionAll(childBounds) : emptyBounds();
  }
  const self = localSelfBounds(node);
  if (isEmptyBounds(self)) return emptyBounds();
  return transformBounds(self, world);
}

/** Union of world bounds over a set of node ids (selection bounds). */
export function selectionWorldBounds(doc: SvgDocumentModel, nodeIds: string[]): Bounds {
  const list = nodeIds.map((id) => worldBounds(doc, id)).filter((b) => !isEmptyBounds(b));
  return list.length ? unionAll(list) : emptyBounds();
}

/** Center of a node's world bounds, or null if empty. */
export function worldCenter(doc: SvgDocumentModel, nodeId: string): Point | null {
  const b = worldBounds(doc, nodeId);
  if (isEmptyBounds(b)) return null;
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}
