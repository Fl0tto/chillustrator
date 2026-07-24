/**
 * Shape Builder region arrangement tests (Illustrator-style).
 * Covers face computation, point hit-testing, and merge, plus the commit path.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "@/store/editorStore";
import { addNodeCommand } from "@/commands/nodeCommands";
import { buildOperands } from "@/interactions/booleanOps";
import { commitShapeBuilder } from "@/interactions/useShapeBuilder";
import {
  computeFaces,
  faceAtPoint,
  mergeFaces,
  pointInMultiPolygon,
} from "@/geometry/adapters/shapeArrangement";
import { createRect } from "@/model/factory";
import { parsePath } from "@/geometry/pathParser";
import { geometryBounds } from "@/geometry/pathData";
import type { PathNode } from "@/model/types";

function reset() {
  useEditorStore.getState().newDocument(200, 200);
}

function addRect(x: number, y: number, w: number, h: number) {
  const rect = createRect({ x, y, width: w, height: h });
  useEditorStore.getState().apply(addNodeCommand(rect));
  return rect.id;
}

describe("computeFaces — arrangement", () => {
  beforeEach(reset);

  it("splits two overlapping rects into 3 atomic faces", () => {
    const a = addRect(0, 0, 10, 10);
    const b = addRect(5, 0, 10, 10);
    const operands = buildOperands(useEditorStore.getState().document, [a, b]);
    const faces = computeFaces(operands);
    // left-only, overlap, right-only.
    expect(faces.length).toBe(3);
  });

  it("produces disjoint faces that each contain their own sample point", () => {
    const a = addRect(0, 0, 10, 10);
    const b = addRect(5, 0, 10, 10);
    const faces = computeFaces(buildOperands(useEditorStore.getState().document, [a, b]));
    // The overlap region [5,10]x[0,10]; its center (7.5,5) is in exactly one face.
    const hits = faces.filter((f) => pointInMultiPolygon({ x: 7.5, y: 5 }, f.polygon));
    expect(hits).toHaveLength(1);
  });

  it("scales to many overlapping rects without exploding", () => {
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) ids.push(addRect(i * 3, 0, 10, 10));
    const faces = computeFaces(buildOperands(useEditorStore.getState().document, ids));
    // 8 overlapping strips → a modest number of faces, definitely not 2^8.
    expect(faces.length).toBeGreaterThan(8);
    expect(faces.length).toBeLessThan(40);
  });
});

describe("faceAtPoint + mergeFaces", () => {
  beforeEach(reset);

  it("picks the overlap face and merges chosen faces into geometry", () => {
    const a = addRect(0, 0, 10, 10);
    const b = addRect(5, 0, 10, 10);
    const faces = computeFaces(buildOperands(useEditorStore.getState().document, [a, b]));

    const overlapIdx = faceAtPoint(faces, { x: 7.5, y: 5 });
    expect(overlapIdx).toBeGreaterThanOrEqual(0);
    const merged = mergeFaces(faces, [overlapIdx]);
    expect(merged).not.toBeNull();
    const bnds = geometryBounds(merged!);
    expect(bnds.minX).toBeCloseTo(5, 2);
    expect(bnds.maxX).toBeCloseTo(10, 2);
  });

  it("returns -1 outside every face", () => {
    const a = addRect(0, 0, 10, 10);
    const b = addRect(5, 0, 10, 10);
    const faces = computeFaces(buildOperands(useEditorStore.getState().document, [a, b]));
    expect(faceAtPoint(faces, { x: 100, y: 100 })).toBe(-1);
  });
});

describe("commitShapeBuilder — keeps sources, adds merged path", () => {
  beforeEach(reset);

  it("adds a new path for the kept faces and leaves originals intact", () => {
    const a = addRect(0, 0, 10, 10);
    const b = addRect(5, 0, 10, 10);
    const faces = computeFaces(buildOperands(useEditorStore.getState().document, [a, b]));
    const overlapIdx = faceAtPoint(faces, { x: 7.5, y: 5 });

    useEditorStore.getState().startShapeBuilder({
      faces,
      kept: [overlapIdx],
      hovered: -1,
      sourceIds: [a, b],
    });
    const ok = commitShapeBuilder();
    expect(ok).toBe(true);

    const doc = useEditorStore.getState().document;
    // Originals kept + one new path.
    expect(doc.nodes[a]?.type).toBe("rect");
    expect(doc.nodes[b]?.type).toBe("rect");
    const paths = Object.values(doc.nodes).filter((n): n is PathNode => n.type === "path");
    expect(paths).toHaveLength(1);
    const bnds = geometryBounds(parsePath(paths[0].d).geometry);
    expect(bnds.minX).toBeCloseTo(5, 2);
    expect(bnds.maxX).toBeCloseTo(10, 2);

    // One undo removes just the built path.
    useEditorStore.getState().undo();
    expect(Object.values(useEditorStore.getState().document.nodes).filter((n) => n.type === "path")).toHaveLength(0);
  });
});
