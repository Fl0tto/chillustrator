/**
 * usePenTool — custom path construction (Pen tool).
 *
 * OWNED BY: Agent D (interactions). Drives a transient `penDraft` session:
 *  - click places anchors (straight segments),
 *  - click-drag creates a symmetric Bézier handle (curved segment),
 *  - a live preview runs from the last anchor to the pointer,
 *  - clicking the first anchor closes the path with a real Z,
 *  - Enter / double-click finishes an open path,
 *  - Escape cancels with NO history entry,
 *  - Backspace removes the last uncommitted anchor.
 *
 * Nothing touches history until the path is finished: one completed drawing =
 * exactly one `addNodeCommand` (HST-002). Smart Guides snap anchor placement
 * unless Alt is held (temporary bypass).
 */
import { useEffect, type RefObject } from "react";
import { useEditorStore, type PenDraftState } from "@/store/editorStore";
import { screenToRoot } from "@/geometry/viewport";
import type { Point } from "@/geometry/matrix";
import { createPath } from "@/model/factory";
import { addNodeCommand } from "@/commands/nodeCommands";
import { toGeometry, type EditablePath } from "@/geometry/editablePath";
import { serializePath } from "@/geometry/pathData";
import {
  collectSnapCandidates,
  snapPoint,
  type SnapCandidates,
} from "./snapping";

const PATH_PRECISION = 4;
const CLOSE_RADIUS_PX = 10;
const DRAG_PX = 4;
const SNAP_PX = 6;

type DraftAnchor = PenDraftState["anchors"][number];

function draftToEditable(anchors: DraftAnchor[], closed: boolean): EditablePath {
  return {
    subpaths: [
      {
        closed,
        anchors: anchors.map((a) => ({
          x: a.x,
          y: a.y,
          handleIn: a.handleIn,
          handleOut: a.handleOut,
          mode: a.handleIn || a.handleOut ? "smooth" : "corner",
        })),
      },
    ],
  };
}

export function usePenTool(hostRef: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const store = useEditorStore;

    let candidates: SnapCandidates | null = null;
    let dragging = false;
    let dragStart: Point | null = null;
    let activePointer = -1;

    const hostRect = () => host.getBoundingClientRect();
    const toRoot = (cx: number, cy: number): Point =>
      screenToRoot(cx, cy, hostRect(), store.getState().viewport);

    const snapThreshold = () => SNAP_PX / store.getState().viewport.zoom;
    const closeRadius = () => CLOSE_RADIUS_PX / store.getState().viewport.zoom;

    const ensureCandidates = (): SnapCandidates => {
      if (!candidates) candidates = collectSnapCandidates(store.getState().document, []);
      return candidates;
    };

    /** Snap a root point unless Alt bypasses; also publishes guides. */
    const snap = (p: Point, alt: boolean): Point => {
      if (alt || !store.getState().preferences.snapAlignment) {
        store.getState().setInteraction({ guides: [] });
        return p;
      }
      const r = snapPoint(p, ensureCandidates(), snapThreshold());
      store.getState().setInteraction({ guides: r.guides });
      return { x: r.x, y: r.y };
    };

    const draft = (): PenDraftState | null => store.getState().penDraft;

    const overStart = (p: Point): boolean => {
      const d = draft();
      if (!d || d.anchors.length < 2) return false;
      const first = d.anchors[0];
      return Math.hypot(p.x - first.x, p.y - first.y) <= closeRadius();
    };

    const finish = (closed: boolean) => {
      const d = draft();
      if (!d || d.anchors.length < 2) {
        store.getState().setPenDraft(null);
        store.getState().setInteraction({ guides: [] });
        return;
      }
      const geometry = toGeometry(draftToEditable(d.anchors, closed));
      const node = createPath({
        d: serializePath(geometry, PATH_PRECISION),
        name: "Path",
        style: store.getState().defaultStyle,
      });
      store.getState().apply(addNodeCommand(node, null, undefined, "Draw path"));
      store.getState().setPenDraft(null);
      store.getState().setInteraction({ guides: [] });
      store.getState().setSelection([node.id]);
      store.getState().setTool("node");
      candidates = null;
    };

    const cancel = () => {
      store.getState().setPenDraft(null);
      store.getState().setInteraction({ guides: [] });
      candidates = null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (store.getState().tool !== "pen" || e.button !== 0) return;
      e.preventDefault();
      host.setPointerCapture(e.pointerId);
      activePointer = e.pointerId;
      const p = snap(toRoot(e.clientX, e.clientY), e.altKey);

      const d = draft();
      if (d && overStart(p)) {
        finish(true);
        return;
      }
      const anchors: DraftAnchor[] = d ? [...d.anchors] : [];
      anchors.push({ x: p.x, y: p.y, handleIn: null, handleOut: null });
      store.getState().setPenDraft({ anchors, cursor: p, overStart: false });
      dragging = true;
      dragStart = p;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (store.getState().tool !== "pen") return;
      const raw = toRoot(e.clientX, e.clientY);

      if (dragging && dragStart && activePointer === e.pointerId) {
        // Build a symmetric handle on the anchor just placed.
        const d = draft();
        if (!d || d.anchors.length === 0) return;
        if (Math.hypot(raw.x - dragStart.x, raw.y - dragStart.y) < DRAG_PX / store.getState().viewport.zoom) {
          return;
        }
        const anchors = d.anchors.map((a) => ({ ...a }));
        const last = anchors[anchors.length - 1];
        last.handleOut = { x: raw.x, y: raw.y };
        last.handleIn = { x: 2 * last.x - raw.x, y: 2 * last.y - raw.y };
        store.getState().setPenDraft({ anchors, cursor: raw, overStart: false });
        return;
      }

      const p = snap(raw, e.altKey);
      const d = draft();
      if (d) {
        store.getState().setPenDraft({ ...d, cursor: p, overStart: overStart(p) });
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (activePointer === e.pointerId) {
        if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
        dragging = false;
        dragStart = null;
        activePointer = -1;
      }
    };

    const onDoubleClick = (e: MouseEvent) => {
      if (store.getState().tool !== "pen") return;
      if (draft()) {
        e.preventDefault();
        finish(false);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (store.getState().tool !== "pen") return;
      const d = draft();
      if (e.key === "Escape") {
        if (d) {
          e.preventDefault();
          cancel();
        }
        return;
      }
      if (e.key === "Enter") {
        if (d) {
          e.preventDefault();
          finish(false);
        }
        return;
      }
      if (e.key === "Backspace") {
        if (d && d.anchors.length > 0) {
          e.preventDefault();
          const anchors = d.anchors.slice(0, -1);
          if (anchors.length === 0) cancel();
          else store.getState().setPenDraft({ ...d, anchors });
        }
      }
    };

    host.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    host.addEventListener("dblclick", onDoubleClick);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      host.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      host.removeEventListener("dblclick", onDoubleClick);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [hostRef]);
}
