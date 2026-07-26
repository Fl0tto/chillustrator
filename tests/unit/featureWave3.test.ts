/**
 * Feature wave 3 tests: reference images (export exclusion), non-destructive
 * warp (arc/wave geometry + serialized `d`), gradient defs, and drop-shadow
 * filters.
 */
import { describe, it, expect } from "vitest";
import { createEmptyDocument } from "@/model/document";
import { createRect, createImage, createText } from "@/model/factory";
import { serializeSvg } from "@/importExport/serializeSvg";
import { applyWarp } from "@/geometry/warp";
import { warpedPathD } from "@/geometry/warpResolve";
import { buildFilterMarkup, filterId } from "@/geometry/filters";
import { rectToGeometry } from "@/geometry/pathConvert";
import { geometryBounds } from "@/geometry/pathData";
import type { ShadowEffect, WarpSpec } from "@/model/types";

describe("reference images — export exclusion", () => {
  it("omits reference images from serialized output but keeps normal artwork", () => {
    const doc = createEmptyDocument(200, 200);
    const rect = createRect({ x: 10, y: 10, width: 40, height: 40, style: { fill: { kind: "solid", value: "#ff0000", opacity: 1 } } });
    const ref = createImage({ x: 0, y: 0, width: 100, height: 100, href: "data:image/png;base64,AAAA", reference: true });
    const normal = createImage({ x: 0, y: 0, width: 50, height: 50, href: "data:image/png;base64,BBBB" });
    for (const n of [rect, ref, normal]) {
      doc.nodes[n.id] = n;
      doc.rootNodeIds.push(n.id);
    }
    const out = serializeSvg(doc);
    expect(out).toContain("#ff0000"); // normal shape kept
    expect(out).toContain("BBBB"); // non-reference image kept
    expect(out).not.toContain("AAAA"); // reference image omitted
    expect(out.match(/<image/g)?.length).toBe(1);
  });
});

describe("warp geometry", () => {
  const rect = createRect({ x: 0, y: 0, width: 100, height: 40 });
  const geo = rectToGeometry(rect);
  const bounds = geometryBounds(geo);

  it("arc with amount 0 is a no-op displacement", () => {
    const spec: WarpSpec = { type: "arc", direction: "top", radius: 200, amount: 0 };
    const warped = applyWarp(geo, spec, bounds);
    // Every warped vertex equals its source vertex (within epsilon).
    for (const seg of warped.segments) {
      if (seg.type === "M" || seg.type === "L") {
        expect(seg.x).toBeGreaterThanOrEqual(-1e-6);
        expect(Number.isFinite(seg.x) && Number.isFinite(seg.y)).toBe(true);
      }
    }
    // The midpoint of the top edge stays near its original location.
    const first = warped.segments[0];
    if (first.type === "M") expect(first.y).toBeCloseTo(0, 3);
  });

  it("arc bends geometry (amount 1 displaces points vs the unwarped flat box)", () => {
    const flat = applyWarp(geo, { type: "arc", direction: "top", radius: 120, amount: 0 }, bounds);
    const bent = applyWarp(geo, { type: "arc", direction: "top", radius: 120, amount: 1 }, bounds);
    const pts = (g: typeof flat) =>
      g.segments.filter((s) => s.type === "M" || s.type === "L") as Array<{ x: number; y: number }>;
    const a = pts(flat);
    const b = pts(bent);
    expect(a.length).toBe(b.length);
    const maxShift = Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));
    expect(maxShift).toBeGreaterThan(5); // corners visibly move onto the arc
  });

  it("wave displaces points and preserves closed subpaths", () => {
    const spec: WarpSpec = { type: "wave", axis: "horizontal", amplitude: 20, frequency: 2, phase: 0, direction: 1 };
    const warped = applyWarp(geo, spec, bounds);
    expect(warped.segments.some((s) => s.type === "Z")).toBe(true);
    const ys = warped.segments.filter((s) => s.type !== "Z").map((s) => (s as { y: number }).y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(40);
  });

  it("warpedPathD serializes a shape with a warp as path data", () => {
    const warpedRect = { ...rect, warp: { type: "wave", axis: "horizontal", amplitude: 10, frequency: 3, phase: 0, direction: 1 } as WarpSpec };
    const d = warpedPathD(warpedRect);
    expect(d).toBeTruthy();
    expect(d).toMatch(/^M/);
  });
});

