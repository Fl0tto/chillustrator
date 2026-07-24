/**
 * useCanvasController — wires pointer / wheel / keyboard interaction to the store.
 *
 * OWNED BY: Agent D (interactions). Seeded by the orchestrator with a working
 * baseline (select, move, marquee, create, resize, rotate, zoom, pan, keyboard)
 * so the app functions end-to-end. Agent D refines: aspect-ratio & angle
 * snapping polish, per-tool options, snapping to guides, pen/text editing, etc.
 *
 * PERFORMANCE CONTRACT (PERF-001/002): high-frequency pointer moves update the
 * DOM directly (transient) and the store only for lightweight overlay state.
 * Exactly one command is committed on pointer release → one undo entry (HST-002).
 */
import { useEffect, type RefObject } from "react";
import { useEditorStore } from "@/store/editorStore";
import { screenToRoot, zoomAtPoint } from "@/geometry/viewport";
import {
  identityMatrix,
  invert,
  multiply,
  rotate,
  scale,
  translate,
  toSvgTransform,
  type Point,
} from "@/geometry/matrix";
import { parentWorldMatrix, selectionWorldBounds } from "@/geometry/nodeGeometry";
import { isEmptyBounds, boundsContainBounds, boundsCenter, type Bounds } from "@/geometry/bounds";
import { createEllipse, createLine, createPolygon, createRect, createText, regularPolygonPoints } from "@/model/factory";
import { addNodeCommand, deleteNodesCommand } from "@/commands/nodeCommands";
import { applyWorldTransformCommand } from "@/commands/transformCommands";
import { isEffectivelyLocked } from "@/model/tree";
import { OPPOSITE_HANDLE, type HandleId } from "./handles";
import type { Matrix2D, SvgNode } from "@/model/types";

