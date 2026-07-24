/**
 * Commands that turn primitives into paths and replace boolean operands with a
 * result path (spec CVP-002, BLN-006/009). Pure: they mutate the Immer draft
 * only, so each is one undo entry that restores the exact prior hierarchy.
 */
import { touchDocument } from "@/model/document";
import { addNode, childListOf, deleteNodeDeep, indexInParent } from "@/model/tree";
import { createPath } from "@/model/factory";
import type { NodeId, NodeStyle, PathNode, SvgNode } from "@/model/types";
import { nodeToGeometry } from "@/geometry/pathConvert";
import { serializePath } from "@/geometry/pathData";
import type { Command } from "./command";

/** Decimal precision for stored path `d` strings (higher than export precision). */
const PATH_PRECISION = 4;

/** Deep-clone a NodeStyle off an Immer draft (structuredClone rejects proxies). */
function cloneStyle(style: NodeStyle): NodeStyle {
  return JSON.parse(JSON.stringify(style)) as NodeStyle;
}

/**
 * Replace a primitive node with an equivalent PathNode in place: same parent,
 * paint-order index, transform, style, opacity, and name (CVP-002). No-op for
 * nodes that are not convertible primitives.
 */
export function convertToPathCommand(id: NodeId, idOut?: (newId: NodeId) => void): Command {
  return {
    label: "Convert to path",
    apply(draft) {
      const node = draft.nodes[id];
      if (!node) return;
      const geometry = nodeToGeometry(node);
      if (!geometry) return; // groups, text, images, existing paths
      const d = serializePath(geometry, PATH_PRECISION);
      const index = indexInParent(draft, id);
      const parentId = node.parentId;
      const path = createPath({
        d,
        name: node.name,
        transform: { ...node.transform },
        opacity: node.opacity,
        style: cloneStyle(node.style),
      });
      deleteNodeDeep(draft, id);
      addNode(draft, path, parentId, index >= 0 ? index : undefined);
      idOut?.(path.id);
      touchDocument(draft);
    },
  };
}

/**
 * Remove the source operands and insert `path` at the front-most operand's
 * paint-order position within `parentId` (BLN-006). One transaction, so undo
 * restores every source (BLN-009).
 */
export function replaceWithPathCommand(
  sourceIds: NodeId[],
  path: PathNode,
  parentId: NodeId | null,
  label = "Boolean",
): Command {
  return {
    label,
    apply(draft) {
      const list = childListOf(draft, parentId);
      const srcSet = new Set(sourceIds);
      const indices = sourceIds.map((sid) => list.indexOf(sid)).filter((i) => i >= 0);
      const frontIndex = indices.length ? Math.max(...indices) : list.length;
      const survivorsBefore = list.slice(0, frontIndex).filter((sid) => !srcSet.has(sid)).length;

      for (const sid of sourceIds) deleteNodeDeep(draft, sid);
      addNode(draft, path as SvgNode, parentId, survivorsBefore);
      touchDocument(draft);
    },
  };
}
