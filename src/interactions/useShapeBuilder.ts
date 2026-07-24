/**
 * Shape Builder tool controller (Illustrator-style region picker).
 *
 * On entering the "build" tool it computes the atomic faces of the arrangement
 * of the eligible shapes (selection if ≥2 fillable, else all fillable top-level
 * shapes). Hover highlights the face under the pointer; clicking a face toggles
 * it into the "keep" set; Enter merges the kept faces into one new path (the
 * source shapes are KEPT, per product decision); Esc/tool-change cancels.
 *
 * Region math lives in the geometry adapter; this hook is interaction glue.
 */
import { useEffect } from "react";
import { useEditorStore } from "@/store/editorStore";
import { screenToRoot } from "@/geometry/viewport";
import { computeFaces, faceAtPoint, mergeFaces } from "@/geometry/adapters/shapeArrangement";
import { buildOperands, isFillableShape } from "./booleanOps";
import { serializePath } from "@/geometry/pathData";
import { createPath } from "@/model/factory";
import { addNodeCommand } from "@/commands/nodeCommands";
import type { NodeId } from "@/model/types";

const PATH_PRECISION = 4;

/** Ids of the shapes the arrangement should be built from. */
function eligibleSourceIds(): NodeId[] {
  const { document: doc, selection } = useEditorStore.getState();
  const selected = selection.filter((id) => {
    const n = doc.nodes[id];
    return n ? isFillableShape(n) : false;
  });
  if (selected.length >= 2) return selected;
  // Fall back to every fillable top-level shape.
  return doc.rootNodeIds.filter((id) => {
    const n = doc.nodes[id];
    return n ? isFillableShape(n) : false;
  });
}

export function useShapeBuilder(hostRef: React.RefObject<HTMLDivElement | null>) {
  const tool = useEditorStore((s) => s.tool);

  // Build the arrangement when the tool becomes active.
  useEffect(() => {
    if (tool !== "build") return;
    const store = useEditorStore.getState();
    const sourceIds = eligibleSourceIds();
    if (sourceIds.length < 2) {
      store.startShapeBuilder({ faces: [], kept: [], hovered: -1, sourceIds });
      return;
    }
    const operands = buildOperands(store.document, sourceIds);
    const faces = computeFaces(operands);
    store.startShapeBuilder({ faces, kept: [], hovered: -1, sourceIds });
    return () => useEditorStore.getState().endShapeBuilder();
  }, [tool]);

  // Pointer + keyboard handling while the tool is active.
  useEffect(() => {
    if (tool !== "build") return;
    const host = hostRef.current;
    if (!host) return;

    const pointerRoot = (e: PointerEvent | MouseEvent) => {
      const rect = host.getBoundingClientRect();
      const vp = useEditorStore.getState().viewport;
      return screenToRoot(e.clientX, e.clientY, rect, vp);
    };

    const onMove = (e: PointerEvent) => {
      const sb = useEditorStore.getState().shapeBuilder;
      if (!sb || sb.faces.length === 0) return;
      const idx = faceAtPoint(sb.faces, pointerRoot(e));
      useEditorStore.getState().setShapeBuilderHover(idx);
    };

    const onClick = (e: MouseEvent) => {
      const sb = useEditorStore.getState().shapeBuilder;
      if (!sb || sb.faces.length === 0) return;
      const idx = faceAtPoint(sb.faces, pointerRoot(e));
      if (idx >= 0) {
        e.stopPropagation();
        useEditorStore.getState().toggleShapeBuilderFace(idx);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitShapeBuilder();
      } else if (e.key === "Escape") {
        e.preventDefault();
        useEditorStore.getState().setTool("select");
      }
    };

    // Capture click so it runs before the select controller's handler.
    host.addEventListener("pointermove", onMove);
    host.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [tool, hostRef]);
}

/** Merge the kept faces into a new path and add it (sources are kept). */
export function commitShapeBuilder(): boolean {
  const store = useEditorStore.getState();
  const sb = store.shapeBuilder;
  if (!sb || sb.kept.length === 0) return false;

  const worldGeometry = mergeFaces(sb.faces, sb.kept);
  if (!worldGeometry) return false;

  // Faces are already in ROOT/world space; new path is a top-level node whose
  // own transform is identity, so world geometry == local geometry.
  const d = serializePath(worldGeometry, PATH_PRECISION);
  const path = createPath({ d, name: "Shape", style: { fillRule: "evenodd" } });

  store.apply(addNodeCommand(path, null, undefined, "Build shape"));
  store.endShapeBuilder();
  store.setTool("select");
  store.setSelection([path.id]);
  return true;
}
