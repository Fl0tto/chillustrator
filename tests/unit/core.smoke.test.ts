/**
 * Wave-1 core smoke test — validates the contract layer end to end before
 * feature agents build on it. Agent G expands unit coverage in wave 3.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  identityMatrix,
  multiply,
  invert,
  rotate,
  applyToPoint,
  decompose,
  matrixEquals,
} from "@/geometry/matrix";
import { useEditorStore } from "@/store/editorStore";
import { createRect } from "@/model/factory";
import { addNodeCommand, deleteNodesCommand } from "@/commands/nodeCommands";
import { translateNodesCommand } from "@/commands/transformCommands";
import { groupNodesCommand } from "@/commands/layerCommands";

describe("matrix", () => {
  it("multiply by identity is a no-op", () => {
    const m = rotate(30);
    expect(matrixEquals(multiply(m, identityMatrix()), m)).toBe(true);
  });

  it("invert undoes a transform", () => {
    const m = multiply(rotate(37), { a: 2, b: 0, c: 0, d: 3, e: 10, f: -5 });
    const inv = invert(m)!;
    const p = { x: 12, y: -8 };
    const round = applyToPoint(inv, applyToPoint(m, p));
    expect(round.x).toBeCloseTo(p.x, 6);
    expect(round.y).toBeCloseTo(p.y, 6);
  });

  it("decompose recovers rotation", () => {
    const d = decompose(rotate(45));
    expect(d.rotation).toBeCloseTo(45, 6);
  });
});

describe("store history", () => {
  beforeEach(() => {
    useEditorStore.getState().newDocument(1200, 800);
  });

  it("adds a node and collapses to one undo entry", () => {
    const s = useEditorStore.getState();
    const rect = createRect({ x: 0, y: 0, width: 100, height: 50 });
    s.apply(addNodeCommand(rect));
    expect(useEditorStore.getState().document.rootNodeIds).toHaveLength(1);
    expect(useEditorStore.getState().canUndo()).toBe(true);

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().document.rootNodeIds).toHaveLength(0);

    useEditorStore.getState().redo();
    expect(useEditorStore.getState().document.rootNodeIds).toHaveLength(1);
  });

  it("move is reversible and preserves other nodes", () => {
    const s = useEditorStore.getState();
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 100, y: 100, width: 10, height: 10 });
    s.apply(addNodeCommand(a));
    s.apply(addNodeCommand(b));
    s.apply(translateNodesCommand([a.id], 25, 40));

    let doc = useEditorStore.getState().document;
    expect(doc.nodes[a.id].transform.e).toBeCloseTo(25);
    expect(doc.nodes[a.id].transform.f).toBeCloseTo(40);
    expect(doc.nodes[b.id].transform.e).toBeCloseTo(0);

    useEditorStore.getState().undo();
    doc = useEditorStore.getState().document;
    expect(doc.nodes[a.id].transform.e).toBeCloseTo(0);
  });

  it("group then undo restores original parents and order", () => {
    const s = useEditorStore.getState();
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 20, y: 0, width: 10, height: 10 });
    s.apply(addNodeCommand(a));
    s.apply(addNodeCommand(b));

    let groupId = "";
    s.apply(groupNodesCommand([a.id, b.id], (id) => (groupId = id)));
    let doc = useEditorStore.getState().document;
    expect(doc.nodes[groupId].type).toBe("group");
    expect(doc.nodes[a.id].parentId).toBe(groupId);
    expect(doc.rootNodeIds).toEqual([groupId]);

    useEditorStore.getState().undo();
    doc = useEditorStore.getState().document;
    expect(doc.nodes[groupId]).toBeUndefined();
    expect(doc.nodes[a.id].parentId).toBeNull();
    expect(doc.rootNodeIds).toEqual([a.id, b.id]);
  });

  it("delete removes node and descendants", () => {
    const s = useEditorStore.getState();
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    s.apply(addNodeCommand(a));
    s.apply(deleteNodesCommand([a.id]));
    expect(useEditorStore.getState().document.nodes[a.id]).toBeUndefined();
  });
});
