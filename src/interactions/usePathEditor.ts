/**
 * usePathEditor — direct-selection (node) editing of a PathNode.
 *
 * OWNED BY: Agent D (interactions). Maintains a transient `pathEdit` session (an
 * EditablePath in the node's LOCAL space) and:
 *  - selects / moves anchors,
 *  - drags Bézier handles (respecting smooth/symmetric continuity),
 *  - drags a corner-radius handle,
 * committing exactly ONE `updateNodeGeometryCommand` per gesture (HST-002).
 * Mode / segment / radius changes triggered from the inspector are one entry
 * each too (see pathEditActions.ts). Anchor placement/movement snaps to Smart
 * Guides unless Alt is held.
 *
 * During a drag the artwork <path> `d` is updated transiently (setAttribute) for
 * live fill feedback; the model commits once on pointer release.
 */
import { useEffect, type RefObject } from "react";
import { useEditorStore, type PathEditState } from "@/store/editorStore";
import { screenToRoot } from "@/geometry/viewport";
import { worldMatrix } from "@/geometry/nodeGeometry";
import { invert, identityMatrix, applyToPoint, type Point, type Matrix2D } from "@/geometry/matrix";
import { parsePath } from "@/geometry/pathParser";
import {
  fromGeometry,
  toGeometry,
  clonePath,
  flatAnchors,
  locateAnchor,
  moveAnchor,
  dragHandle,
  clampCornerRadius,
  anchorPoint,
  type EditablePath,
} from "@/geometry/editablePath";
import { serializePath } from "@/geometry/pathData";
import { updateNodeGeometryCommand } from "@/commands/transformCommands";
import { convertToPathCommand } from "@/commands/geometryCommands";
import { isConvertibleToPath } from "@/geometry/pathConvert";
import {
  collectSnapCandidates,
  snapPoint,
  type SnapCandidates,
} from "./snapping";

const PATH_PRECISION = 4;
const SNAP_PX = 6;
/** Screen-space pick radius (÷zoom → root units) for corner-tool body clicks. */
const CORNER_PICK_PX = 24;

/** Flat index of the anchor nearest `rootPt` (world coords) within `threshold`, or -1. */
function nearestAnchorFlatIndex(
  path: EditablePath,
  world: Matrix2D,
  rootPt: Point,
  threshold: number,
): number {
  let best = -1;
  let bestDist = threshold;
  for (const { index, a } of flatAnchors(path)) {
    const w = applyToPoint(world, anchorPoint(a));
    const d = Math.hypot(w.x - rootPt.x, w.y - rootPt.y);
    if (d <= bestDist) {
      bestDist = d;
      best = index;
    }
  }
  return best;
}

type DragKind = "none" | "anchor" | "handle" | "radius";

/** Rebuild an editable session from a node's `d`, preserving selection. */
export function sessionFromNode(nodeId: string, selected: number[] = []): PathEditState | null {
  const doc = useEditorStore.getState().document;
  const node = doc.nodes[nodeId];
  if (!node || node.type !== "path") return null;
  const { geometry, error } = parsePath(node.d);
  if (error) return null;
  const path = fromGeometry(geometry);
  const max = flatAnchors(path).length;
  return { nodeId, path, selected: selected.filter((i) => i < max) };
}

