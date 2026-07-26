/**
 * Drop-shadow effect commands (feature wave 3, item 5).
 *
 * Effects live on the node as `node.effects[]`; the renderer/serializer build one
 * `<filter>` per node from them (see geometry/filters.ts). Live inspector edits use
 * `applyCoalesced` so a slider drag is one undo entry.
 */
import { touchDocument } from "@/model/document";
import { createEffectId } from "@/model/ids";
import type { NodeId, ShadowEffect } from "@/model/types";
import type { Command } from "./command";

function defaultEffect(kind: ShadowEffect["kind"]): ShadowEffect {
  return {
    id: createEffectId(),
    kind,
    dx: kind === "outer" ? 4 : 2,
    dy: kind === "outer" ? 4 : 2,
    blur: 4,
    spread: 0,
    color: "#000000",
    opacity: kind === "outer" ? 0.4 : 0.5,
    enabled: true,
  };
}

/** Append a new outer/inner shadow to each node. */
export function addEffectCommand(
  ids: NodeId[],
  kind: ShadowEffect["kind"],
  idOut?: (effectId: string) => void,
): Command {
  return {
    label: "Add shadow",
    apply(draft) {
      for (const id of ids) {
        const node = draft.nodes[id];
        if (!node) continue;
        const effect = defaultEffect(kind);
        if (idOut) idOut(effect.id);
        node.effects = [...(node.effects ?? []), effect];
      }
      touchDocument(draft);
    },
  };
}

/** Merge a partial patch into one effect on one node. */
export function updateEffectCommand(
  id: NodeId,
  effectId: string,
  patch: Partial<Omit<ShadowEffect, "id">>,
): Command {
  return {
    label: "Change shadow",
    apply(draft) {
      const node = draft.nodes[id];
      if (!node?.effects) return;
      const effect = node.effects.find((e) => e.id === effectId);
      if (effect) Object.assign(effect, patch);
      touchDocument(draft);
    },
  };
}

/** Remove one effect from a node. */
export function removeEffectCommand(id: NodeId, effectId: string): Command {
  return {
    label: "Remove shadow",
    apply(draft) {
      const node = draft.nodes[id];
      if (!node?.effects) return;
      node.effects = node.effects.filter((e) => e.id !== effectId);
      if (node.effects.length === 0) delete node.effects;
      touchDocument(draft);
    },
  };
}
