/**
 * Boolean-operation orchestration (spec Boolean Command Lifecycle).
 *
 * Reads the current document, validates the selection, resolves each operand's
 * WORLD geometry, runs the async engine, converts the result into the common
 * parent's local space, and commits ONE transaction that removes the sources and
 * inserts the result path (BLN-005/006/009). Source nodes are never mutated
 * until the engine returns a valid result (BLN-010).
 *
 * This is interaction/app glue: it may touch the store, the engine, and command
 * builders. The geometry engine itself stays library-isolated.
 */
import { useEditorStore } from "@/store/editorStore";
import { worldMatrix } from "@/geometry/nodeGeometry";
import { invert } from "@/geometry/matrix";
import { nodeToGeometry } from "@/geometry/pathConvert";
import { parsePath } from "@/geometry/pathParser";
import { serializePath, transformGeometry } from "@/geometry/pathData";
import { booleanEngine } from "@/geometry/adapters/booleanEngine";
import type { BooleanOperand, BooleanOperation } from "@/geometry/booleanTypes";
import { createPath } from "@/model/factory";
import { replaceWithPathCommand } from "@/commands/geometryCommands";
import type { NodeId, SvgDocumentModel, SvgNode } from "@/model/types";

const PATH_PRECISION = 4;

const OP_LABEL: Record<BooleanOperation, string> = {
  union: "Union",
  subtract: "Subtract",
  intersect: "Intersect",
  exclude: "Exclude",
};

export interface BooleanEligibility {
  ok: boolean;
  reason?: string;
  parentId?: NodeId | null;
  /** Selected operand ids sorted back→front (paint order). */
  orderedIds?: NodeId[];
}

/** Local geometry for a node, or null when it has no fillable area. */
function operandGeometry(node: SvgNode) {
  if (node.type === "path") {
    const parsed = parsePath(node.d);
    return parsed.error ? null : parsed.geometry;
  }
  return nodeToGeometry(node);
}

/** Validate a selection for boolean use without mutating anything (BLN-UI). */
export function booleanEligibility(doc: SvgDocumentModel, ids: NodeId[]): BooleanEligibility {
  const nodes = ids.map((id) => doc.nodes[id]).filter((n): n is SvgNode => Boolean(n));
  if (nodes.length < 2) return { ok: false, reason: "Select at least two shapes." };

  const parentId = nodes[0].parentId;
  if (!nodes.every((n) => n.parentId === parentId)) {
    return { ok: false, reason: "Select shapes in the same group or layer." };
  }
  for (const n of nodes) {
    if (n.type === "group") return { ok: false, reason: "Groups can't be combined directly. Ungroup first." };
    if (n.type === "text" || n.type === "image" || n.type === "unknown") {
      return { ok: false, reason: `${n.type} objects can't be combined.` };
    }
    if (n.type === "line") return { ok: false, reason: "Open lines can't be combined. Outline them first." };
  }

  const list = parentId === null ? doc.rootNodeIds : (doc.nodes[parentId] as { childIds: NodeId[] }).childIds;
  const orderedIds = [...ids].sort((a, b) => list.indexOf(a) - list.indexOf(b));
  return { ok: true, parentId, orderedIds };
}

export interface BooleanRunResult {
  ok: boolean;
  warning?: string;
}

/**
 * Run a boolean operation on the current selection. Returns `{ ok:false,
 * warning }` (leaving the document untouched) on empty/invalid results.
 */
export async function runBoolean(operation: BooleanOperation): Promise<BooleanRunResult> {
  const store = useEditorStore.getState();
  const doc = store.document;
  const selection = store.selection;

  const eligible = booleanEligibility(doc, selection);
  if (!eligible.ok || !eligible.orderedIds) {
    return { ok: false, warning: eligible.reason };
  }
  const orderedIds = eligible.orderedIds;
  const parentId: NodeId | null = eligible.parentId ?? null;

  // Build world-space operands (BLN-005 step 1–3).
  const operands: BooleanOperand[] = [];
  for (const id of orderedIds) {
    const node = doc.nodes[id]!;
    const geometry = operandGeometry(node);
    if (!geometry) continue;
    operands.push({
      id,
      geometry,
      fillRule: node.style.fillRule,
      transform: worldMatrix(doc, id),
    });
  }
  if (operands.length < 2) {
    return { ok: false, warning: "Selection did not contain two fillable shapes." };
  }

  let result;
  try {
    result = await booleanEngine.execute(operation, operands);
  } catch {
    return { ok: false, warning: "The geometry engine failed. Nothing was changed." };
  }
  if (result.empty || result.geometry.segments.length === 0) {
    return { ok: false, warning: "The boolean operation produced an empty result." };
  }

  // Convert world result → common-parent local space (BLN-005 step 6).
  const parentWorld = parentId === null ? null : worldMatrix(doc, parentId);
  const toLocal = parentWorld ? invert(parentWorld) : null;
  const localGeometry = toLocal ? transformGeometry(result.geometry, toLocal) : result.geometry;
  const d = serializePath(localGeometry, PATH_PRECISION);

  // Style from the bottom-most operand; stroke removed by default (BLN-006).
  const bottom = doc.nodes[orderedIds[0]]!;
  const path = createPath({
    d,
    name: OP_LABEL[operation],
    opacity: bottom.opacity,
    style: { ...structuredClone(bottom.style), stroke: null, fillRule: result.fillRule },
  });

  store.apply(replaceWithPathCommand(orderedIds, path, parentId, OP_LABEL[operation]));
  store.setSelection([path.id]);
  return { ok: true, warning: result.warnings[0] };
}