describe("warp serialization", () => {
  it("serializes a warped shape as <path> and a warped text as <textPath>", () => {
    const doc = createEmptyDocument(400, 400);
    const rect = createRect({ x: 0, y: 0, width: 100, height: 40 });
    rect.warp = { type: "wave", axis: "horizontal", amplitude: 10, frequency: 2, phase: 0, direction: 1 };
    const text = createText({ x: 100, y: 100, text: "ROUND" });
    text.warp = { type: "arc", direction: "top", radius: 150, amount: 1 };
    for (const n of [rect, text]) {
      doc.nodes[n.id] = n;
      doc.rootNodeIds.push(n.id);
    }
    const out = serializeSvg(doc);
    // Warped rect emitted as a path, not a <rect>.
    expect(out).toMatch(/<path[^>]*\bd="M/);
    expect(out).not.toMatch(/<rect[^>]*width="100"/);
    // Warped text rides a textPath referencing a generated arc def.
    expect(out).toContain("<textPath");
    expect(out).toMatch(/<path id="warp-/);
  });
});

describe("drop-shadow filters", () => {
  const outer: ShadowEffect = { id: "e1", kind: "outer", dx: 4, dy: 4, blur: 3, spread: 0, color: "#000000", opacity: 0.4, enabled: true };
  const inner: ShadowEffect = { id: "e2", kind: "inner", dx: 2, dy: 2, blur: 2, spread: 1, color: "#ffffff", opacity: 0.5, enabled: true };

  it("builds an outer-shadow filter chain", () => {
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    rect.effects = [outer];
    const markup = buildFilterMarkup(rect);
    expect(markup).toContain(`id="${filterId(rect.id)}"`);
    expect(markup).toContain("feGaussianBlur");
    expect(markup).toContain("feOffset");
    expect(markup).toContain("feMerge");
  });

  it("inner shadow uses an out-composite band and erode spread", () => {
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    rect.effects = [inner];
    const markup = buildFilterMarkup(rect)!;
    expect(markup).toContain('operator="out"');
    expect(markup).toContain('operator="erode"');
  });

  it("disabled effects produce no filter", () => {
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    rect.effects = [{ ...outer, enabled: false }];
    expect(buildFilterMarkup(rect)).toBeNull();
  });

  it("serializes filter defs and references them from the node", () => {
    const doc = createEmptyDocument(100, 100);
    const rect = createRect({ x: 0, y: 0, width: 40, height: 40, style: { fill: { kind: "solid", value: "#00ff00", opacity: 1 } } });
    rect.effects = [outer];
    doc.nodes[rect.id] = rect;
    doc.rootNodeIds.push(rect.id);
    const out = serializeSvg(doc);
    expect(out).toContain("<filter");
    expect(out).toContain(`filter="url(#${filterId(rect.id)})"`);
  });
});

describe("gradient defs", () => {
  it("emits a referenced linear gradient def", () => {
    const doc = createEmptyDocument(100, 100);
    doc.paints["p_g"] = {
      id: "p_g",
      kind: "linearGradient",
      name: "g",
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      units: "objectBoundingBox",
      spreadMethod: "pad",
      stops: [
        { offset: 0, color: "#ff0000", opacity: 1 },
        { offset: 1, color: "#0000ff", opacity: 1 },
      ],
    };
    const rect = createRect({ x: 0, y: 0, width: 40, height: 40, style: { fill: { kind: "definition", value: "p_g", opacity: 1 } } });
    doc.nodes[rect.id] = rect;
    doc.rootNodeIds.push(rect.id);
    const out = serializeSvg(doc);
    expect(out).toContain("<linearGradient");
    expect(out).toContain('fill="url(#p_g)"');
    expect(out).toContain("#0000ff");
  });
});
