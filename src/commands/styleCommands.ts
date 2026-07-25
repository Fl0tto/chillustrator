/**
 * Fill / stroke / style commands.
 */
import { touchDocument } from "@/model/document";
import type { NodeId, NodeStyle, PaintReference } from "@/model/types";
import type { Command } from "./command";

export function setStyleCommand(
  ids: NodeId[],
  patch: Partial<NodeStyle>,
  label = "Change style",
): Command {
  return {
    label,
    apply(draft) {
      for (const id of ids) {
        const node = draft.nodes[id];
        if (node) node.style = { ...node.style, ...patch };
      }
      touchDocument(draft);
    },
  };
}

export function setFillCommand(ids: NodeId[], fill: PaintReference | null): Command {
  return setStyleCommand(ids, { fill }, "Change fill");
}

export function setStrokeCommand(ids: NodeId[], stroke: PaintReference | null): Command {
  return setStyleCommand(ids, { stroke }, "Change stroke");
}

export function setStrokeWidthCommand(ids: NodeId[], strokeWidth: number): Command {
  return setStyleCommand(ids, { strokeWidth: Math.max(0, strokeWidth) }, "Change stroke width");
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 1));
}

/**
 * Set the FILL paint opacity (fill-opacity, ALP-002) independently of node and
 * stroke opacity. No-op for nodes without a fill. Absolute value → coalescable.
 */
export function setFillOpacityCommand(ids: NodeId[], opacity: number): Command {
  const o = clamp01(opacity);
  return {
    label: "Change fill opacity",
    apply(draft) {
      for (const id of ids) {
        const node = draft.nodes[id];
        if (node?.style.fill) node.style.fill = { ...node.style.fill, opacity: o };
      }
      touchDocument(draft);
    },
  };
}

/** Set the STROKE paint opacity (stroke-opacity, ALP-002). No-op without a stroke. */
export function setStrokeOpacityCommand(ids: NodeId[], opacity: number): Command {
  const o = clamp01(opacity);
  return {
    label: "Change stroke opacity",
    apply(draft) {
      for (const id of ids) {
        const node = draft.nodes[id];
        if (node?.style.stroke) node.style.stroke = { ...node.style.stroke, opacity: o };
      }
      touchDocument(draft);
    },
  };
}
