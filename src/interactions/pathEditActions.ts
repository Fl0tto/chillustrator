/**
 * Discrete path-edit actions triggered from the inspector while the node editor
 * is active. Each mutates the transient `pathEdit` session AND commits exactly
 * one `updateNodeGeometryCommand` (one undo entry per edit, HST-002).
 *
 * OWNED BY: Agent D (interactions).
 */
import { useEditorStore } from "@/store/editorStore";
import {
  clonePath,
  locateAnchor,
  setAnchorMode,
  makeSegmentCurved,
  makeSegmentStraight,
  clampCornerRadius,
  anchorPoint,
  toGeometry,
  type AnchorMode,
  type EditablePath,
} from "@/geometry/editablePath";
import { serializePath } from "@/geometry/pathData";
import { updateNodeGeometryCommand } from "@/commands/transformCommands";

const PATH_PRECISION = 4;

function commit(path: EditablePath, label: string): void {
  const store = useEditorStore.getState();
  const s = store.pathEdit;
  if (!s) return;
  const d = serializePath(toGeometry(path), PATH_PRECISION);
  store.apply(updateNodeGeometryCommand(s.nodeId, { d }, label));
  useEditorStore.getState().setPathEdit({ ...s, path });
}

function neighborPoints(path: EditablePath, sub: number, anchor: number) {
  const anchors = path.subpaths[sub].anchors;
  const closed = path.subpaths[sub].closed;
  const n = anchors.length;
  const prev = anchor > 0 ? anchors[anchor - 1] : closed ? anchors[n - 1] : undefined;
  const next = anchor < n - 1 ? anchors[anchor + 1] : closed ? anchors[0] : undefined;
  return {
    prev: prev ? anchorPoint(prev) : undefined,
    next: next ? anchorPoint(next) : undefined,
  };
}

/** Set the continuity mode of every selected anchor. */
export function setSelectedAnchorsMode(mode: AnchorMode): void {
  const s = useEditorStore.getState().pathEdit;
  if (!s || s.selected.length === 0) return;
  const path = clonePath(s.path);
  for (const idx of s.selected) {
    const loc = locateAnchor(path, idx);
    if (!loc) continue;
    const { prev, next } = neighborPoints(path, loc.sub, loc.anchor);
    const a = path.subpaths[loc.sub].anchors[loc.anchor];
    path.subpaths[loc.sub].anchors[loc.anchor] = setAnchorMode(a, mode, prev, next);
  }
  commit(path, "Set anchor mode");
}

/** Convert the incoming segment of every selected anchor to a line or curve. */
export function setSelectedSegmentCurved(curved: boolean): void {
  const s = useEditorStore.getState().pathEdit;
  if (!s || s.selected.length === 0) return;
  const path = clonePath(s.path);
  for (const idx of s.selected) {
    const loc = locateAnchor(path, idx);
    if (!loc) continue;
    const sub = path.subpaths[loc.sub];
    const n = sub.anchors.length;
    // Incoming segment index within the subpath (wrap for closed at anchor 0).
    let segIndex = loc.anchor;
    if (loc.anchor === 0) {
      if (!sub.closed) continue;
      segIndex = n; // closing segment last→first handled below
    }
    if (segIndex === n) {
      // Closing segment: operate on last→first via a temporary treatment.
      const first = sub.anchors[0];
      const last = sub.anchors[n - 1];
      if (curved) {
        last.handleOut = { x: last.x + (first.x - last.x) / 3, y: last.y + (first.y - last.y) / 3 };
        first.handleIn = { x: first.x + (last.x - first.x) / 3, y: first.y + (last.y - first.y) / 3 };
      } else {
        last.handleOut = null;
        first.handleIn = null;
      }
    } else if (curved) {
      makeSegmentCurved(sub, segIndex);
    } else {
      makeSegmentStraight(sub, segIndex);
    }
  }
  commit(path, curved ? "Curve segment" : "Straighten segment");
}

/** Set a rounded-corner radius on every selected (straight) corner anchor. */
export function setSelectedCornerRadius(radius: number): void {
  const s = useEditorStore.getState().pathEdit;
  if (!s || s.selected.length === 0) return;
  const path = clonePath(s.path);
  for (const idx of s.selected) {
    const loc = locateAnchor(path, idx);
    if (!loc) continue;
    const sub = path.subpaths[loc.sub];
    const n = sub.anchors.length;
    const prev = sub.anchors[(loc.anchor - 1 + n) % n];
    const next = sub.anchors[(loc.anchor + 1) % n];
    const corner = sub.anchors[loc.anchor];
    const clamped = clampCornerRadius(anchorPoint(prev), anchorPoint(corner), anchorPoint(next), radius);
    sub.anchors[loc.anchor] = { ...corner, cornerRadius: clamped };
  }
  commit(path, "Corner radius");
}
