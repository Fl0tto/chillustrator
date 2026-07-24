/**
 * useCanvasController — wires pointer / wheel / keyboard interaction to the store.
 *
 * OWNED BY: Agent D (interactions). Composes the pure controllers in this folder
 * (transformController, marqueeController, snapping, tools/shapeBuilder) into the
 * live gesture state machine mounted by CanvasStage.
 *
 * PERFORMANCE CONTRACT (PERF-001/002, HST-002): high-frequency pointer moves
 * update the DOM directly (transient `setAttribute("transform", …)`) plus only
 * lightweight overlay state in the store (interaction.marquee / previewNode /
 * isGesture). EXACTLY ONE command is committed via store.apply(...) on pointer
 * release → one undo entry. The full store is never written per pointer move.
 */
import { useEffect, type RefObject } from "react";
import { useEditorStore } from "@/store/editorStore";
import { screenToRoot, zoomAtPoint } from "@/geometry/viewport";
import {
  identityMatrix,
  invert,
  multiply,
  translate,
  toSvgTransform,
  type Point,
} from "@/geometry/matrix";
import { parentWorldMatrix, selectionWorldBounds } from "@/geometry/nodeGeometry";
import { isEmptyBounds, boundsCenter, type Bounds } from "@/geometry/bounds";
import { createText } from "@/model/factory";
import { addNodeCommand, deleteNodesCommand, duplicateNodesCommand } from "@/commands/nodeCommands";
import { groupNodesCommand, ungroupCommand } from "@/commands/layerCommands";
import { transaction } from "@/commands/command";
import { applyWorldTransformCommand } from "@/commands/transformCommands";
import { isEffectivelyLocked } from "@/model/tree";
import type { HandleId } from "./handles";
import {
  angleOf,
  computeResizeWorld,
  resizeAnchor,
  rotateWorld,
  rotationDegrees,
  snapDegrees,
} from "./transformController";
import { marqueeBounds, marqueeHits } from "./marqueeController";
import { buildShape } from "./tools/shapeBuilder";
import { collectSnapCandidates, snapMoveDelta, type SnapCandidates } from "./snapping";
import type { Matrix2D } from "@/model/types";

const MIN_DRAG = 3; // px before a click becomes a drag
const SNAP_PX = 6; // move-snap threshold in screen pixels

type GestureKind = "idle" | "move" | "marquee" | "create" | "resize" | "rotate" | "pan";

interface NodeSnapshot {
  id: string;
  local: Matrix2D;
  parentInv: Matrix2D;
  parent: Matrix2D;
}

interface Gesture {
  kind: GestureKind;
  startClient: Point;
  startRoot: Point;
  moved: boolean;
  pointerId: number;
  // move/resize/rotate
  snapshots: NodeSnapshot[];
  // move (snapping)
  selBounds?: Bounds;
  snapCandidates?: SnapCandidates;
  // resize
  handle?: HandleId;
  anchor?: Point; // fixed point (root)
  startBounds?: Bounds;
  // rotate
  center?: Point;
  startAngle?: number;
  // create
  createStart?: Point;
  // pan
  startPan?: { x: number; y: number };
}

function idle(): Gesture {
  return {
    kind: "idle",
    startClient: { x: 0, y: 0 },
    startRoot: { x: 0, y: 0 },
    moved: false,
    pointerId: -1,
    snapshots: [],
  };
}

