/**
 * Grouping, paint-order, reparenting, and alignment commands.
 */
import { touchDocument } from "@/model/document";
import { createGroup } from "@/model/factory";
import {
  ancestorsOf,
  childListOf,
  detachFromParent,
  insertIntoParent,
  isContainer,
  reparentNode,
} from "@/model/tree";
import { worldBounds } from "@/geometry/nodeGeometry";
import { isEmptyBounds, type Bounds } from "@/geometry/bounds";
import { applyToVector, invert, identityMatrix } from "@/geometry/matrix";
import { parentWorldMatrix } from "@/geometry/nodeGeometry";
import type { NodeId, SvgDocumentModel } from "@/model/types";
import type { Command } from "./command";

/** Depth-first paint order of all node ids (bottom→top within each list). */
export function flattenPaintOrder(doc: SvgDocumentModel): NodeId[] {
  const out: NodeId[] = [];
  const walk = (ids: NodeId[]) => {
    for (const id of ids) {
      out.push(id);
      const node = doc.nodes[id];
      if (isContainer(node)) walk(node.childIds);
    }
  };
  walk(doc.rootNodeIds);
  return out;
}

/** Remove ids that are descendants of another id in the same set. */
export function topLevelSelection(doc: SvgDocumentModel, ids: NodeId[]): NodeId[] {
  const set = new Set(ids);
  return ids.filter((id) => !ancestorsOf(doc, id).some((a) => set.has(a)));
}

/** Group selected nodes into a new group under their common parent. */
export function groupNodesCommand(ids: NodeId[], groupIdOut?: (id: NodeId) => void): Command {
  return {
    label: "Group",
    apply(draft) {
      const roots = topLevelSelection(draft, ids);
      if (roots.length < 1) return;

      // Common parent: shared if all equal, else root.
      const parents = new Set(roots.map((id) => draft.nodes[id]?.parentId ?? null));
      const commonParent = parents.size === 1 ? [...parents][0] : null;

      // Order the members by global paint order (stable stacking).
      const order = flattenPaintOrder(draft);
      const ordered = [...roots].sort((a, b) => order.indexOf(a) - order.indexOf(b));

      // Insertion index in the common parent = position of the topmost member.
      const parentList = childListOf(draft, commonParent);
      const topMember = ordered[ordered.length - 1];
      const insertAt = Math.max(0, parentList.indexOf(topMember));

      const group = createGroup({ childIds: [] });
      draft.nodes[group.id] = group;
      insertIntoParent(draft, group.id, commonParent, insertAt);

      for (const id of ordered) {
        detachFromParent(draft, id);
        insertIntoParent(draft, id, group.id);
      }
      groupIdOut?.(group.id);
      touchDocument(draft);
    },
  };
}

/** Ungroup a group: move children into the group's parent at its position. */
export function ungroupCommand(groupId: NodeId, childIdsOut?: (ids: NodeId[]) => void): Command {
  return {
    label: "Ungroup",
    apply(draft) {
      const group = draft.nodes[groupId];
      if (!isContainer(group)) return;
      const parentId = group.parentId;
      const parentList = childListOf(draft, parentId);
      const at = Math.max(0, parentList.indexOf(groupId));
      const children = [...group.childIds];
      // Insert children in order at the group's slot, then remove the group.
      let offset = 0;
      for (const childId of children) {
        detachFromParent(draft, childId);
        insertIntoParent(draft, childId, parentId, at + offset);
        offset++;
      }
      detachFromParent(draft, groupId);
      delete draft.nodes[groupId];
      childIdsOut?.(children);
      touchDocument(draft);
    },
  };
}

export type ReorderOp = "front" | "back" | "forward" | "backward";

