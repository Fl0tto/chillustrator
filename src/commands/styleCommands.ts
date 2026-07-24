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
