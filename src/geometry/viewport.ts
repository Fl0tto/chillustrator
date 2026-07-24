/**
 * Viewport <-> root-SVG coordinate conversion.
 *
 * The artwork <svg> is displayed with a CSS/transform mapping controlled by the
 * store's Viewport { zoom, panX, panY }. Screen pixels relate to root user units
 * by:  screen = user * zoom + pan.  Hence: user = (screen - pan) / zoom.
 *
 * `panX/panY` are in screen pixels relative to the canvas host's top-left.
 */
import type { Viewport } from "@/store/editorStore";
import type { Point } from "./matrix";

/** Convert a point in the canvas host's client space to root user units. */
export function screenToRoot(
  clientX: number,
  clientY: number,
  hostRect: DOMRect,
  viewport: Viewport,
): Point {
  const localX = clientX - hostRect.left;
  const localY = clientY - hostRect.top;
  return {
    x: (localX - viewport.panX) / viewport.zoom,
    y: (localY - viewport.panY) / viewport.zoom,
  };
}

/** Convert a point in root user units to the canvas host's client space. */
export function rootToScreen(
  x: number,
  y: number,
  hostRect: DOMRect,
  viewport: Viewport,
): Point {
  return {
    x: x * viewport.zoom + viewport.panX + hostRect.left,
    y: y * viewport.zoom + viewport.panY + hostRect.top,
  };
}

/** Convert a point in root user units to host-local pixels (for overlay). */
export function rootToLocal(x: number, y: number, viewport: Viewport): Point {
  return { x: x * viewport.zoom + viewport.panX, y: y * viewport.zoom + viewport.panY };
}

/** Zoom while keeping the given host-local anchor point stationary. */
export function zoomAtPoint(
  viewport: Viewport,
  anchorLocalX: number,
  anchorLocalY: number,
  nextZoom: number,
  minZoom = 0.02,
  maxZoom = 64,
): Viewport {
  const zoom = Math.max(minZoom, Math.min(maxZoom, nextZoom));
  // Keep the user-space point under the anchor fixed on screen.
  const userX = (anchorLocalX - viewport.panX) / viewport.zoom;
  const userY = (anchorLocalY - viewport.panY) / viewport.zoom;
  return {
    zoom,
    panX: anchorLocalX - userX * zoom,
    panY: anchorLocalY - userY * zoom,
  };
}

/** Compute a viewport that fits a root-user-space rect into the host with margin. */
export function fitToRect(
  rect: { x: number; y: number; width: number; height: number },
  hostWidth: number,
  hostHeight: number,
  margin = 40,
): Viewport {
  const availW = Math.max(1, hostWidth - margin * 2);
  const availH = Math.max(1, hostHeight - margin * 2);
  const zoom = Math.max(0.02, Math.min(64, Math.min(availW / rect.width, availH / rect.height)));
  const panX = (hostWidth - rect.width * zoom) / 2 - rect.x * zoom;
  const panY = (hostHeight - rect.height * zoom) / 2 - rect.y * zoom;
  return { zoom, panX, panY };
}
