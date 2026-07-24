/**
 * Pure tree query + mutation helpers over the normalized node store.
 *
 * Mutation helpers operate in-place on a document object (typically an Immer
 * draft inside a command). They keep `parentId`, `childIds`, and `rootNodeIds`
 * consistent. Framework-independent — no React/DOM.
 */
import type { NodeId, SvgDocumentModel, SvgNode } from "./types";

/** The ordered id list that owns `parentId` (root list or a group's childIds). */
export function childListOf(doc: SvgDocumentModel, parentId: NodeId | null): NodeId[] {
  if (parentId === null) return doc.rootNodeIds;
  const parent = doc.nodes[parentId];
  if (parent && parent.type === "group") return parent.childIds;
  // Fallback: treat as root if parent is missing/not a container.
  return doc.rootNodeIds;
}

export function getNode(doc: SvgDocumentModel, id: NodeId): SvgNode | undefined {
  return doc.nodes[id];
}

export function getChildren(doc: SvgDocumentModel, parentId: NodeId | null): SvgNode[] {
  return childListOf(doc, parentId)
    .map((id) => doc.nodes[id])
    .filter((n): n is SvgNode => Boolean(n));
}

export function isContainer(node: SvgNode | undefined): node is Extract<SvgNode, { type: "group" }> {
  return node?.type === "group";
}

/** All ancestor ids from nearest parent up to root. */
export function ancestorsOf(doc: SvgDocumentModel, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  let node = doc.nodes[id];
  while (node && node.parentId) {
    out.push(node.parentId);
    node = doc.nodes[node.parentId];
  }
  return out;
}

/** All descendant ids (excluding `id` itself), depth-first. */
export function descendantsOf(doc: SvgDocumentModel, id: NodeId): NodeId[] {
  const node = doc.nodes[id];
  if (!isContainer(node)) return [];
  const out: NodeId[] = [];
  const stack = [...node.childIds];
  while (stack.length) {
    const childId = stack.pop()!;
    out.push(childId);
    const child = doc.nodes[childId];
    if (isContainer(child)) stack.push(...child.childIds);
  }
  return out;
}

/** True if `maybeAncestor` is an ancestor of `id` (or equal). */
export function isAncestor(doc: SvgDocumentModel, maybeAncestor: NodeId, id: NodeId): boolean {
  if (maybeAncestor === id) return true;
  return ancestorsOf(doc, id).includes(maybeAncestor);
}

/** Effective visibility/locked accounting for ancestors. */
export function isEffectivelyVisible(doc: SvgDocumentModel, id: NodeId): boolean {
  let node = doc.nodes[id];
  while (node) {
    if (!node.visible) return false;
    node = node.parentId ? doc.nodes[node.parentId] : undefined!;
    if (!node) break;
  }
  return true;
}

export function isEffectivelyLocked(doc: SvgDocumentModel, id: NodeId): boolean {
  let node = doc.nodes[id];
  while (node) {
    if (node.locked) return true;
    node = node.parentId ? doc.nodes[node.parentId] : undefined!;
    if (!node) break;
  }
  return false;
}

// --------------------------------------------------------------------------
// Mutations (operate in place / on an Immer draft)
// --------------------------------------------------------------------------

/**
 * Insert a node into a parent's child list at `index` (append if omitted).
 * The node must already exist in `doc.nodes`. Sets parentId accordingly.
 */
export function insertIntoParent(
  doc: SvgDocumentModel,
  nodeId: NodeId,
  parentId: NodeId | null,
  index?: number,
): void {
  const node = doc.nodes[nodeId];
  if (!node) return;
  node.parentId = parentId;
  const list = childListOf(doc, parentId);
  const at = index === undefined ? list.length : Math.max(0, Math.min(index, list.length));
  list.splice(at, 0, nodeId);
}

/** Remove a node id from whatever parent list currently references it. */
export function detachFromParent(doc: SvgDocumentModel, nodeId: NodeId): number {
  const node = doc.nodes[nodeId];
  if (!node) return -1;
  const list = childListOf(doc, node.parentId);
  const idx = list.indexOf(nodeId);
  if (idx >= 0) list.splice(idx, 1);
  return idx;
}

/** Current index of a node within its parent list, or -1. */
export function indexInParent(doc: SvgDocumentModel, nodeId: NodeId): number {
  const node = doc.nodes[nodeId];
  if (!node) return -1;
  return childListOf(doc, node.parentId).indexOf(nodeId);
}

/**
 * Fully delete a node and all descendants from the document (removing from
 * parent list and the nodes map). Returns the removed ids.
 */
export function deleteNodeDeep(doc: SvgDocumentModel, nodeId: NodeId): NodeId[] {
  const node = doc.nodes[nodeId];
  if (!node) return [];
  const removed = [nodeId, ...descendantsOf(doc, nodeId)];
  detachFromParent(doc, nodeId);
  for (const id of removed) delete doc.nodes[id];
  return removed;
}

/** Add a fully-formed node object to the map and into a parent list. */
export function addNode(
  doc: SvgDocumentModel,
  node: SvgNode,
  parentId: NodeId | null = null,
  index?: number,
): void {
  doc.nodes[node.id] = node;
  insertIntoParent(doc, node.id, parentId, index);
}

/**
 * Move a node to a new parent/index without destroying it.
 * Guards against moving a node into itself or its descendants.
 */
export function reparentNode(
  doc: SvgDocumentModel,
  nodeId: NodeId,
  newParentId: NodeId | null,
  index?: number,
): boolean {
  if (newParentId && isAncestor(doc, nodeId, newParentId)) return false;
  detachFromParent(doc, nodeId);
  insertIntoParent(doc, nodeId, newParentId, index);
  return true;
}
