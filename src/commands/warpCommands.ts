/**
 * Non-destructive warp modifier commands (feature wave 3, item 2).
 *
 * A warp lives on the node as `node.warp`; the renderer/serializer recompute the
 * deformed output from it, so warps stay re-editable. Live inspector edits compute
 * the full next spec and call `setWarpCommand` through `applyCoalesced` so a slider
 * drag is a single undo entry.
 */
import { touchDocument } from "@/model/document";
import type { NodeId, WarpSpec } from "@/model/types";
import type { Command } from "./command";

/** Set (or clear, with null) the warp modifier on each node. */
export function setWarpCommand(ids: NodeId[], warp: WarpSpec | null): Command {
  return {
    label: warp ? "Warp" : "Remove warp",
    apply(draft) {
      for (const id of ids) {
        const node = draft.nodes[id];
        if (!node) continue;
        if (warp) node.warp = warp;
        else delete node.warp;
      }
      touchDocument(draft);
    },
  };
}

/** Sensible default arc/wave specs seeded when a warp tool is first applied. */
export function defaultWarp(type: WarpSpec["type"]): WarpSpec {
  if (type === "arc") {
    return { type: "arc", direction: "top", radius: 200, amount: 0.5 };
  }
  return { type: "wave", axis: "horizontal", amplitude: 20, frequency: 2, phase: 0, direction: 1 };
}
