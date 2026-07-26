/**
 * Gradient paint commands (feature wave 3, item 4).
 *
 * The document model, DefsRenderer, and serializer already support linear/radial
 * gradients (doc.paints + PaintReference{kind:"definition"}). These commands
 * create, edit, and assign them. Gradient geometry uses objectBoundingBox units
 * (0..1) so a gradient follows its shape regardless of size/position.
 */
import { touchDocument } from "@/model/document";
import { createPaintId } from "@/model/ids";
import type {
  GradientStop,
  LinearGradientPaint,
  NodeId,
  PaintDefinition,
  RadialGradientPaint,
} from "@/model/types";
import type { Command } from "./command";

export type GradientKind = "linearGradient" | "radialGradient";
export type PaintTarget = "fill" | "stroke";

function defaultStops(seed: string): GradientStop[] {
  return [
    { offset: 0, color: seed, opacity: 1 },
    { offset: 1, color: seed, opacity: 0 },
  ];
}

/** Build a fresh gradient definition (objectBoundingBox) with the given id. */
export function makeGradient(id: string, kind: GradientKind, seed = "#000000"): PaintDefinition {
  if (kind === "linearGradient") {
    const g: LinearGradientPaint = {
      id,
      kind: "linearGradient",
      name: "Linear gradient",
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      units: "objectBoundingBox",
      spreadMethod: "pad",
      stops: defaultStops(seed),
    };
    return g;
  }
  const g: RadialGradientPaint = {
    id,
    kind: "radialGradient",
    name: "Radial gradient",
    cx: 0.5,
    cy: 0.5,
    r: 0.5,
    units: "objectBoundingBox",
    spreadMethod: "pad",
    stops: defaultStops(seed),
  };
  return g;
}

/**
 * Create a new gradient and point each node's fill/stroke at it. Returns the new
 * paint id via callback so the UI can select it for editing.
 */
export function applyGradientCommand(
  ids: NodeId[],
  target: PaintTarget,
  kind: GradientKind,
  seed = "#000000",
  idOut?: (paintId: string) => void,
): Command {
  const paintId = createPaintId();
  if (idOut) idOut(paintId);
  return {
    label: "Apply gradient",
    apply(draft) {
      draft.paints[paintId] = makeGradient(paintId, kind, seed);
      for (const id of ids) {
        const node = draft.nodes[id];
        if (!node) continue;
        node.style[target] = { kind: "definition", value: paintId, opacity: 1 };
      }
      touchDocument(draft);
    },
  };
}

/** Merge a patch (stops / coords / spread / name) into an existing gradient. */
export function updateGradientCommand(
  paintId: string,
  patch: Partial<Omit<LinearGradientPaint, "id" | "kind"> & Omit<RadialGradientPaint, "id" | "kind">>,
): Command {
  return {
    label: "Edit gradient",
    apply(draft) {
      const paint = draft.paints[paintId];
      if (paint) Object.assign(paint, patch);
      touchDocument(draft);
    },
  };
}

/** Change just the gradient kind (linear↔radial) while keeping the stops. */
export function setGradientKindCommand(paintId: string, kind: GradientKind): Command {
  return {
    label: "Gradient type",
    apply(draft) {
      const paint = draft.paints[paintId];
      if (!paint || paint.kind === kind) return;
      draft.paints[paintId] = makeGradient(paint.id, kind);
      draft.paints[paintId].stops = paint.stops;
      draft.paints[paintId].name = paint.name;
      touchDocument(draft);
    },
  };
}
