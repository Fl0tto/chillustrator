/**
 * Feature-wave-2 tests: drawing defaults + sticky style, combinable snapping
 * (grid quantize + nearest-vertex point snap), and corner rounding of any shape.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "@/store/editorStore";
import { addNodeCommand } from "@/commands/nodeCommands";
import { convertToPathCommand } from "@/commands/geometryCommands";
import { createPolygon, defaultStyle, solidPaint } from "@/model/factory";
import { buildShape } from "@/interactions/tools/shapeBuilder";
import { sessionFromNode } from "@/interactions/usePathEditor";
import { setSelectedCornerRadius } from "@/interactions/pathEditActions";
import { snapToGrid, snapMoveToGrid, snapNearestPoint } from "@/interactions/snapping";
import type { Bounds } from "@/geometry/bounds";
import type { PathNode } from "@/model/types";

describe("drawing defaults + sticky style", () => {
  beforeEach(() => useEditorStore.getState().newDocument(200, 200));

  it("defaults to no fill + black 1px stroke", () => {
    const s = defaultStyle();
    expect(s.fill).toBeNull();
    expect(s.stroke).not.toBeNull();
    expect(s.stroke?.value).toBe("#000000");
    expect(s.strokeWidth).toBe(1);
  });

  it("seeds new shapes from the store's sticky defaultStyle", () => {
    useEditorStore.getState().setDefaultStyle({ fill: solidPaint("#ff0000", 1) });
    const style = useEditorStore.getState().defaultStyle;
    const node = buildShape("rect", { x: 0, y: 0 }, { x: 10, y: 10 }, false, undefined, style);
    expect(node?.style.fill?.value).toBe("#ff0000");
  });

  it("setDefaultStyle merges partial updates", () => {
    useEditorStore.getState().setDefaultStyle({ strokeWidth: 4 });
    expect(useEditorStore.getState().defaultStyle.strokeWidth).toBe(4);
    // Fill remains whatever it was (null by fresh default) — only width changed.
    expect(useEditorStore.getState().defaultStyle.stroke?.value).toBe("#000000");
  });
});

describe("grid snapping", () => {
  it("snapToGrid rounds to the nearest multiple", () => {
    expect(snapToGrid(11, 4)).toBe(12);
    expect(snapToGrid(13, 4)).toBe(12);
    expect(snapToGrid(7, 1)).toBe(7);
    expect(snapToGrid(42, 0)).toBe(42); // size 0 is a no-op
  });

  it("snapMoveToGrid quantizes the moved bounds' top-left onto the grid", () => {
    const b: Bounds = { minX: 3, minY: 3, maxX: 13, maxY: 13 };
    // Raw move of +5,+5 → top-left goes 8,8; nearest multiple of 4 is 8,8 → dx,dy 5,5.
    expect(snapMoveToGrid(b, 5, 5, 4)).toEqual({ dx: 5, dy: 5 });
    // Raw move of +6,+6 → top-left 9,9; nearest multiple of 4 is 8 → dx,dy 5,5.
    expect(snapMoveToGrid(b, 6, 6, 4)).toEqual({ dx: 5, dy: 5 });
  });
});

describe("point (nearest vertex) snapping", () => {
  it("aligns the closest moving vertex to the closest target vertex within range", () => {
    const moving = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const targets = [{ x: 12, y: 1 }]; // near the moving vertex (10,0) after a +1,+0 move
    // Raw move +1,+0 puts (10,0) at (11,0), 1.4 from target → snaps onto (12,1).
    const res = snapNearestPoint(moving, targets, 1, 0, 5);
    expect(res.dx).toBeCloseTo(2, 6); // 10 + dx = 12
    expect(res.dy).toBeCloseTo(1, 6);
    expect(res.guides).toHaveLength(1);
  });

  it("does nothing when no target is within threshold", () => {
    const moving = [{ x: 0, y: 0 }];
    const targets = [{ x: 100, y: 100 }];
    const res = snapNearestPoint(moving, targets, 2, 3, 5);
    expect(res).toEqual({ dx: 2, dy: 3, guides: [] });
  });
});

describe("corner rounding on a converted polygon", () => {
  beforeEach(() => useEditorStore.getState().newDocument(200, 200));

  it("adds fillet arcs to selected corners of any shape", () => {
    // A hexagon primitive → convert to path → round two corners.
    const hex = createPolygon({
      points: [
        { x: 20, y: 0 },
        { x: 40, y: 12 },
        { x: 40, y: 34 },
        { x: 20, y: 46 },
        { x: 0, y: 34 },
        { x: 0, y: 12 },
      ],
    });
    useEditorStore.getState().apply(addNodeCommand(hex));

    let pathId = hex.id;
    useEditorStore.getState().apply(convertToPathCommand(hex.id, (nid) => (pathId = nid)));
    const path = useEditorStore.getState().document.nodes[pathId] as PathNode;
    // A polygon converts to straight-line segments only (no cubics yet).
    expect(path.d).not.toContain("C");

    const session = sessionFromNode(pathId, [0, 2]);
    expect(session).not.toBeNull();
    useEditorStore.getState().setPathEdit(session);
    setSelectedCornerRadius(4);

    const rounded = useEditorStore.getState().document.nodes[pathId] as PathNode;
    // Fillets are emitted as cubic segments at the rounded corners.
    expect(rounded.d).toContain("C");
    expect(rounded.d).not.toBe(path.d);
  });
});