const MIN_DRAG = 3; // px before a click becomes a drag
const MIN_SIZE = 2; // min shape/resize size in root units
const POLYGON_SIDES = 6;

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

    /** Apply a world-space transform D to snapshotted elements directly (transient). */
    const applyTransient = (world: Matrix2D) => {
      const root = svgRef.current;
      if (!root) return;
      for (const snap of gesture.snapshots) {
        const next = multiply(multiply(multiply(snap.parentInv, world), snap.parent), snap.local);
        const el = root.querySelector<SVGGraphicsElement>(`[data-node-id="${CSS.escape(snap.id)}"]`);
        if (el) el.setAttribute("transform", toSvgTransform(next));
      }
    };

    const selectableAt = (target: EventTarget | null): string | null => {
      if (!(target instanceof Element)) return null;
      const el = target.closest("[data-node-id]");
      if (!el) return null;
      const id = el.getAttribute("data-node-id");
      if (!id) return null;
      const doc = store.getState().document;
      if (!doc.nodes[id] || isEffectivelyLocked(doc, id)) return null;
      // Resolve to the topmost selectable ancestor that is a direct/root child
      // unless already inside a selected group (simple model: select top-most).
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
            gesture.startAngle = Math.atan2(root.y - gesture.center.y, root.x - gesture.center.x);
          } else {
            const handle = handleEl.getAttribute("data-handle") as HandleId;
            gesture.kind = "resize";
            gesture.handle = handle;
            gesture.startBounds = b;
            const opp = OPPOSITE_HANDLE[handle];
            const fx = opp.includes("w") ? b.minX : opp.includes("e") ? b.maxX : (b.minX + b.maxX) / 2;
            const fy = opp.includes("n") ? b.minY : opp.includes("s") ? b.maxY : (b.minY + b.maxY) / 2;
            gesture.anchor = { x: fx, y: fy };
          }
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
      } else {
        // Empty space → marquee (or clear on click).
        if (!e.shiftKey) store.getState().clearSelection();
        gesture.kind = "marquee";
      }
    };

    // ---- pointer move -------------------------------------------------------
    const onPointerMove = (e: PointerEvent) => {
      if (gesture.pointerId !== e.pointerId || gesture.kind === "idle") return;
      const root = toRoot(e.clientX, e.clientY);
      const dxRoot = root.x - gesture.startRoot.x;
      const dyRoot = root.y - gesture.startRoot.y;
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
          applyTransient(translate(dxRoot, dyRoot));
          break;
        }
        case "marquee": {
          store.getState().setInteraction({
            marquee: {
              x: Math.min(gesture.startRoot.x, root.x),
              y: Math.min(gesture.startRoot.y, root.y),
              width: Math.abs(dxRoot),
              height: Math.abs(dyRoot),
            },
          });
          break;
        }
        case "resize": {
          if (!gesture.anchor || !gesture.startBounds || !gesture.handle) break;
          const world = resizeWorld(gesture.startBounds, gesture.anchor, gesture.handle, root, e.shiftKey);
          applyTransient(world);
          break;
        }
        case "rotate": {
          if (!gesture.center || gesture.startAngle === undefined) break;
          let ang = Math.atan2(root.y - gesture.center.y, root.x - gesture.center.x) - gesture.startAngle;
          let deg = (ang * 180) / Math.PI;
          if (e.shiftKey) deg = Math.round(deg / 15) * 15;
          applyTransient(rotate(deg, gesture.center.x, gesture.center.y));
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
            const dx = root.x - gesture.startRoot.x;
            const dy = root.y - gesture.startRoot.y;
            const ids = gesture.snapshots.map((sn) => sn.id);
            s.apply(applyWorldTransformCommand(ids, translate(dx, dy), "Move"));
          }
          break;
        }
        case "resize": {
          if (gesture.moved && gesture.anchor && gesture.startBounds && gesture.handle) {
            const world = resizeWorld(gesture.startBounds, gesture.anchor, gesture.handle, root, e.shiftKey);
            const ids = gesture.snapshots.map((sn) => sn.id);
            s.apply(applyWorldTransformCommand(ids, world, "Resize"));
          }
          break;
        }
        case "rotate": {
          if (gesture.moved && gesture.center && gesture.startAngle !== undefined) {
            let ang = Math.atan2(root.y - gesture.center.y, root.x - gesture.center.x) - gesture.startAngle;
            let deg = (ang * 180) / Math.PI;
            if (e.shiftKey) deg = Math.round(deg / 15) * 15;
            const ids = gesture.snapshots.map((sn) => sn.id);
            s.apply(applyWorldTransformCommand(ids, rotate(deg, gesture.center.x, gesture.center.y), "Rotate"));
          }
          break;
        }
        case "marquee": {
          if (gesture.moved) {
            const m = s.interaction.marquee;
            if (m) {
              const box: Bounds = { minX: m.x, minY: m.y, maxX: m.x + m.width, maxY: m.y + m.height };
              const hits = s.document.rootNodeIds.filter((id) => {
                const nb = selectionWorldBounds(s.document, [id]);
                return !isEmptyBounds(nb) && boundsContainBounds(box, nb);
              });
              if (e.shiftKey) s.addToSelection(hits);
              else s.setSelection(hits);
            }
          }
          s.setInteraction({ marquee: null });
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
          s.setInteraction({ previewNode: null });
          break;
        }
      }
      gesture = idle();
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
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement | null)?.isContentEditable) {
        if (e.key === " ") return;
      }
      if (e.key === " ") {
        spaceDown = true;
        return;
      }
      const s = store.getState();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        s.redo();
        return;
      }
      if (e.key === "Escape") {
        s.setInteraction({ previewNode: null, marquee: null });
        s.setTool("select");
        gesture = idle();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && s.selection.length > 0) {
        e.preventDefault();
        s.apply(deleteNodesCommand(s.selection));
        s.clearSelection();
        return;
      }
      // Arrow-key nudge.
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
      // Tool shortcuts.
      if (!mod) {
        const tools: Record<string, () => void> = {
          v: () => s.setTool("select"),
          r: () => s.setTool("rect"),
          e: () => s.setTool("ellipse"),
          l: () => s.setTool("line"),
          p: () => s.setTool("polygon"),
          t: () => s.setTool("text"),
        };
        const fn = tools[e.key.toLowerCase()];
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

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function resizeWorld(
  startBounds: Bounds,
  anchor: Point,
  handle: HandleId,
  pointer: Point,
  keepAspect: boolean,
): Matrix2D {
  const startW = startBounds.maxX - startBounds.minX || 1;
  const startH = startBounds.maxY - startBounds.minY || 1;
  const affectsX = handle.includes("e") || handle.includes("w");
  const affectsY = handle.includes("n") || handle.includes("s");

  let sx = 1;
  let sy = 1;
  if (affectsX) {
    const denom = (handle.includes("e") ? startBounds.maxX : startBounds.minX) - anchor.x;
    sx = denom !== 0 ? (pointer.x - anchor.x) / denom : 1;
  }
  if (affectsY) {
    const denom = (handle.includes("s") ? startBounds.maxY : startBounds.minY) - anchor.y;
    sy = denom !== 0 ? (pointer.y - anchor.y) / denom : 1;
  }
  if (keepAspect && affectsX && affectsY) {
    const s = Math.max(Math.abs(sx), Math.abs(sy));
    sx = Math.sign(sx || 1) * s;
    sy = Math.sign(sy || 1) * s;
  } else if (!affectsX) {
    sx = 1;
  } else if (!affectsY) {
    sy = 1;
  }
  // Minimum-size guard.
  if (Math.abs(sx * startW) < MIN_SIZE) sx = (MIN_SIZE / startW) * Math.sign(sx || 1);
  if (Math.abs(sy * startH) < MIN_SIZE) sy = (MIN_SIZE / startH) * Math.sign(sy || 1);

  return multiply(multiply(translate(anchor.x, anchor.y), scale(sx, sy)), translate(-anchor.x, -anchor.y));
}

function buildShape(
  tool: string,
  start: Point,
  end: Point,
  constrain: boolean,
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
      let ex = end.x;
      let ey = end.y;
      if (constrain) {
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const snapped = (Math.round(angle / (Math.PI / 4)) * Math.PI) / 4;
        const len = Math.hypot(end.x - start.x, end.y - start.y);
        ex = start.x + Math.cos(snapped) * len;
        ey = start.y + Math.sin(snapped) * len;
      }
      return createLine({ x1: start.x, y1: start.y, x2: ex, y2: ey });
    }
    case "polygon": {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const radius = Math.max(Math.max(w, h) / 2, MIN_SIZE);
      return createPolygon({ points: regularPolygonPoints(cx, cy, radius, POLYGON_SIDES) });
    }
    default:
      return null;
  }
}
