/**
 * Editable path model tests — Pen/node-editor geometry (Part 1).
 * Round-trips, anchor/handle editing, segment conversion, corner-radius clamp.
 */
import { describe, it, expect } from "vitest";
import { parsePath } from "@/geometry/pathParser";
import { geometryBounds } from "@/geometry/pathData";
import {
  fromGeometry,
  toGeometry,
  moveAnchor,
  dragHandle,
  setAnchorMode,
  makeSegmentCurved,
  makeSegmentStraight,
  clampCornerRadius,
  flatAnchors,
  type EditablePath,
} from "@/geometry/editablePath";

function round(d: string): EditablePath {
  return fromGeometry(parsePath(d).geometry);
}

describe("fromGeometry / toGeometry round-trips", () => {
  it("preserves an open straight polyline", () => {
    const ep = round("M0 0 L10 0 L10 10");
    expect(ep.subpaths).toHaveLength(1);
    expect(ep.subpaths[0].closed).toBe(false);
    expect(ep.subpaths[0].anchors).toHaveLength(3);
    const seg = toGeometry(ep).segments.map((s) => s.type);
    expect(seg).toEqual(["M", "L", "L"]);
  });

  it("preserves a closed square with a clean Z", () => {
    const ep = round("M0 0 L10 0 L10 10 L0 10 Z");
    expect(ep.subpaths[0].closed).toBe(true);
    expect(ep.subpaths[0].anchors).toHaveLength(4);
    const seg = toGeometry(ep).segments.map((s) => s.type);
    expect(seg).toEqual(["M", "L", "L", "L", "Z"]);
  });

  it("preserves cubic curves", () => {
    const ep = round("M0 0 C0 10 10 10 10 0");
    const seg = toGeometry(ep).segments;
    expect(seg.map((s) => s.type)).toEqual(["M", "C"]);
    const b = geometryBounds(toGeometry(ep));
    expect(b.maxY).toBeCloseTo(7.5, 4);
  });

  it("folds a closing cubic onto the start anchor", () => {
    const ep = round("M0 0 C0 10 10 10 10 0 C10 -10 0 -10 0 0 Z");
    // Two on-curve anchors (start + far side), both smooth.
    expect(ep.subpaths[0].anchors).toHaveLength(2);
    expect(ep.subpaths[0].closed).toBe(true);
  });

  it("handles multiple subpaths with unique flat indices", () => {
    const ep = round("M0 0 L10 0 Z M20 20 L30 20 L30 30 Z");
    expect(ep.subpaths).toHaveLength(2);
    const flat = flatAnchors(ep);
    expect(flat).toHaveLength(5);
    // Flat indices are a contiguous 0..n-1 run across all subpaths.
    expect(flat.map((f) => f.index)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("anchor + handle editing", () => {
  it("moveAnchor drags its handles by the same delta", () => {
    const a = { x: 0, y: 0, handleIn: { x: -1, y: 0 }, handleOut: { x: 1, y: 0 }, mode: "smooth" as const };
    const moved = moveAnchor(a, 5, 5);
    expect(moved).toMatchObject({ x: 5, y: 5 });
    expect(moved.handleIn).toEqual({ x: 4, y: 5 });
    expect(moved.handleOut).toEqual({ x: 6, y: 5 });
  });

  it("dragHandle keeps a symmetric anchor's opposite handle mirrored", () => {
    const a = { x: 0, y: 0, handleIn: { x: -2, y: 0 }, handleOut: { x: 2, y: 0 }, mode: "symmetric" as const };
    const next = dragHandle(a, "out", 0, 4);
    expect(next.handleOut).toEqual({ x: 0, y: 4 });
    // Opposite mirrored with equal length (symmetric).
    expect(next.handleIn!.x).toBeCloseTo(0, 6);
    expect(next.handleIn!.y).toBeCloseTo(-4, 6);
  });

  it("dragHandle on a smooth anchor keeps direction but preserves opposite length", () => {
    const a = { x: 0, y: 0, handleIn: { x: -6, y: 0 }, handleOut: { x: 2, y: 0 }, mode: "smooth" as const };
    const next = dragHandle(a, "out", 0, 2); // out now points +y
    const inLen = Math.hypot(next.handleIn!.x, next.handleIn!.y);
    expect(inLen).toBeCloseTo(6, 5); // length preserved
    expect(next.handleIn!.y).toBeCloseTo(-6, 5); // opposite direction of out
  });

  it("setAnchorMode corner drops nothing but marks corner", () => {
    const a = { x: 0, y: 0, handleIn: { x: -2, y: 0 }, handleOut: { x: 2, y: 0 }, mode: "smooth" as const };
    expect(setAnchorMode(a, "corner").mode).toBe("corner");
  });
});

describe("segment conversion", () => {
  it("converts a straight segment to a curve and back", () => {
    const ep = round("M0 0 L10 0");
    makeSegmentCurved(ep.subpaths[0], 1);
    expect(toGeometry(ep).segments[1].type).toBe("C");
    makeSegmentStraight(ep.subpaths[0], 1);
    expect(toGeometry(ep).segments[1].type).toBe("L");
  });
});

describe("corner radius clamping", () => {
  it("clamps to half the shorter adjacent segment", () => {
    // Prev at distance 10, next at distance 4 → max radius = 2.
    const r = clampCornerRadius({ x: -10, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 4 }, 100);
    expect(r).toBe(2);
  });

  it("produces a rounded (cubic) corner within the requested setback", () => {
    const ep = round("M0 0 L100 0 L100 100 L0 100 Z");
    ep.subpaths[0].anchors[1].cornerRadius = 20;
    const g = toGeometry(ep);
    expect(g.segments.some((s) => s.type === "C")).toBe(true);
    // Rounding never pushes the shape beyond its original bounds.
    const b = geometryBounds(g);
    expect(b.minX).toBeGreaterThanOrEqual(-0.001);
    expect(b.maxX).toBeLessThanOrEqual(100.001);
  });

  it("rounds the START anchor of a closed subpath without skewing its edges", () => {
    const ep = round("M0 0 L100 0 L100 100 L0 100 Z");
    ep.subpaths[0].anchors[0].cornerRadius = 20;
    const g = toGeometry(ep);
    expect(g.segments.some((s) => s.type === "C")).toBe(true);
    const b = geometryBounds(g);
    expect(b.minX).toBeGreaterThanOrEqual(-0.001);
    expect(b.minY).toBeGreaterThanOrEqual(-0.001);
    expect(b.maxX).toBeLessThanOrEqual(100.001);
    expect(b.maxY).toBeLessThanOrEqual(100.001);
    // The three untouched corners must still be exact points on the outline.
    const pts = g.segments
      .filter((s) => s.type !== "Z")
      .map((s) => ({ x: (s as { x: number }).x, y: (s as { y: number }).y }));
    for (const c of [
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]) {
      expect(pts.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < 1e-6)).toBe(true);
    }
    // The rounded corner is entered/left on the two edges adjacent to (0,0):
    // one tangent point on the left edge and one on the top edge.
    expect(pts.some((p) => Math.abs(p.x) < 1e-6 && Math.abs(p.y - 20) < 1e-6)).toBe(true);
    expect(pts.some((p) => Math.abs(p.y) < 1e-6 && Math.abs(p.x - 20) < 1e-6)).toBe(true);
  });

  it("rounds every corner of a closed square at once", () => {
    const ep = round("M0 0 L100 0 L100 100 L0 100 Z");
    for (const a of ep.subpaths[0].anchors) a.cornerRadius = 20;
    const g = toGeometry(ep);
    expect(g.segments.filter((s) => s.type === "C")).toHaveLength(4);
    const b = geometryBounds(g);
    expect(b.minX).toBeGreaterThanOrEqual(-0.001);
    expect(b.minY).toBeGreaterThanOrEqual(-0.001);
    expect(b.maxX).toBeLessThanOrEqual(100.001);
    expect(b.maxY).toBeLessThanOrEqual(100.001);
    // No sharp corner point survives.
    for (const s of g.segments) {
      if (s.type === "Z") continue;
      const p = s as { x: number; y: number };
      for (const c of [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ]) {
        expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeGreaterThan(1e-6);
      }
    }
  });
});
