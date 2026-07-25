/**
 * Pure `d`-string builders for the Pen-tool live preview (root coordinates).
 * Extracted so they are unit-testable without a DOM.
 */
import type { Point } from "@/geometry/matrix";
import { toGeometry } from "@/geometry/editablePath";
import { serializePath } from "@/geometry/pathData";

interface DraftAnchor {
  x: number;
  y: number;
  handleIn: Point | null;
  handleOut: Point | null;
}

/** `d` for the committed portion of a draft (open polyline/curve). */
export function draftPreviewD(anchors: DraftAnchor[]): string | null {
  if (anchors.length < 2) return null;
  const geometry = toGeometry({
    subpaths: [
      {
        closed: false,
        anchors: anchors.map((a) => ({
          x: a.x,
          y: a.y,
          handleIn: a.handleIn,
          handleOut: a.handleOut,
          mode: a.handleIn || a.handleOut ? "smooth" : "corner",
        })),
      },
    ],
  });
  return serializePath(geometry, 3);
}

/** `d` for the rubber-band segment from the last anchor to the cursor. */
export function draftSegmentD(last: DraftAnchor, cursor: Point): string {
  if (last.handleOut) {
    return `M${last.x} ${last.y}C${last.handleOut.x} ${last.handleOut.y} ${cursor.x} ${cursor.y} ${cursor.x} ${cursor.y}`;
  }
  return `M${last.x} ${last.y}L${cursor.x} ${cursor.y}`;
}
