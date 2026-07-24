/**
 * Commands that add, remove, rename, or toggle node-level flags.
 */
import { touchDocument } from "@/model/document";
import {
  addNode,
  deleteNodeDeep,
  indexInParent,
  insertIntoParent,
} from "@/model/tree";
import { createNodeId } from "@/model/ids";
import type { NodeId, SvgNode } from "@/model/types";
import type { Command } from "./command";

export function addNodeCommand(
  node: SvgNode,
  parentId: NodeId | null = null,
  index?: number,
  label = "Add object",
): Command {
  return {
    label,
    apply(draft) {
      addNode(draft, node, parentId, index);
      touchDocument(draft);
    },
  };
}

export function deleteNodesCommand(ids: NodeId[]): Command {
  return {
    label: ids.length > 1 ? "Delete objects" : "Delete object",
    apply(draft) {
      for (const id of ids) deleteNodeDeep(draft, id);
      touchDocument(draft);
    },
  };
}

export function renameNodeCommand(id: NodeId, name: string): Command {
  return {
    label: "Rename",
    apply(draft) {
      const node = draft.nodes[id];
      if (node) node.name = name;
      touchDocument(draft);
    },
  };
}

export function setVisibilityCommand(ids: NodeId[], visible: boolean): Command {
  return {
    label: visible ? "Show" : "Hide",
    apply(draft) {
      for (const id of ids) {
        const node = draft.nodes[id];
        if (node) node.visible = visible;
      }
      touchDocument(draft);
    },
  };
}

export function setLockCommand(ids: NodeId[], locked: boolean): Command {
  return {
    label: locked ? "Lock" : "Unlock",
    apply(draft) {
      for (const id of ids) {
        const node = draft.nodes[id];
        if (node) node.locked = locked;
      }
      touchDocument(draft);
    },
  };
}

/**
 * Deep-clone the given nodes (and their descendants) with fresh ids, inserting
 * the clones just after their originals. Returns nothing; use the companion
 * duplicateNodes helper in the store to also learn the new ids.
 */
export function duplicateNodesCommand(
  ids: NodeId[],
  offset = { x: 16, y: 16 },
  idOut?: (newRootIds: NodeId[]) => void,
): Command {
  return {
    label: ids.length > 1 ? "Duplicate objects" : "Duplicate object",
    apply(draft) {
      const newRoots: NodeId[] = [];
      const cloneDeep = (srcId: NodeId, parentId: NodeId | null, index?: number): NodeId | null => {
        const src = draft.nodes[srcId];
        if (!src) return null;
        const newId = createNodeId();
        const clone = structuredClone(src) as SvgNode;
        clone.id = newId;
        clone.parentId = parentId;
        if (clone.type === "group") clone.childIds = [];
        draft.nodes[newId] = clone;
        insertIntoParent(draft, newId, parentId, index);
        if (src.type === "group") {
          for (const childId of src.childIds) cloneDeep(childId, newId);
        }
        return newId;
      };
      for (const id of ids) {
        const src = draft.nodes[id];
        if (!src) continue;
        const at = indexInParent(draft, id);
        const newId = cloneDeep(id, src.parentId, at >= 0 ? at + 1 : undefined);
        if (newId) {
          const clone = draft.nodes[newId];
          if (clone) {
            clone.transform = {
              ...clone.transform,
              e: clone.transform.e + offset.x,
              f: clone.transform.f + offset.y,
            };
          }
          newRoots.push(newId);
        }
      }
      idOut?.(newRoots);
      touchDocument(draft);
    },
  };
}