export function reorderCommand(ids: NodeId[], op: ReorderOp): Command {
  const labels: Record<ReorderOp, string> = {
    front: "Bring to front",
    back: "Send to back",
    forward: "Bring forward",
    backward: "Send backward",
  };
  return {
    label: labels[op],
    apply(draft) {
      // Operate per parent list. Process members grouped by parent.
      const byParent = new Map<NodeId | null, NodeId[]>();
      for (const id of ids) {
        const node = draft.nodes[id];
        if (!node) continue;
        const arr = byParent.get(node.parentId) ?? [];
        arr.push(id);
        byParent.set(node.parentId, arr);
      }
      for (const [parentId, members] of byParent) {
        const list = childListOf(draft, parentId);
        const memberSet = new Set(members);
        if (op === "front") {
          const kept = list.filter((id) => !memberSet.has(id));
          const moved = list.filter((id) => memberSet.has(id));
          list.length = 0;
          list.push(...kept, ...moved);
        } else if (op === "back") {
          const kept = list.filter((id) => !memberSet.has(id));
          const moved = list.filter((id) => memberSet.has(id));
          list.length = 0;
          list.push(...moved, ...kept);
        } else if (op === "forward") {
          // Move each member one step toward the end (top), from top down.
          for (let i = list.length - 2; i >= 0; i--) {
            if (memberSet.has(list[i]) && !memberSet.has(list[i + 1])) {
              [list[i], list[i + 1]] = [list[i + 1], list[i]];
            }
          }
        } else {
          // backward: move each member one step toward the start (bottom).
          for (let i = 1; i < list.length; i++) {
            if (memberSet.has(list[i]) && !memberSet.has(list[i - 1])) {
              [list[i], list[i - 1]] = [list[i - 1], list[i]];
            }
          }
        }
      }
      touchDocument(draft);
    },
  };
}

/** Move a node to a new parent/index (drag-reorder in layers). */
export function reparentNodeCommand(
  id: NodeId,
  newParentId: NodeId | null,
  index?: number,
): Command {
  return {
    label: "Reorder",
    apply(draft) {
      reparentNode(draft, id, newParentId, index);
      touchDocument(draft);
    },
  };
}

export type AlignEdge =
  | "left"
  | "hcenter"
  | "right"
  | "top"
  | "vcenter"
  | "bottom";

/** Align selected nodes relative to the selection's combined bounds. */
export function alignCommand(ids: NodeId[], edge: AlignEdge): Command {
  const labels: Record<AlignEdge, string> = {
    left: "Align left",
    hcenter: "Align center",
    right: "Align right",
    top: "Align top",
    vcenter: "Align middle",
    bottom: "Align bottom",
  };
  return {
    label: labels[edge],
    apply(draft) {
      const targets = topLevelSelection(draft, ids).filter((id) => {
        const n = draft.nodes[id];
        return n && !n.locked;
      });
      if (targets.length < 2) return;

      const boxes = new Map<NodeId, Bounds>();
      let union: Bounds | null = null;
      for (const id of targets) {
        const b = worldBounds(draft, id);
        if (isEmptyBounds(b)) continue;
        boxes.set(id, b);
        union = union
          ? {
              minX: Math.min(union.minX, b.minX),
              minY: Math.min(union.minY, b.minY),
              maxX: Math.max(union.maxX, b.maxX),
              maxY: Math.max(union.maxY, b.maxY),
            }
          : b;
      }
      if (!union) return;

      for (const [id, b] of boxes) {
        let dx = 0;
        let dy = 0;
        switch (edge) {
          case "left":
            dx = union.minX - b.minX;
            break;
          case "right":
            dx = union.maxX - b.maxX;
            break;
          case "hcenter":
            dx = (union.minX + union.maxX) / 2 - (b.minX + b.maxX) / 2;
            break;
          case "top":
            dy = union.minY - b.minY;
            break;
          case "bottom":
            dy = union.maxY - b.maxY;
            break;
          case "vcenter":
            dy = (union.minY + union.maxY) / 2 - (b.minY + b.maxY) / 2;
            break;
        }
        if (dx === 0 && dy === 0) continue;
        const node = draft.nodes[id];
        if (!node) continue;
        // Convert the world-space delta into the node's parent space and apply
        // it to the local translation component.
        const P = parentWorldMatrix(draft, id);
        const Pinv = invert(P) ?? identityMatrix();
        const localDelta = applyToVector(Pinv, { x: dx, y: dy });
        node.transform = {
          ...node.transform,
          e: node.transform.e + localDelta.x,
          f: node.transform.f + localDelta.y,
        };
      }
      touchDocument(draft);
    },
  };
}
