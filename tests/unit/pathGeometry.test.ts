/**
 * Canonical path geometry tests (Phase 0.5 PTH-001..004, CVP-001..003).
 * Parser, serializer, exact bounds, flattening, and primitive conversion.
 */
import { describe, it, expect } from "vitest";
import { parsePath } from "@/geometry/pathParser";
import { serializePath, geometryBounds, flattenGeometry, transformGeometry } from "@/geometry/pathData";
import { rectToGeometry, ellipseToGeometry, nodeToGeometry } from "@/geometry/pathConvert";
import { createRect, createEllipse, createPolygon } from "@/model/factory";
import { rotate } from "@/geometry/matrix";

describe("parsePath — commands", () => {
  it("parses absolute M/L/Z", () => {
    const { geometry, error } = parsePath("M0 0 L10 0 L10 10 Z");
    expect(error).toBeUndefined();
    expect(geometry.segments.map((s) => s.type)).toEqual(["M", "L", "L", "Z"]);
  });

  it("resolves relative commands to absolute", () => {
    const { geometry } = parsePath("m5 5 l10 0 l0 10");
    const pts = geometry.segments.filter((s) => s.type === "L") as Array<{ x: number; y: number }>;
    expect(pts[0]).toMatchObject({ x: 15, y: 5 });
    expect(pts[1]).toMatchObject({ x: 15, y: 15 });
  });

  it("expands H and V into lines", () => {
    const { geometry } = parsePath("M0 0 H10 V10");
    expect(geometry.segments).toEqual([
      { type: "M", x: 0, y: 0 },
      { type: "L", x: 10, y: 0 },
      { type: "L", x: 10, y: 10 },
    ]);
  });

  it("elevates quadratic Q to cubic C", () => {
    const { geometry } = parsePath("M0 0 Q5 10 10 0");
    const c = geometry.segments[1];
    expect(c.type).toBe("C");
    if (c.type === "C") {
      // Control points at 2/3 toward the quad control (5,10).
      expect(c.x1).toBeCloseTo(3.333, 2);
      expect(c.y1).toBeCloseTo(6.667, 2);
      expect(c.x).toBe(10);
      expect(c.y).toBe(0);
    }
  });

  it("reflects S shorthand off the previous cubic", () => {
    const { geometry } = parsePath("M0 0 C0 5 5 5 5 0 S10 -5 10 0");
    const s = geometry.segments[2];
    expect(s.type).toBe("C");
    if (s.type === "C") {
      // Reflection of prev ctrl (5,5) about current point (5,0) → (5,-5).
      expect(s.x1).toBeCloseTo(5, 5);
      expect(s.y1).toBeCloseTo(-5, 5);
    }
  });

  it("converts an arc A into cubic segments ending at the target", () => {
    const { geometry, error } = parsePath("M0 0 A5 5 0 0 1 10 0");
    expect(error).toBeUndefined();
    const cubics = geometry.segments.filter((s) => s.type === "C");
    expect(cubics.length).toBeGreaterThanOrEqual(1);
    const last = geometry.segments[geometry.segments.length - 1];
    if (last.type === "C") {
      expect(last.x).toBeCloseTo(10, 3);
      expect(last.y).toBeCloseTo(0, 3);
    }
  });

  it("handles implicit repeated L after M", () => {
    const { geometry } = parsePath("M0 0 10 0 10 10");
    expect(geometry.segments.map((s) => s.type)).toEqual(["M", "L", "L"]);
  });

  it("reports an error for empty input", () => {
    expect(parsePath("").error).toBeDefined();
    expect(parsePath("   ").error).toBeDefined();
  });
});

describe("serializePath — round trip", () => {
  it("re-serializes to an equivalent path", () => {
    const d = "M0 0L10 0L10 10Z";
    const { geometry } = parsePath(d);
    expect(serializePath(geometry, 0)).toBe("M0 0L10 0L10 10Z");
  });

  it("survives parse→serialize→parse with equal segment counts", () => {
    const d = "M10 10 C 20 10 20 20 10 20 S 0 30 10 30 Q 15 35 20 30 Z";
    const first = parsePath(d).geometry;
    const round = parsePath(serializePath(first, 4)).geometry;
    expect(round.segments.length).toBe(first.segments.length);
  });
});

