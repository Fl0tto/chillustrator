/**
 * Transparency tests — Part 3 (ALP-001..008).
 * Independent object/fill/stroke opacity, round-trip, coalesced slider undo.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createEmptyDocument } from "@/model/document";
import { createRect, solidPaint } from "@/model/factory";
import { addNode } from "@/model/tree";
import { serializeSvg } from "@/importExport/serializeSvg";
import { importSvg } from "@/importExport/importSvg";
import {
  setFillOpacityCommand,
  setStrokeOpacityCommand,
  setStrokeCommand,
} from "@/commands/styleCommands";
import { addNodeCommand } from "@/commands/nodeCommands";
import { useEditorStore } from "@/store/editorStore";
import type { RectNode } from "@/model/types";

describe("independent object / fill / stroke opacity", () => {
  it("keeps the three alpha values separate through export → reimport (AT-ALP-001)", () => {
    const doc = createEmptyDocument(200, 200);
    const rect = createRect({
      x: 10,
      y: 10,
      width: 50,
      height: 50,
      opacity: 0.8,
      style: { fill: solidPaint("#ff0000", 0.4), stroke: solidPaint("#000000", 0.25), strokeWidth: 2 },
    });
    addNode(doc, rect);

    const svg = serializeSvg(doc, { precision: 3 });
    expect(svg).toContain('opacity="0.8"');
    expect(svg).toContain('fill-opacity="0.4"');
    expect(svg).toContain('stroke-opacity="0.25"');

    const result = importSvg(svg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const node = result.nodes.find((n) => n.type === "rect") as RectNode;
    expect(node.opacity).toBeCloseTo(0.8, 4);
    expect(node.style.fill?.opacity).toBeCloseTo(0.4, 4);
    expect(node.style.stroke?.opacity).toBeCloseTo(0.25, 4);
  });

  it("does not flatten the three into one value", () => {
    const doc = createEmptyDocument(100, 100);
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10, opacity: 0.5, style: { fill: solidPaint("#123456", 0.5) } });
    addNode(doc, rect);
    const svg = serializeSvg(doc);
    // Node opacity and fill-opacity are emitted independently, not multiplied.
    expect(svg).toContain('opacity="0.5"');
    expect(svg).toContain('fill-opacity="0.5"');
    expect(svg).not.toContain('fill-opacity="0.25"');
  });
});

describe("fill-alpha import normalization (ALP-006)", () => {
  const parseFirst = (svg: string): RectNode | undefined => {
    const r = importSvg(svg);
    return r.ok ? (r.nodes.find((n) => n.type === "rect") as RectNode) : undefined;
  };

  it("reads fill-opacity attribute", () => {
    const n = parseFirst(`<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1" fill="#f00" fill-opacity="0.3"/></svg>`);
    expect(n?.style.fill?.opacity).toBeCloseTo(0.3, 4);
  });

  it("reads rgba() alpha", () => {
    const n = parseFirst(`<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1" fill="rgba(255,0,0,0.6)"/></svg>`);
    expect(n?.style.fill?.opacity).toBeCloseTo(0.6, 4);
    expect(n?.style.fill?.value.toLowerCase()).toBe("#ff0000");
  });

  it("reads 8-digit hex alpha", () => {
    const n = parseFirst(`<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1" fill="#00ff0080"/></svg>`);
    expect(n?.style.fill?.opacity).toBeCloseTo(128 / 255, 3);
  });

  it("reads fill-opacity from inline style", () => {
    const n = parseFirst(`<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1" style="fill:#f00;fill-opacity:0.2"/></svg>`);
    expect(n?.style.fill?.opacity).toBeCloseTo(0.2, 4);
  });
});

describe("coalesced slider undo (HST-002)", () => {
  beforeEach(() => {
    useEditorStore.getState().newDocument(200, 200);
  });

  const addRect = (): string => {
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    useEditorStore.getState().apply(addNodeCommand(rect, null, undefined, "Add"));
    return rect.id;
  };

  it("collapses a coalesced run into one undo entry", () => {
    const id = addRect();
    const before = useEditorStore.getState().history.past.length;
    const store = useEditorStore.getState();
    store.applyCoalesced(setFillOpacityCommand([id], 0.9), "fill:1");
    store.applyCoalesced(setFillOpacityCommand([id], 0.6), "fill:1");
    store.applyCoalesced(setFillOpacityCommand([id], 0.3), "fill:1");
    const after = useEditorStore.getState().history.past.length;
    expect(after - before).toBe(1);
    expect(useEditorStore.getState().document.nodes[id]?.style.fill?.opacity).toBeCloseTo(0.3, 4);

    // One undo restores the value from before the whole drag.
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().document.nodes[id]?.style.fill?.opacity).toBeCloseTo(1, 4);
  });

  it("starts a new entry when the coalesce key changes", () => {
    const id = addRect();
    const before = useEditorStore.getState().history.past.length;
    const store = useEditorStore.getState();
    store.applyCoalesced(setFillOpacityCommand([id], 0.5), "fill:A");
    store.applyCoalesced(setFillOpacityCommand([id], 0.4), "fill:A"); // merges into A
    store.applyCoalesced(setFillOpacityCommand([id], 0.3), "fill:B"); // new key → new entry
    const after = useEditorStore.getState().history.past.length;
    expect(after - before).toBe(2);
    expect(useEditorStore.getState().document.nodes[id]?.style.fill?.opacity).toBeCloseTo(0.3, 4);
  });

  it("separately handles independent stroke-opacity edits", () => {
    const id = addRect();
    useEditorStore.getState().apply(setStrokeCommand([id], solidPaint("#000000", 1)));
    const store = useEditorStore.getState();
    store.applyCoalesced(setStrokeOpacityCommand([id], 0.8), "stroke:1");
    const node = useEditorStore.getState().document.nodes[id];
    expect(node?.style.stroke?.opacity).toBeCloseTo(0.8, 4);
    // Fill opacity is untouched by a stroke-opacity edit.
    expect(node?.style.fill?.opacity).toBeCloseTo(1, 4);
  });
});
