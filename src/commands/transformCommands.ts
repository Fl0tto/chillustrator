/**
 * Transform + geometry edit commands.
 *
 * Move/resize/rotate are expressed as a WORLD-space transform D applied to a set
 * of nodes. For a node with parent world matrix P and local transform L, the new
 * local transform is L' = inv(P) · D · P · L. This is correct for arbitrary
 * affine parents (rotation/scale/skew), per spec §9.
 */
import { touchDocument } from "@/model/document";
import { parentWorldMatrix } from "@/geometry/nodeGeometry";
import { composeAll, identityMatrix, invert, multiply } from "@/geometry/matrix";
import type { Matrix2D, NodeId, SvgNode } from "@/model/types";
import type { Command } from "./command";

/** Apply a world-space transform D to each node's local transform. */
export function applyWorldTransformCommand(
  ids: NodeId[],
  world: Matrix2D,
  label = "Transform",
): Command {
  return {
    label,
    apply(draft) {
      for (const id of ids) {
        const node = draft.nodes[id];
        if (!node || node.locked) continue;
        const P = parentWorldMatrix(draft, id);
        const Pinv = invert(P) ?? identityMatrix();
        // L' = inv(P) · D · P · L
        node.transform = composeAll(Pinv, world, P, node.transform);
      }
      touchDocument(draft);
    },
  };
}

/** Translate nodes by (dx, dy) in root user units — one undo entry per drag. */
export function translateNodesCommand(ids: NodeId[], dx: number, dy: number): Command {
  const world: Matrix2D = { a: 1, b: 0, c: 0, d: 1, e: dx, f: dy };
  return applyWorldTransformCommand(ids, world, "Move");
}

/** Directly set one node's local transform matrix (inspector). */
export function setNodeTransformCommand(id: NodeId, matrix: Matrix2D): Command {
  return {
    label: "Set transform",
    apply(draft) {
      const node = draft.nodes[id];
      if (node) node.transform = matrix;
      touchDocument(draft);
    },
  };
}

/** Multiply a node's local transform by `local` on the right (local space). */
export function composeNodeTransformCommand(
  id: NodeId,
  local: Matrix2D,
  label = "Transform",
): Command {
  return {
    label,
    apply(draft) {
      const node = draft.nodes[id];
      if (node) node.transform = multiply(node.transform, local);
      touchDocument(draft);
    },
  };
}

/**
 * Patch the intrinsic geometry fields of a node (inspector numeric edits).
 * Only known numeric/geometry fields are copied; id/type/children are ignored.
 *
 * The mapped types below distribute over the SvgNode union so a patch like
 * `{ width, height }` type-checks against RectNode, `{ text }` against TextNode,
 * etc. (a plain `Partial<Omit<SvgNode, …>>` would collapse to the common keys).
 */
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
type DistributivePartial<T> = T extends unknown ? Partial<T> : never;
export type GeometryPatch = DistributivePartial<
  DistributiveOmit<SvgNode, "id" | "type" | "parentId" | "childIds" | "style" | "transform">
>;

export function updateNodeGeometryCommand(
  id: NodeId,
  patch: GeometryPatch,
  label = "Edit geometry",
): Command {
  return {
    label,
    apply(draft) {
      const node = draft.nodes[id];
      if (!node) return;
      Object.assign(node, patch);
      touchDocument(draft);
    },
  };
}

/** Set the opacity (0..1) of one or more nodes. */
export function setOpacityCommand(ids: NodeId[], opacity: number): Command {
  return {
    label: "Set opacity",
    apply(draft) {
      const clamped = Math.max(0, Math.min(1, opacity));
      for (const id of ids) {
        const node = draft.nodes[id];
        if (node) node.opacity = clamped;
      }
      touchDocument(draft);
    },
  };
}