describe("geometryBounds — exact extrema (PTH-004)", () => {
  it("bounds a cubic beyond its endpoints", () => {
    // A curve that bulges to y=+7.5 at t=0.5 though endpoints are at y=0.
    const { geometry } = parsePath("M0 0 C0 10 10 10 10 0");
    const b = geometryBounds(geometry);
    expect(b.minX).toBeCloseTo(0, 5);
    expect(b.maxX).toBeCloseTo(10, 5);
    expect(b.minY).toBeCloseTo(0, 5);
    expect(b.maxY).toBeCloseTo(7.5, 5);
  });

  it("matches a rectangle exactly", () => {
    const { geometry } = parsePath("M2 3 L12 3 L12 11 L2 11 Z");
    const b = geometryBounds(geometry);
    expect([b.minX, b.minY, b.maxX, b.maxY]).toEqual([2, 3, 12, 11]);
  });
});

describe("primitive → path (CVP)", () => {
  it("converts a plain rect to a 4-line closed path", () => {
    const rect = createRect({ x: 0, y: 0, width: 10, height: 20 });
    const g = rectToGeometry(rect);
    expect(g.segments.map((s) => s.type)).toEqual(["M", "L", "L", "L", "Z"]);
    const b = geometryBounds(g);
    expect([b.minX, b.minY, b.maxX, b.maxY]).toEqual([0, 0, 10, 20]);
  });

  it("converts a rounded rect to curved corners with matching bounds", () => {
    const rect = createRect({ x: 0, y: 0, width: 40, height: 30, rx: 8 });
    const g = rectToGeometry(rect);
    expect(g.segments.some((s) => s.type === "C")).toBe(true);
    const b = geometryBounds(g);
    expect(b.minX).toBeCloseTo(0, 3);
    expect(b.maxX).toBeCloseTo(40, 3);
    expect(b.maxY).toBeCloseTo(30, 3);
  });

  it("converts an ellipse to 4 cubics with correct bounds", () => {
    const el = createEllipse({ cx: 50, cy: 50, rx: 20, ry: 10 });
    const g = ellipseToGeometry(el);
    expect(g.segments.filter((s) => s.type === "C").length).toBe(4);
    const b = geometryBounds(g);
    expect(b.minX).toBeCloseTo(30, 3);
    expect(b.maxX).toBeCloseTo(70, 3);
    expect(b.minY).toBeCloseTo(40, 3);
    expect(b.maxY).toBeCloseTo(60, 3);
  });

  it("nodeToGeometry handles a closed polygon", () => {
    const poly = createPolygon({
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 8 },
      ],
      closed: true,
    });
    const g = nodeToGeometry(poly);
    expect(g?.segments.map((s) => s.type)).toEqual(["M", "L", "L", "Z"]);
  });
});

describe("flatten & transform", () => {
  it("flattens an ellipse into a closed polyline approximating its bounds", () => {
    const el = createEllipse({ cx: 0, cy: 0, rx: 10, ry: 10 });
    const contours = flattenGeometry(ellipseToGeometry(el), 0.05);
    expect(contours).toHaveLength(1);
    expect(contours[0].closed).toBe(true);
    const maxR = Math.max(...contours[0].points.map((p) => Math.hypot(p.x, p.y)));
    expect(maxR).toBeCloseTo(10, 1);
  });

  it("transforms geometry by a matrix", () => {
    const { geometry } = parsePath("M0 0 L10 0");
    const rotated = transformGeometry(geometry, rotate(90));
    const last = rotated.segments[1];
    if (last.type === "L") {
      expect(last.x).toBeCloseTo(0, 6);
      expect(last.y).toBeCloseTo(10, 6);
    }
  });
});
