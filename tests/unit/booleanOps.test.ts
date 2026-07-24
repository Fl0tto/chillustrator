/**
 * Boolean operation tests (Phase 0.5 AT-BLN-001..008).
 * Drives the real store + engine + commands end to end.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "@/store/editorStore";
import { addNodeCommand } from "@/commands/nodeCommands";
import { convertToPathCommand } from "@/commands/geometryCommands";
import { runBoolean, booleanEligibility } from "@/interactions/booleanOps";
import { createRect } from "@/model/factory";
import { translate } from "@/geometry/matrix";
import { parsePath } from "@/geometry/pathParser";
import { geometryBounds } from "@/geometry/pathData";
import type { PathNode } from "@/model/types";

function reset() {
  useEditorStore.getState().newDocument(200, 200);
}

/** Add a rect and return its id. */
function addRect(x: number, y: number, w: number, h: number, extra: Partial<Parameters<typeof createRect>[0]> = {}) {
  const rect = createRect({ x, y, width: w, height: h, ...extra });
  useEditorStore.getState().apply(addNodeCommand(rect));
  return rect.id;
}

function onlyPath(): PathNode {
  const doc = useEditorStore.getState().document;
  const nodes = Object.values(doc.nodes);
  expect(nodes).toHaveLength(1);
  expect(nodes[0].type).toBe("path");
  return nodes[0] as PathNode;
}

function pathBounds(p: PathNode) {
  return geometryBounds(parsePath(p.d).geometry);
}

describe("convertToPath (CVP)", () => {
  beforeEach(reset);
  it("replaces a rect with an equivalent path in one undo step", () => {
    const id = addRect(10, 20, 30, 40);
    useEditorStore.getState().apply(convertToPathCommand(id));
    const p = onlyPath();
    const b = pathBounds(p);
    expect([b.minX, b.minY, b.maxX, b.maxY]).toEqual([10, 20, 40, 60]);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().document.nodes[id]?.type).toBe("rect");
  });
});

describe("eligibility (BLN-UI)", () => {
  beforeEach(reset);
  it("requires two same-parent non-open shapes", () => {
    const a = addRect(0, 0, 10, 10);
    const doc = useEditorStore.getState().document;
    expect(booleanEligibility(doc, [a]).ok).toBe(false);
    const b = addRect(5, 5, 10, 10);
    expect(booleanEligibility(useEditorStore.getState().document, [a, b]).ok).toBe(true);
  });
});

describe("Union (AT-BLN-001)", () => {
  beforeEach(reset);
  it("merges two overlapping rects and is undoable/redoable", async () => {
    const a = addRect(0, 0, 10, 10);
    const b = addRect(5, 5, 10, 10);
    useEditorStore.getState().setSelection([a, b]);

    const res = await runBoolean("union");
    expect(res.ok).toBe(true);
    const p = onlyPath();
    const bnds = pathBounds(p);
    expect(bnds.minX).toBeCloseTo(0, 3);
    expect(bnds.minY).toBeCloseTo(0, 3);
    expect(bnds.maxX).toBeCloseTo(15, 3);
    expect(bnds.maxY).toBeCloseTo(15, 3);

    useEditorStore.getState().undo();
    const after = useEditorStore.getState().document;
    expect(Object.keys(after.nodes)).toHaveLength(2);
    expect(after.nodes[a]?.type).toBe("rect");

    useEditorStore.getState().redo();
    expect(Object.values(useEditorStore.getState().document.nodes)).toHaveLength(1);
  });
});

describe("Intersect (AT-BLN-003)", () => {
  beforeEach(reset);
  it("keeps only the shared region", async () => {
    const a = addRect(0, 0, 10, 10);
    const b = addRect(5, 5, 10, 10);
    useEditorStore.getState().setSelection([a, b]);
    const res = await runBoolean("intersect");
    expect(res.ok).toBe(true);
    const bnds = pathBounds(onlyPath());
    expect(bnds.minX).toBeCloseTo(5, 3);
    expect(bnds.minY).toBeCloseTo(5, 3);
    expect(bnds.maxX).toBeCloseTo(10, 3);
    expect(bnds.maxY).toBeCloseTo(10, 3);
  });
});

describe("Subtract front (AT-BLN-002)", () => {
  beforeEach(reset);
  it("removes the front shape from the back", async () => {
    const back = addRect(0, 0, 10, 10);
    const front = addRect(5, 5, 10, 10); // added later → front-most
    useEditorStore.getState().setSelection([back, front]);
    const res = await runBoolean("subtract");
    expect(res.ok).toBe(true);
    // Result is the back rect minus the overlap: bounds still 0..10.
    const bnds = pathBounds(onlyPath());
    expect(bnds.minX).toBeCloseTo(0, 3);
    expect(bnds.maxX).toBeCloseTo(10, 3);
  });
});

describe("Exclude (AT-BLN-004)", () => {
  beforeEach(reset);
  it("produces a compound result spanning both shapes", async () => {
    const a = addRect(0, 0, 10, 10);
    const b = addRect(5, 5, 10, 10);
    useEditorStore.getState().setSelection([a, b]);
    const res = await runBoolean("exclude");
    expect(res.ok).toBe(true);
    const p = onlyPath();
    expect(p.style.fillRule).toBe("evenodd");
    const bnds = pathBounds(p);
    expect(bnds.minX).toBeCloseTo(0, 3);
    expect(bnds.maxX).toBeCloseTo(15, 3);
  });
});

describe("Transformed operands (AT-BLN-005)", () => {
  beforeEach(reset);
  it("resolves world transforms before combining", async () => {
    const a = addRect(0, 0, 10, 10);
    const b = addRect(0, 0, 10, 10, { transform: translate(5, 5) }); // world 5..15
    useEditorStore.getState().setSelection([a, b]);
    const res = await runBoolean("union");
    expect(res.ok).toBe(true);
    const bnds = pathBounds(onlyPath());
    expect(bnds.minX).toBeCloseTo(0, 3);
    expect(bnds.maxX).toBeCloseTo(15, 3);
  });
});

describe("Empty result (AT-BLN-008)", () => {
  beforeEach(reset);
  it("leaves sources unchanged and reports a warning", async () => {
    const a = addRect(0, 0, 10, 10);
    const b = addRect(50, 50, 10, 10); // disjoint
    useEditorStore.getState().setSelection([a, b]);
    const res = await runBoolean("intersect");
    expect(res.ok).toBe(false);
    expect(res.warning).toBeTruthy();
    expect(Object.keys(useEditorStore.getState().document.nodes)).toHaveLength(2);
  });
});
