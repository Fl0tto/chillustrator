/**
 * useCurveTool — chained, low-friction curved-path drawing.
 *
 * Interaction:
 *  - click once to establish a start point (or click-drag immediately),
 *  - drag from the current endpoint to place the next endpoint,
 *  - wheel while dragging changes ONLY that segment's signed bend,
 *  - crossing bend=0 flips the side/alignment of the curve,
 *  - Enter commits the whole chain as one PathNode / one history entry,
 *  - Escape or X cancels with no history entry,
 *  - Backspace removes the last placed segment.
 *
 * The output is a normal cubic PathNode; there is no parallel curve model.
 */
import { useEffect, type RefObject } from "react";
import { useEditorStore, type CurveDraftState } from "@/store/editorStore";
import { screenToRoot } from "@/geometry/viewport";
import type { Point } from "@/geometry/matrix";
import { createPath } from "@/model/factory";
import { addNodeCommand } from "@/commands/nodeCommands";
import { curvePathGeometry } from "@/geometry/curvePath";
import { serializePath } from "@/geometry/pathData";
import {
  collectSnapCandidates,
  snapPoint,
  snapToGrid,
  type SnapCandidates,
} from "./snapping";

const PATH_PRECISION = 4;
const MIN_DRAG_PX = 3;
const SNAP_PX = 6;
const WHEEL_BEND_SCALE = 0.12;

function lastPoint(draft: CurveDraftState): Point {
  return draft.points[draft.points.length - 1];
}

export function useCurveTool(hostRef: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const store = useEditorStore;

    let dragging = false;
    let activePointer = -1;
    let downClient: Point | null = null;
    let candidates: SnapCandidates | null = null;

    const hostRect = () => host.getBoundingClientRect();
    const toRoot = (cx: number, cy: number): Point =>
      screenToRoot(cx, cy, hostRect(), store.getState().viewport);
    const snapThreshold = () => SNAP_PX / store.getState().viewport.zoom;
    const draft = (): CurveDraftState | null => store.getState().curveDraft;

    const ensureCandidates = (): SnapCandidates => {
      if (!candidates) {
        candidates = collectSnapCandidates(store.getState().document, [], {
          viewport: (() => {
            const rect = hostRect();
            const tl = toRoot(rect.left, rect.top);
            const br = toRoot(rect.right, rect.bottom);
            return { minX: tl.x, minY: tl.y, maxX: br.x, maxY: br.y };
          })(),
        });
      }
      return candidates;
    };

    const snap = (p: Point, alt: boolean): Point => {
      const prefs = store.getState().preferences;
      if (alt) {
        store.getState().setInteraction({ guides: [] });
        return p;
      }

      let next = p;
      const guides = [];
      if (prefs.snapAlignment) {
        const r = snapPoint(next, ensureCandidates(), snapThreshold());
        next = { x: r.x, y: r.y };
        guides.push(...r.guides);
      }
      if (prefs.snapGrid) {
        next = {
          x: snapToGrid(next.x, prefs.gridSize),
          y: snapToGrid(next.y, prefs.gridSize),
        };
      }
      store.getState().setInteraction({ guides });
      return next;
    };

    const resetPointer = () => {
      if (activePointer >= 0 && host.hasPointerCapture(activePointer)) {
        host.releasePointerCapture(activePointer);
      }
      dragging = false;
      activePointer = -1;
      downClient = null;
    };

    const cancel = () => {
      resetPointer();
      store.getState().setCurveDraft(null);
      store.getState().setInteraction({ guides: [] });
      candidates = null;
    };

    const finish = () => {
      const d = draft();
      if (!d || d.points.length < 2) {
        cancel();
        return;
      }
      const node = createPath({
        d: serializePath(curvePathGeometry(d.points, d.bends), PATH_PRECISION),
        name: "Curve path",
        style: store.getState().defaultStyle,
      });
      store.getState().apply(addNodeCommand(node, null, undefined, "Draw curve path"));
      store.getState().setCurveDraft(null);
      store.getState().setInteraction({ guides: [] });
      store.getState().setSelection([node.id]);
      store.getState().setTool("node");
      candidates = null;
      resetPointer();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (store.getState().tool !== "curve" || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      host.setPointerCapture(e.pointerId);
      activePointer = e.pointerId;
      downClient = { x: e.clientX, y: e.clientY };
      dragging = true;

      const p = snap(toRoot(e.clientX, e.clientY), e.altKey);
      const current = draft();
      if (!current) {
        store.getState().setCurveDraft({
          points: [p],
          bends: [],
          cursor: p,
          activeBend: 0,
        });
      } else {
        store.getState().setCurveDraft({
          ...current,
          cursor: p,
          activeBend: 0,
        });
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (
        store.getState().tool !== "curve" ||
        !dragging ||
        activePointer !== e.pointerId
      ) {
        return;
      }
      const d = draft();
      if (!d) return;
      const p = snap(toRoot(e.clientX, e.clientY), e.altKey);
      store.getState().setCurveDraft({ ...d, cursor: p });
    };

    const onWheel = (e: WheelEvent) => {
      if (store.getState().tool !== "curve" || !dragging) return;
      const d = draft();
      if (!d || !d.cursor || d.points.length === 0) return;

      e.preventDefault();
      e.stopPropagation();

      const start = lastPoint(d);
      const chord = Math.hypot(d.cursor.x - start.x, d.cursor.y - start.y);
      if (chord < 1e-6) return;

      const zoom = Math.max(store.getState().viewport.zoom, 1e-6);
      const fine = e.shiftKey ? 0.25 : 1;
      const delta = -e.deltaY * WHEEL_BEND_SCALE * fine / zoom;
      const limit = Math.max(chord * 1.5, 20 / zoom);
      const activeBend = Math.max(-limit, Math.min(limit, d.activeBend + delta));
      store.getState().setCurveDraft({ ...d, activeBend });
    };

    const onPointerUp = (e: PointerEvent) => {
      if (activePointer !== e.pointerId) return;
      const d = draft();
      const moved =
        downClient !== null &&
        Math.hypot(e.clientX - downClient.x, e.clientY - downClient.y) >= MIN_DRAG_PX;

      if (d && moved) {
        const end = snap(toRoot(e.clientX, e.clientY), e.altKey);
        const start = lastPoint(d);
        if (Math.hypot(end.x - start.x, end.y - start.y) > 1e-6) {
          store.getState().setCurveDraft({
            points: [...d.points, end],
            bends: [...d.bends, d.activeBend],
            cursor: null,
            activeBend: 0,
          });
        } else {
          store.getState().setCurveDraft({ ...d, cursor: null, activeBend: 0 });
        }
      } else if (d) {
        // A simple first click establishes the start point without creating a
        // zero-length segment.
        store.getState().setCurveDraft({ ...d, cursor: null, activeBend: 0 });
      }

      store.getState().setInteraction({ guides: [] });
      resetPointer();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (store.getState().tool !== "curve") return;
      const d = draft();
      const key = e.key.toLowerCase();

      if (e.key === "Escape" || key === "x") {
        if (d) {
          e.preventDefault();
          cancel();
        }
        return;
      }
      if (e.key === "Enter") {
        if (d) {
          e.preventDefault();
          finish();
        }
        return;
      }
      if (e.key === "Backspace" && d) {
        e.preventDefault();
        if (d.points.length <= 1) {
          cancel();
          return;
        }
        store.getState().setCurveDraft({
          points: d.points.slice(0, -1),
          bends: d.bends.slice(0, -1),
          cursor: null,
          activeBend: 0,
        });
      }
    };

    host.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    host.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);

    return () => {
      host.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      host.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [hostRef]);
}
