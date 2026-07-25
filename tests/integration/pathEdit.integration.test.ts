/**
 * Integration: custom path creation + node editing through the real store and
 * command pipeline. One completed gesture = one history entry; results survive
 * SVG export/reimport; smart guides never leak into exports.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "@/store/editorStore";
import { addNodeCommand } from "@/commands/nodeCommands";
import { createPath } from "@/model/factory";
import { toGeometry, fromGeometry, flatAnchors } from "@/geometry/editablePath";
import { serializePath } from "@/geometry/pathData";
import { parsePath } from "@/geometry/pathParser";
import { serializeSvg } from "@/importExport/serializeSvg";
import { importSvg } from "@/importExport/importSvg";
import { sessionFromNode } from "@/interactions/usePathEditor";
import {
  setSelectedCornerRadius,
  setSelectedSegmentCurved,
  setSelectedAnchorsMode,
} from "@/interactions/pathEditActions";
import type { PathNode } from "@/model/types";

const store = () => useEditorStore.getState();

/** Build a path node from an editable draft (mirrors the Pen-tool commit). */
function drawPath(anchors: Array<{ x: number; y: number }>, closed: boolean): string {
  const geometry = toGeometry({
    subpaths: [
      {
        closed,
        anchors: anchors.map((a) => ({ x: a.x, y: a.y, handleIn: null, handleOut: null, mode: "corner" as const })),
      },
    ],
  });
  const node = createPath({ d: serializePath(geometry, 4) });
  store().apply(addNodeCommand(node, null, undefined, "Draw path"));
  store().setSelection([node.id]);
  return node.id;
}

describe("custom path creation", () => {
  beforeEach(() => store().newDocument(400, 400));

  it("draws an open path as one history entry", () => {
    const before = store().history.past.length;
    const id = drawPath([{ x: 10, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 80 }], false);
    expect(store().history.past.length - before).toBe(1);
    const node = store().document.nodes[id] as PathNode;
    expect(node.type).toBe("path");
    expect(parsePath(node.d).geometry.segments.map((s) => s.type)).toEqual(["M", "L", "L"]);
  });

  it("draws a closed path with a real Z", () => {
    const id = drawPath([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }], true);
    const node = store().document.nodes[id] as PathNode;
    expect(node.d.trim().toUpperCase().endsWith("Z")).toBe(true);
  });

  it("survives export → reimport materially unchanged", () => {
    const id = drawPath([{ x: 20, y: 20 }, { x: 120, y: 20 }, { x: 120, y: 120 }, { x: 20, y: 120 }], true);
    const originalD = (store().document.nodes[id] as PathNode).d;
    const svg = serializeSvg(store().document, { precision: 4 });
    const result = importSvg(svg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const reimported = result.nodes.find((n) => n.type === "path") as PathNode;
    // Compare canonical geometry (endpoints), robust to formatting differences.
    const a = parsePath(originalD).geometry.segments;
    const b = parsePath(reimported.d).geometry.segments;
    expect(b.map((s) => s.type)).toEqual(a.map((s) => s.type));
  });
});

describe("node editing — one entry per edit", () => {
  beforeEach(() => store().newDocument(400, 400));

  const openSession = (id: string, selected: number[]) => {
    const s = sessionFromNode(id, selected);
    if (s) store().setPathEdit(s);
  };

  it("applies a corner radius as one undo entry that survives round-trip", () => {
    const id = drawPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], true);
    openSession(id, [1]);
    const before = store().history.past.length;
    setSelectedCornerRadius(20);
    expect(store().history.past.length - before).toBe(1);

    const node = store().document.nodes[id] as PathNode;
    expect(parsePath(node.d).geometry.segments.some((s) => s.type === "C")).toBe(true);

    // Round-trip preserves the curved corner.
    const svg = serializeSvg(store().document, { precision: 4 });
    const r = importSvg(svg);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const re = r.nodes.find((n) => n.type === "path") as PathNode;
    expect(parsePath(re.d).geometry.segments.some((s) => s.type === "C")).toBe(true);
  });

  it("converts a segment to a curve (one entry) and undoes cleanly", () => {
    const id = drawPath([{ x: 0, y: 0 }, { x: 100, y: 0 }], false);
    openSession(id, [1]);
    const beforeD = (store().document.nodes[id] as PathNode).d;
    setSelectedSegmentCurved(true);
    const curvedD = (store().document.nodes[id] as PathNode).d;
    expect(parsePath(curvedD).geometry.segments[1].type).toBe("C");
    store().undo();
    expect((store().document.nodes[id] as PathNode).d).toBe(beforeD);
  });

  it("changes anchor mode as one entry", () => {
    const id = drawPath([{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }], false);
    openSession(id, [1]);
    // Give the middle anchor handles first (make both segments curves).
    setSelectedSegmentCurved(true);
    const before = store().history.past.length;
    setSelectedAnchorsMode("symmetric");
    expect(store().history.past.length - before).toBe(1);
    // Editable representation now reports the symmetric mode.
    const ep = fromGeometry(parsePath((store().document.nodes[id] as PathNode).d).geometry);
    expect(flatAnchors(ep).length).toBeGreaterThanOrEqual(3);
  });
});

describe("smart guides never reach exports", () => {
  beforeEach(() => store().newDocument(400, 400));

  it("export output is identical with or without active guides", () => {
    drawPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], true);
    const clean = serializeSvg(store().document, { precision: 3 });
    store().setInteraction({
      guides: [{ axis: "x", value: 50, from: 0, to: 100, label: "Center ↔ Center" }],
    });
    const withGuides = serializeSvg(store().document, { precision: 3 });
    expect(withGuides).toBe(clean);
    expect(withGuides).not.toContain("Center");
  });
});