export function useCanvasController(
  hostRef: RefObject<HTMLDivElement | null>,
  svgRef: RefObject<SVGSVGElement | null>,
): void {
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const store = useEditorStore;

    let gesture = idle();
    let spaceDown = false;

    const hostRect = () => host.getBoundingClientRect();
    const toRoot = (clientX: number, clientY: number): Point =>
      screenToRoot(clientX, clientY, hostRect(), store.getState().viewport);

    const snapshot = (ids: string[]): NodeSnapshot[] => {
      const doc = store.getState().document;
      return ids
        .map((id) => {
          const node = doc.nodes[id];
          if (!node) return null;
          const parent = parentWorldMatrix(doc, id);
          return { id, local: node.transform, parent, parentInv: invert(parent) ?? identityMatrix() };
        })
        .filter((s): s is NodeSnapshot => s !== null);
    };

    const elementFor = (id: string): SVGGraphicsElement | null => {
      const root = svgRef.current;
      if (!root) return null;
      return root.querySelector<SVGGraphicsElement>(`[data-node-id="${CSS.escape(id)}"]`);
    };

    /** Apply a world-space transform D to snapshotted elements directly (transient). */
    const applyTransient = (world: Matrix2D) => {
      for (const snap of gesture.snapshots) {
        const next = multiply(multiply(multiply(snap.parentInv, world), snap.parent), snap.local);
        const el = elementFor(snap.id);
        if (el) el.setAttribute("transform", toSvgTransform(next));
      }
    };

    /** Revert transient DOM writes back to the model's local transforms (cancel). */
    const restoreTransient = () => {
      for (const snap of gesture.snapshots) {
        const el = elementFor(snap.id);
        if (el) el.setAttribute("transform", toSvgTransform(snap.local));
      }
    };

    const beginGesture = () => {
      if (!store.getState().interaction.isGesture) store.getState().setInteraction({ isGesture: true });
    };

    const endGesture = () => {
      const patch: Record<string, unknown> = {};
      const it = store.getState().interaction;
      if (it.isGesture) patch.isGesture = false;
      if (it.marquee) patch.marquee = null;
      if (it.previewNode) patch.previewNode = null;
      if (Object.keys(patch).length) store.getState().setInteraction(patch);
      gesture = idle();
    };

    /** Cancel an in-progress gesture, restoring any transient DOM (Escape). */
    const cancelGesture = () => {
      if (gesture.kind === "move" || gesture.kind === "resize" || gesture.kind === "rotate") {
        restoreTransient();
      }
      if (gesture.pointerId >= 0 && host.hasPointerCapture(gesture.pointerId)) {
        host.releasePointerCapture(gesture.pointerId);
      }
      endGesture();
    };

    /** Root-space snap threshold for the move gesture. */
    const snapThreshold = () => SNAP_PX / store.getState().viewport.zoom;

    const selectableAt = (target: EventTarget | null): string | null => {
      if (!(target instanceof Element)) return null;
      const el = target.closest("[data-node-id]");
      if (!el) return null;
      const id = el.getAttribute("data-node-id");
      if (!id) return null;
      const doc = store.getState().document;
      if (!doc.nodes[id] || isEffectivelyLocked(doc, id)) return null;
      // Resolve to the top-most ancestor (select the whole group, not a child).
      let current = doc.nodes[id];
      while (current.parentId && doc.nodes[current.parentId]) {
        current = doc.nodes[current.parentId]!;
      }
      return current.id;
    };

    // ---- pointer down -------------------------------------------------------
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      const state = store.getState();
      const root = toRoot(e.clientX, e.clientY);
      gesture = { ...idle(), startClient: { x: e.clientX, y: e.clientY }, startRoot: root, pointerId: e.pointerId };
      host.setPointerCapture(e.pointerId);

      // Pan: middle mouse or space-drag.
      if (e.button === 1 || spaceDown) {
        gesture.kind = "pan";
        gesture.startPan = { x: state.viewport.panX, y: state.viewport.panY };
        beginGesture();
        return;
      }

      // Shape Builder owns left-click while active (see useShapeBuilder).
      if (state.tool === "build") {
        gesture = idle();
        return;
      }

      // Resize / rotate handle?
      const targetEl = e.target as Element | null;
      const handleEl = targetEl?.closest?.("[data-handle],[data-rotate]") as Element | null;
      if (handleEl && state.selection.length > 0) {
        const b = selectionWorldBounds(state.document, state.selection);
        if (!isEmptyBounds(b)) {
          gesture.snapshots = snapshot(state.selection);
          if (handleEl.hasAttribute("data-rotate")) {
            gesture.kind = "rotate";
            gesture.center = boundsCenter(b);
            gesture.startAngle = angleOf(gesture.center, root);
          } else {
            const handle = handleEl.getAttribute("data-handle") as HandleId;
            gesture.kind = "resize";
            gesture.handle = handle;
            gesture.startBounds = b;
            gesture.anchor = resizeAnchor(b, handle);
          }
          beginGesture();
          return;
        }
      }

      // Creation tools.
      if (state.tool !== "select") {
        if (state.tool === "text") {
          const node = createText({ x: root.x, y: root.y, text: "Text" });
          store.getState().apply(addNodeCommand(node, null, undefined, "Add text"));
          store.getState().setSelection([node.id]);
          store.getState().setEditingText(node.id);
          store.getState().setTool("select");
          gesture = idle();
          return;
        }
        gesture.kind = "create";
        gesture.createStart = root;
        beginGesture();
        return;
      }

      // Select tool: hit test.
      const hitId = selectableAt(e.target);
      if (hitId) {
        if (e.shiftKey) {
          store.getState().toggleSelection(hitId);
        } else if (!state.selection.includes(hitId)) {
          store.getState().setSelection([hitId]);
        }
        // Begin move of the (possibly updated) selection.
        const sel = store.getState().selection;
        gesture.kind = "move";
        gesture.snapshots = snapshot(sel);
        gesture.selBounds = selectionWorldBounds(store.getState().document, sel);
        if (store.getState().preferences.snapEnabled) {
          gesture.snapCandidates = collectSnapCandidates(store.getState().document, sel);
        }
        beginGesture();
      } else {
        // Empty space → marquee (or clear on click).
        if (!e.shiftKey) store.getState().clearSelection();
        gesture.kind = "marquee";
        beginGesture();
      }
    };

    /** Snapped (dx, dy) for the active move gesture. */
    const moveDelta = (root: Point): { dx: number; dy: number } => {
      const dx = root.x - gesture.startRoot.x;
      const dy = root.y - gesture.startRoot.y;
      if (gesture.snapCandidates && gesture.selBounds && store.getState().preferences.snapEnabled) {
        return snapMoveDelta(gesture.selBounds, dx, dy, gesture.snapCandidates, snapThreshold());
      }
      return { dx, dy };
    };

    // ---- pointer move -------------------------------------------------------
    const onPointerMove = (e: PointerEvent) => {
      if (gesture.pointerId !== e.pointerId || gesture.kind === "idle") return;
      const root = toRoot(e.clientX, e.clientY);
      const dxClient = e.clientX - gesture.startClient.x;
      const dyClient = e.clientY - gesture.startClient.y;
      if (!gesture.moved && Math.hypot(dxClient, dyClient) < MIN_DRAG) return;
      gesture.moved = true;

      switch (gesture.kind) {
        case "pan": {
          if (!gesture.startPan) break;
          store.getState().setViewport({
            panX: gesture.startPan.x + dxClient,
            panY: gesture.startPan.y + dyClient,
          });
          break;
        }
        case "move": {
          const { dx, dy } = moveDelta(root);
          applyTransient(translate(dx, dy));
          break;
        }
        case "marquee": {
          store.getState().setInteraction({
            marquee: {
              x: Math.min(gesture.startRoot.x, root.x),
              y: Math.min(gesture.startRoot.y, root.y),
              width: Math.abs(root.x - gesture.startRoot.x),
              height: Math.abs(root.y - gesture.startRoot.y),
            },
          });
          break;
        }
        case "resize": {
          if (!gesture.anchor || !gesture.startBounds || !gesture.handle) break;
          applyTransient(computeResizeWorld(gesture.startBounds, gesture.anchor, gesture.handle, root, e.shiftKey));
          break;
        }
        case "rotate": {
          if (!gesture.center || gesture.startAngle === undefined) break;
          let deg = rotationDegrees(gesture.center, gesture.startAngle, root);
          if (e.shiftKey) deg = snapDegrees(deg, 15);
          applyTransient(rotateWorld(gesture.center, deg));
          break;
        }
        case "create": {
          if (!gesture.createStart) break;
          const preview = buildShape(store.getState().tool, gesture.createStart, root, e.shiftKey);
          store.getState().setInteraction({ previewNode: preview });
          break;
        }
      }
    };

    // ---- pointer up ---------------------------------------------------------
    const onPointerUp = (e: PointerEvent) => {
      if (gesture.pointerId !== e.pointerId) return;
      if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
      const root = toRoot(e.clientX, e.clientY);
      const s = store.getState();

      switch (gesture.kind) {
        case "move": {
          if (gesture.moved) {
            const { dx, dy } = moveDelta(root);
            if (dx !== 0 || dy !== 0) {
              const ids = gesture.snapshots.map((sn) => sn.id);
              s.apply(applyWorldTransformCommand(ids, translate(dx, dy), "Move"));
            }
          }
          break;
        }
        case "resize": {
          if (gesture.moved && gesture.anchor && gesture.startBounds && gesture.handle) {
            const world = computeResizeWorld(gesture.startBounds, gesture.anchor, gesture.handle, root, e.shiftKey);
            const ids = gesture.snapshots.map((sn) => sn.id);
            s.apply(applyWorldTransformCommand(ids, world, "Resize"));
          }
          break;
        }
        case "rotate": {
          if (gesture.moved && gesture.center && gesture.startAngle !== undefined) {
            let deg = rotationDegrees(gesture.center, gesture.startAngle, root);
            if (e.shiftKey) deg = snapDegrees(deg, 15);
            const ids = gesture.snapshots.map((sn) => sn.id);
            s.apply(applyWorldTransformCommand(ids, rotateWorld(gesture.center, deg), "Rotate"));
          }
          break;
        }
        case "marquee": {
          if (gesture.moved && s.interaction.marquee) {
            const m = s.interaction.marquee;
            const box = marqueeBounds(m.x, m.y, m.x + m.width, m.y + m.height);
            const hits = marqueeHits(s.document, box);
            if (e.shiftKey) s.addToSelection(hits);
            else s.setSelection(hits);
          }
          break;
        }
        case "create": {
          if (gesture.moved && gesture.createStart) {
            const node = buildShape(s.tool, gesture.createStart, root, e.shiftKey);
            if (node) {
              s.apply(addNodeCommand(node, null, undefined, "Add object"));
              s.setSelection([node.id]);
              s.setTool("select");
            }
          }
          break;
        }
      }
      endGesture();
    };

    // ---- wheel zoom ---------------------------------------------------------
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const vp = store.getState().viewport;
      const rect = hostRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      if (e.ctrlKey || e.metaKey || !e.shiftKey) {
        const factor = Math.exp(-e.deltaY * 0.0015);
        store.getState().setViewport(zoomAtPoint(vp, localX, localY, vp.zoom * factor));
      } else {
        store.getState().setViewport({ panX: vp.panX - e.deltaX, panY: vp.panY - e.deltaY });
      }
    };

    // ---- keyboard -----------------------------------------------------------
    const isTypingTarget = (t: EventTarget | null): boolean => {
      const el = t as HTMLElement | null;
      const tag = el?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || Boolean(el?.isContentEditable);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Never hijack shortcuts while typing in a field.
      if (isTypingTarget(e.target)) return;

      if (e.key === " ") {
        spaceDown = true;
        e.preventDefault();
        return;
      }
      const s = store.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Undo / redo (HST-010).
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        s.redo();
        return;
      }
      // Duplicate.
      if (mod && key === "d") {
        e.preventDefault();
        if (s.selection.length > 0) {
          let newIds: string[] = [];
          s.apply(duplicateNodesCommand(s.selection, { x: 16, y: 16 }, (ids) => (newIds = ids)));
          if (newIds.length) s.setSelection(newIds);
        }
        return;
      }
      // Group / ungroup.
      if (mod && key === "g") {
        e.preventDefault();
        if (e.shiftKey) {
          const groups = s.selection.filter((id) => s.document.nodes[id]?.type === "group");
          if (groups.length) {
            const childOut: string[] = [];
            const cmds = groups.map((gid) =>
              ungroupCommand(gid, (ids) => childOut.push(...ids)),
            );
            s.apply(cmds.length === 1 ? cmds[0] : transaction("Ungroup", cmds));
            if (childOut.length) s.setSelection(childOut);
          }
        } else if (s.selection.length > 0) {
          let groupId = "";
          s.apply(groupNodesCommand(s.selection, (id) => (groupId = id)));
          if (groupId) s.setSelection([groupId]);
        }
        return;
      }
      // Cancel / back-to-select.
      if (e.key === "Escape") {
        e.preventDefault();
        if (gesture.kind !== "idle") cancelGesture();
        else s.setInteraction({ previewNode: null, marquee: null });
        s.setTool("select");
        return;
      }
      // Delete.
      if ((e.key === "Delete" || e.key === "Backspace") && s.selection.length > 0) {
        e.preventDefault();
        s.apply(deleteNodesCommand(s.selection));
        s.clearSelection();
        return;
      }
      // Arrow-key nudge (Shift ×10).
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      if (nudge[e.key] && s.selection.length > 0) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const [nx, ny] = nudge[e.key];
        s.apply(applyWorldTransformCommand(s.selection, translate(nx * step, ny * step), "Nudge"));
        return;
      }
      // Tool shortcuts (no modifier).
      if (!mod && !e.altKey) {
        const tools: Record<string, () => void> = {
          v: () => s.setTool("select"),
          r: () => s.setTool("rect"),
          e: () => s.setTool("ellipse"),
          l: () => s.setTool("line"),
          p: () => s.setTool("polygon"),
          t: () => s.setTool("text"),
          b: () => s.setTool("build"),
        };
        const fn = tools[key];
        if (fn) fn();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") spaceDown = false;
    };

    host.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    host.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      host.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      host.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [hostRef, svgRef]);
}