export function usePathEditor(
  hostRef: RefObject<HTMLDivElement | null>,
  svgRef: RefObject<SVGSVGElement | null>,
): void {
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const store = useEditorStore;

    let drag: DragKind = "none";
    let dragAnchor = -1;
    let dragHandleWhich: "in" | "out" = "out";
    let pointerId = -1;
    let world: Matrix2D = identityMatrix();
    let worldInv: Matrix2D = identityMatrix();
    let candidates: SnapCandidates | null = null;
    let startLocal: EditablePath | null = null;
    let radiusBase: Point | null = null;

    const hostRect = () => host.getBoundingClientRect();
    const toRoot = (cx: number, cy: number): Point =>
      screenToRoot(cx, cy, hostRect(), store.getState().viewport);
    const toLocal = (cx: number, cy: number): Point => applyToPoint(worldInv, toRoot(cx, cy));
    const snapThreshold = () => SNAP_PX / store.getState().viewport.zoom;

    const session = (): PathEditState | null => store.getState().pathEdit;

    const artworkEl = (id: string): SVGPathElement | null => {
      const root = svgRef.current;
      return root?.querySelector<SVGPathElement>(`path[data-node-id="${CSS.escape(id)}"]`) ?? null;
    };

    const setWorldFor = (nodeId: string) => {
      world = worldMatrix(store.getState().document, nodeId);
      worldInv = invert(world) ?? identityMatrix();
    };

    /** Snap a LOCAL anchor point via world-space candidates; publishes guides. */
    const snapLocal = (local: Point, alt: boolean): Point => {
      if (alt || !store.getState().preferences.snapAlignment) {
        store.getState().setInteraction({ guides: [] });
        return local;
      }
      if (!candidates) {
        candidates = collectSnapCandidates(store.getState().document, [session()?.nodeId ?? ""]);
      }
      const w = applyToPoint(world, local);
      const r = snapPoint(w, candidates, snapThreshold());
      store.getState().setInteraction({ guides: r.guides });
      return applyToPoint(worldInv, { x: r.x, y: r.y });
    };

    const previewDom = (path: EditablePath, nodeId: string) => {
      const el = artworkEl(nodeId);
      if (el) el.setAttribute("d", serializePath(toGeometry(path), PATH_PRECISION));
    };

    const commit = (path: EditablePath, label: string) => {
      const s = session();
      if (!s) return;
      const d = serializePath(toGeometry(path), PATH_PRECISION);
      store.getState().apply(updateNodeGeometryCommand(s.nodeId, { d }, label));
      store.getState().setPathEdit({ ...s, path });
      store.getState().setInteraction({ guides: [] });
    };

    const onPointerDown = (e: PointerEvent) => {
      const tool = store.getState().tool;
      const cornerTool = tool === "corner";
      if ((tool !== "node" && !cornerTool) || e.button !== 0) return;
      const target = e.target as Element | null;

      // Ensure we have a session for the clicked / selected path.
      let s = session();
      const anchorAttr = target?.closest?.("[data-pen-anchor]") as Element | null;
      const handleAttr = target?.closest?.("[data-pen-handle]") as Element | null;
      const radiusAttr = target?.closest?.("[data-pen-radius]") as Element | null;
      const nodeAttr = target?.closest?.("path[data-node-id]") as Element | null;

      // Corner tool: (re)target the session to the shape under the cursor,
      // silently converting a primitive to an editable path first when needed.
      if (cornerTool && !anchorAttr && !handleAttr && !radiusAttr) {
        const anyEl = target?.closest?.("[data-node-id]") as Element | null;
        const clickedId = anyEl?.getAttribute("data-node-id") ?? null;
        if (clickedId && (!s || s.nodeId !== clickedId)) {
          const node = store.getState().document.nodes[clickedId];
          if (node?.type === "path") {
            const fresh = sessionFromNode(clickedId);
            if (fresh) {
              store.getState().setPathEdit(fresh);
              store.getState().setSelection([clickedId]);
              s = fresh;
            }
          } else if (node && isConvertibleToPath(node)) {
            let newId = clickedId;
            store.getState().apply(convertToPathCommand(clickedId, (nid) => (newId = nid)));
            const fresh = sessionFromNode(newId);
            if (fresh) {
              store.getState().setPathEdit(fresh);
              store.getState().setSelection([newId]);
              s = fresh;
            }
          }
        }
      }

      if (!s) {
        const id = nodeAttr?.getAttribute("data-node-id");
        if (id) {
          const fresh = sessionFromNode(id);
          if (fresh) {
            store.getState().setPathEdit(fresh);
            store.getState().setSelection([id]);
            s = fresh;
          }
        }
        if (!s) return;
      }
      setWorldFor(s.nodeId);
      candidates = null;

      // Corner tool: a click on the shape body (not a grip) selects the nearest
      // corner so the radius grip / Corner-R field targets it — no need to hit the
      // tiny anchor dot exactly.
      if (cornerTool && !anchorAttr && !handleAttr && !radiusAttr) {
        const rootPt = toRoot(e.clientX, e.clientY);
        const threshold = CORNER_PICK_PX / store.getState().viewport.zoom;
        const near = nearestAnchorFlatIndex(s.path, world, rootPt, threshold);
        if (near >= 0) {
          const already = s.selected.includes(near);
          const selected = e.shiftKey
            ? already
              ? s.selected.filter((i) => i !== near)
              : [...s.selected, near]
            : [near];
          store.getState().setPathEdit({ ...s, selected });
        } else if (!e.shiftKey) {
          store.getState().setPathEdit({ ...s, selected: [] });
        }
        drag = "none";
        return;
      }

      host.setPointerCapture(e.pointerId);
      pointerId = e.pointerId;
      startLocal = clonePath(s.path);

      if (radiusAttr) {
        drag = "radius";
        dragAnchor = Number(radiusAttr.getAttribute("data-pen-radius"));
        const loc = locateAnchor(s.path, dragAnchor);
        radiusBase = loc ? anchorPoint(s.path.subpaths[loc.sub].anchors[loc.anchor]) : null;
        return;
      }
      if (handleAttr) {
        drag = "handle";
        dragAnchor = Number(handleAttr.getAttribute("data-anchor-index"));
        dragHandleWhich = handleAttr.getAttribute("data-pen-handle") === "in" ? "in" : "out";
        return;
      }
      if (anchorAttr) {
        drag = "anchor";
        dragAnchor = Number(anchorAttr.getAttribute("data-pen-anchor"));
        const already = s.selected.includes(dragAnchor);
        const selected = e.shiftKey
          ? already
            ? s.selected.filter((i) => i !== dragAnchor)
            : [...s.selected, dragAnchor]
          : already
            ? s.selected
            : [dragAnchor];
        store.getState().setPathEdit({ ...s, selected });
        return;
      }
      // Empty space: clear anchor selection (keep the session for this node).
      if (!nodeAttr) {
        store.getState().setPathEdit({ ...s, selected: [] });
        drag = "none";
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (drag === "none" || pointerId !== e.pointerId || !startLocal) return;
      const s = session();
      if (!s) return;
      const local = toLocal(e.clientX, e.clientY);
      const path = clonePath(startLocal);

      if (drag === "anchor") {
        const loc = locateAnchor(path, dragAnchor);
        if (!loc) return;
        const snapped = snapLocal(local, e.altKey);
        const origin = startLocal.subpaths[loc.sub].anchors[loc.anchor];
        const dx = snapped.x - origin.x;
        const dy = snapped.y - origin.y;
        // Move every selected anchor by the same delta.
        for (const idx of s.selected.length ? s.selected : [dragAnchor]) {
          const l = locateAnchor(path, idx);
          if (!l) continue;
          const a = path.subpaths[l.sub].anchors[l.anchor];
          path.subpaths[l.sub].anchors[l.anchor] = moveAnchor(a, a.x + dx, a.y + dy);
        }
        store.getState().setPathEdit({ ...s, path });
        previewDom(path, s.nodeId);
      } else if (drag === "handle") {
        const loc = locateAnchor(path, dragAnchor);
        if (!loc) return;
        const a = path.subpaths[loc.sub].anchors[loc.anchor];
        path.subpaths[loc.sub].anchors[loc.anchor] = dragHandle(a, dragHandleWhich, local.x, local.y);
        store.getState().setInteraction({ guides: [] });
        store.getState().setPathEdit({ ...s, path });
        previewDom(path, s.nodeId);
      } else if (drag === "radius" && radiusBase) {
        const loc = locateAnchor(path, dragAnchor);
        if (!loc) return;
        const anchors = path.subpaths[loc.sub].anchors;
        const n = anchors.length;
        const prev = anchors[(loc.anchor - 1 + n) % n];
        const next = anchors[(loc.anchor + 1) % n];
        const dist = Math.hypot(local.x - radiusBase.x, local.y - radiusBase.y);
        anchors[loc.anchor] = {
          ...anchors[loc.anchor],
          cornerRadius: clampCornerRadius(anchorPoint(prev), radiusBase, anchorPoint(next), dist),
        };
        store.getState().setPathEdit({ ...s, path });
        previewDom(path, s.nodeId);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return;
      if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
      const s = session();
      if (s && drag !== "none") {
        const label =
          drag === "anchor" ? "Move anchor" : drag === "handle" ? "Edit handle" : "Corner radius";
        // Only commit if the geometry actually changed.
        const before = startLocal ? serializePath(toGeometry(startLocal), PATH_PRECISION) : "";
        const after = serializePath(toGeometry(s.path), PATH_PRECISION);
        if (before !== after) commit(s.path, label);
        else store.getState().setInteraction({ guides: [] });
      }
      drag = "none";
      dragAnchor = -1;
      pointerId = -1;
      startLocal = null;
      radiusBase = null;
    };

    host.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    // Keep the session in sync when the document changes outside a drag
    // (undo / redo / inspector edits) so the overlay stays correct.
    const unsub = store.subscribe((state) => {
      if (drag !== "none") return;
      const s = state.pathEdit;
      // Auto-open a session when the node tool is active with a single path
      // selected (e.g. right after the Pen tool finishes a drawing).
      if (!s) {
        if ((state.tool === "node" || state.tool === "corner") && state.selection.length === 1) {
          const node = state.document.nodes[state.selection[0]];
          if (node && node.type === "path") {
            const fresh = sessionFromNode(node.id);
            if (fresh) store.getState().setPathEdit(fresh);
          }
        }
        return;
      }
      const node = state.document.nodes[s.nodeId];
      if (!node || node.type !== "path") {
        store.getState().setPathEdit(null);
        return;
      }
      const currentD = serializePath(toGeometry(s.path), PATH_PRECISION);
      if (currentD !== node.d) {
        const rebuilt = sessionFromNode(s.nodeId, s.selected);
        if (rebuilt) store.getState().setPathEdit(rebuilt);
      }
    });

    return () => {
      host.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      unsub();
    };
  }, [hostRef, svgRef]);
}
