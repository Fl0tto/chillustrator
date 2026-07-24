/**
 * shapeBuilder — PURE creation-tool geometry.
 *
 * OWNED BY: Agent D (interactions). Turns a drag rectangle (start → end, in root
 * user units) into a fresh, unparented model node for the active creation tool.
 * Used both for the live preview (interaction.previewNode) and the committed node
 * so the preview matches exactly what gets created (one history entry, SHP/TXT).
 */
import { createEllipse, createLine, createPolygon, createRect, regularPolygonPoints } from "@/model/factory";
import type { Point } from "@/geometry/matrix";
import type { SvgNode } from "@/model/types";
import type { ToolId } from "@/store/editorStore";
import { MIN_SIZE } from "../transformController";

/**
 * Configurable polygon side count. There is no store field for this yet, so a
 * module-level default is used. The UI agent (Agent E) can call setPolygonSides()
 * to wire a side-count control without any model/store change.
 */
let polygonSides = 6;

export function getPolygonSides(): number {
  return polygonSides;
}

export function setPolygonSides(sides: number): void {
  polygonSides = Math.max(3, Math.round(sides));
}

/** Snap a line's end point to the nearest 45° increment about its start. */
export function snapLineAngle(start: Point, end: Point): Point {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const snapped = (Math.round(angle / (Math.PI / 4)) * Math.PI) / 4;
  const len = Math.hypot(end.x - start.x, end.y - start.y);
  return { x: start.x + Math.cos(snapped) * len, y: start.y + Math.sin(snapped) * len };
}

/**
 * Build the node for a creation drag. `constrain` (Shift) means:
 *  - rect/ellipse: lock to a square/circle,
 *  - line: snap to 45° increments,
 *  - polygon: (no effect — always regular).
 * Returns null for non-creation tools ("select"/"text" are handled by the hook).
 */
export function buildShape(
  tool: ToolId,
  start: Point,
  end: Point,
  constrain: boolean,
  sides: number = polygonSides,
): SvgNode | null {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  let w = Math.abs(end.x - start.x);
  let h = Math.abs(end.y - start.y);
  if (constrain && (tool === "rect" || tool === "ellipse")) {
    const s = Math.max(w, h);
    w = s;
    h = s;
  }
  switch (tool) {
    case "rect":
      return createRect({ x, y, width: Math.max(w, MIN_SIZE), height: Math.max(h, MIN_SIZE) });
    case "ellipse":
      return createEllipse({
        cx: x + w / 2,
        cy: y + h / 2,
        rx: Math.max(w / 2, MIN_SIZE / 2),
        ry: Math.max(h / 2, MIN_SIZE / 2),
      });
    case "line": {
      const e = constrain ? snapLineAngle(start, end) : end;
      return createLine({ x1: start.x, y1: start.y, x2: e.x, y2: e.y });
    }
    case "polygon": {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const radius = Math.max(Math.max(w, h) / 2, MIN_SIZE);
      return createPolygon({ points: regularPolygonPoints(cx, cy, radius, sides) });
    }
    default:
      return null;
  }
}
