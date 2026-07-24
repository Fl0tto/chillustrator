/**
 * Pixel-accurate geometry read from the live artwork SVG DOM.
 *
 * Using getBBox()/getCTM() for MEASUREMENT and hit-testing is explicitly allowed
 * (native browser hit testing, spec §4.7). The DOM is never treated as the
 * document source of truth — these helpers only read geometry that the model
 * cannot compute precisely (text metrics, curved paths).
 */
import { applyToPoint, type Point } from "./matrix";
import { emptyBounds, extendBounds, type Bounds } from "./bounds";
import type { Matrix2D } from "@/model/types";

function domMatrixToMatrix2D(m: DOMMatrix): Matrix2D {
  return { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f };
}

/** Find the rendered artwork element for a node id within a root svg. */
export function findNodeElement(root: SVGSVGElement, nodeId: string): SVGGraphicsElement | null {
  return root.querySelector<SVGGraphicsElement>(`[data-node-id="${CSS.escape(nodeId)}"]`);
}

/**
 * Accurate world (root user-unit) bounds of a rendered node, or null if the
 * element is not present / not measurable.
 */
export function measureNodeRootBounds(root: SVGSVGElement, nodeId: string): Bounds | null {
  const el = findNodeElement(root, nodeId);
  if (!el) return null;
  let bbox: DOMRect;
  try {
    bbox = el.getBBox();
  } catch {
    return null;
  }
  // Matrix mapping the element's local coordinates into the root's user space.
  const ctm = getLocalToRootMatrix(root, el);
  if (!ctm) return null;
  const corners: Point[] = [
    { x: bbox.x, y: bbox.y },
    { x: bbox.x + bbox.width, y: bbox.y },
    { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
    { x: bbox.x, y: bbox.y + bbox.height },
  ];
  let out = emptyBounds();
  for (const c of corners) out = extendBounds(out, applyToPoint(ctm, c));
  return out;
}

/** Matrix from an element's local coordinates to the root svg user space. */
export function getLocalToRootMatrix(
  root: SVGSVGElement,
  el: SVGGraphicsElement,
): Matrix2D | null {
  const rootCTM = root.getScreenCTM();
  const elCTM = el.getScreenCTM();
  if (!rootCTM || !elCTM) return null;
  const local = rootCTM.inverse().multiply(elCTM);
  return domMatrixToMatrix2D(local);
}

export { domMatrixToMatrix2D };
