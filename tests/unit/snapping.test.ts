/**
 * Smart alignment (snapping) tests — Part 2.
 * Edge/center/quarter/anchor snapping, direction ranking, hysteresis, rotation.
 */
import { describe, it, expect } from "vitest";
import {
  collectSnapCandidates,
  collectRotationAngles,
  snapMove,
  snapPoint,
  snapRotation,
  snapAxis,
  emptySnapState,
  type SnapCandidates,
  type SnapLine,
} from "@/interactions/snapping";
import { createEmptyDocument } from "@/model/document";
import { addNode } from "@/model/tree";
import { createPath, createRect } from "@/model/factory";
import { rotate } from "@/geometry/matrix";
import type { Bounds } from "@/geometry/bounds";

const box = (minX: number, minY: number, maxX: number, maxY: number): Bounds => ({ minX, minY, maxX, maxY });

function xCand(value: number, role: SnapLine["role"] = "center"): SnapLine {
  return { axis: "x", value, role, span: [0, 100] };
}

describe("snapMove — edge / center / quarter", () => {
  it("snaps center to a center candidate", () => {
    const cands: SnapCandidates = { x: [xCand(50, "center")], y: [] };
    const r = snapMove(box(0, 0, 10, 10), 44, 0, cands, 5);
    expect(r.dx).toBe(45); // center 49 → 50
    expect(r.guides[0].label).toBe("Center ↔ Center");
  });

  it("snaps a right edge onto a left edge", () => {
    const cands: SnapCandidates = { x: [xCand(32, "left")], y: [] };
    const r = snapMove(box(0, 0, 10, 10), 20, 0, cands, 5); // right edge at 30 → 32
    expect(r.dx).toBe(22);
    expect(r.guides[0].label).toBe("Right edge ↔ Left edge");
  });

  it("snaps a quarter position", () => {
    const cands: SnapCandidates = { x: [xCand(27, "q75")], y: [] };
    // moving box q25 = 2.5, q75 = 7.5; move by 20 → q75 = 27.5 → 27
    const r = snapMove(box(0, 0, 10, 10), 20, 0, cands, 5);
    expect(r.dx).toBeCloseTo(19.5, 5);
    expect(r.guides[0].label).toBe("75% ↔ 75%");
  });
});

describe("direction-sensitive ranking", () => {
  it("moving right prefers the right-edge candidate", () => {
    const cands: SnapCandidates = { x: [xCand(18, "center"), xCand(32, "left")], y: [] };
    const r = snapMove(box(0, 0, 10, 10), 20, 0, cands, 5);
    expect(r.dx).toBe(22); // right edge → 32, not left edge → 18
    expect(r.guides[0].label).toBe("Right edge ↔ Left edge");
  });

  it("moving left prefers the left-edge candidate", () => {
    // Two equidistant rivals: left edge → -13, right edge → +3 (both dist 3).
    const cands: SnapCandidates = { x: [xCand(-13, "right"), xCand(3, "left")], y: [] };
    const r = snapMove(box(0, 0, 10, 10), -10, 0, cands, 5);
    expect(r.dx).toBe(-13); // leading (left) edge wins
    expect(r.guides[0].label).toBe("Left edge ↔ Right edge");
  });
});

describe("hysteresis", () => {
  it("keeps a lock while inside the release band despite a closer rival", () => {
    const cands: SnapCandidates = { x: [xCand(50, "center"), xCand(56, "center")], y: [] };
    const f1 = snapMove(box(0, 0, 10, 10), 44, 0, cands, 5); // center 49 → lock 50
    expect(f1.dx).toBe(45);
    expect(f1.state.x.value).toBe(50);
    // center now 55; rival 56 is closer, but 50 is still within release band.
    const f2 = snapMove(box(0, 0, 10, 10), 50, 0, cands, 5, f1.state);
    expect(f2.state.x.value).toBe(50); // stayed locked, no flicker
    expect(f2.dx).toBe(45); // pulled back to 50
  });

  it("releases the lock once outside the release band", () => {
    const cands: SnapCandidates = { x: [xCand(50, "center")], y: [] };
    const f1 = snapMove(box(0, 0, 10, 10), 44, 0, cands, 5);
    const f2 = snapMove(box(0, 0, 10, 10), 62, 0, cands, 5, f1.state); // center 67, far
    expect(f2.state.x.value).toBeNull();
    expect(f2.dx).toBe(62);
  });
});

describe("candidate collection", () => {
  it("includes artboard center + object edges + path anchors", () => {
    const doc = createEmptyDocument(200, 200);
    addNode(doc, createRect({ x: 20, y: 20, width: 40, height: 40 }));
    addNode(doc, createPath({ d: "M100 100 L180 100" }));
    const c = collectSnapCandidates(doc, []);
    // Artboard center.
    expect(c.x.some((l) => l.role === "center" && Math.abs(l.value - 100) < 1e-6)).toBe(true);
    // Rect edges.
    expect(c.x.some((l) => l.role === "left" && Math.abs(l.value - 20) < 1e-6)).toBe(true);
    // Path anchors.
    expect(c.x.some((l) => l.role === "anchor" && Math.abs(l.value - 100) < 1e-6)).toBe(true);
    expect(c.x.some((l) => l.role === "anchor" && Math.abs(l.value - 180) < 1e-6)).toBe(true);
  });

  it("excludes the moving selection from candidates", () => {
    const doc = createEmptyDocument(200, 200);
    const rect = createRect({ x: 20, y: 20, width: 40, height: 40 });
    addNode(doc, rect);
    const c = collectSnapCandidates(doc, [rect.id]);
    expect(c.x.some((l) => l.role === "left" && Math.abs(l.value - 20) < 1e-6)).toBe(false);
  });
});

describe("snapPoint — anchor placement", () => {
  it("snaps a placed point onto a candidate anchor", () => {
    const cands: SnapCandidates = {
      x: [{ axis: "x", value: 100, role: "anchor", span: [0, 10] }],
      y: [{ axis: "y", value: 100, role: "anchor", span: [0, 10] }],
    };
    const r = snapPoint({ x: 97, y: 103 }, cands, 5);
    expect(r.x).toBe(100);
    expect(r.y).toBe(100);
    expect(r.guides.length).toBe(2);
  });
});

describe("rotation snapping — parallel / perpendicular", () => {
  it("collects nearby object angles plus their parallels/perpendiculars", () => {
    const doc = createEmptyDocument(200, 200);
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10, transform: rotate(30) });
    addNode(doc, rect);
    const angles = collectRotationAngles(doc, []);
    for (const a of [30, 120, 210, 300]) {
      expect(angles.some((x) => Math.abs(x - a) < 1e-6)).toBe(true);
    }
  });

  it("labels parallel and 90°", () => {
    const angles = [0, 45, 90, 135, 30, 120, 210, 300];
    expect(snapRotation(2, angles, 5)).toMatchObject({ deg: 2 + shortest(2, 0), guide: "Parallel" });
    expect(snapRotation(89, angles, 5).guide).toBe("90°");
    expect(snapRotation(28, angles, 5).guide).toBe("30°");
    expect(snapRotation(60, angles, 5).guide).toBeNull(); // nothing within 5°
  });
});

describe("snapAxis — disabled", () => {
  it("does nothing when threshold ≤ 0 (Smart Guides off)", () => {
    const r = snapAxis([{ value: 5, role: "center" }], [xCand(6)], 0, 0, emptySnapState().x);
    expect(r.offset).toBe(0);
    expect(r.line).toBeNull();
  });
});

function shortest(from: number, to: number): number {
  let d = to - from;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}
