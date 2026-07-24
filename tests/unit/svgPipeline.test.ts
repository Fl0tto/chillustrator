/**
 * SVG import/export pipeline tests (IMP-001, EXP-001, SAV-001, SEC-001).
 * Covers sanitation, model round-trip, and autosave persistence.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { importSvg, buildDocumentFromImport } from "@/importExport/importSvg";
import { serializeSvg } from "@/importExport/serializeSvg";
import {
  saveDocument,
  loadSavedDocument,
  clearSavedDocument,
} from "@/importExport/persistence";
import { createEmptyDocument } from "@/model/document";
import { createRect } from "@/model/factory";
import type { RectNode } from "@/model/types";

describe("importSvg — safety (SEC-001)", () => {
  it("strips <script>, event handlers, and javascript: links but keeps artwork", () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
        <script>alert('x')</script>
        <rect x="10" y="10" width="30" height="30" fill="#ff0000" onclick="steal()" />
        <a href="javascript:evil()"><circle cx="50" cy="50" r="5" /></a>
      </svg>`;
    const result = importSvg(svg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const doc = buildDocumentFromImport(result);
    const out = serializeSvg(doc);
    expect(out).not.toMatch(/script/i);
    expect(out).not.toMatch(/onclick/i);
    expect(out).not.toMatch(/javascript:/i);
    // The safe rectangle survives.
    const rect = Object.values(doc.nodes).find((n) => n.type === "rect") as RectNode | undefined;
    expect(rect).toBeDefined();
    expect(rect?.width).toBe(30);
  });

  it("rejects malformed XML", () => {
    const result = importSvg("<svg><rect></svg>not xml<<<");
    expect(result.ok).toBe(false);
  });
});

describe("serializeSvg — export (EXP-001)", () => {
  it("emits a clean root with viewBox and no editor data-* attributes", () => {
    const doc = createEmptyDocument(200, 120);
    const rect = createRect({ x: 5, y: 5, width: 40, height: 20 });
    doc.nodes[rect.id] = rect;
    doc.rootNodeIds.push(rect.id);

    const out = serializeSvg(doc, { precision: 2 });
    expect(out).toMatch(/<svg[^>]*viewBox="0 0 200 120"/);
    expect(out).toMatch(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(out).not.toMatch(/data-node-id/);
    expect(out).toMatch(/<rect/);
  });

  it("omits hidden nodes by default and includes them on request", () => {
    const doc = createEmptyDocument();
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    rect.visible = false;
    doc.nodes[rect.id] = rect;
    doc.rootNodeIds.push(rect.id);

    expect(serializeSvg(doc)).not.toMatch(/<rect/);
    expect(serializeSvg(doc, { includeHidden: true })).toMatch(/display="none"/);
  });
});

describe("round trip (AT-007)", () => {
  it("re-imports exported geometry with equivalent values", () => {
    const doc = createEmptyDocument(300, 300);
    const rect = createRect({ x: 12, y: 34, width: 56, height: 78 });
    rect.style.fill = { kind: "solid", value: "#3366ff", opacity: 1 };
    doc.nodes[rect.id] = rect;
    doc.rootNodeIds.push(rect.id);

    const exported = serializeSvg(doc, { precision: 3 });
    const re = importSvg(exported);
    expect(re.ok).toBe(true);
    if (!re.ok) return;
    const roundTripped = re.nodes.find((n) => n.type === "rect") as RectNode | undefined;
    expect(roundTripped).toBeDefined();
    expect(roundTripped?.x).toBe(12);
    expect(roundTripped?.height).toBe(78);
    expect(roundTripped?.style.fill?.value.toLowerCase()).toBe("#3366ff");
  });
});

describe("persistence (SAV-001)", () => {
  beforeEach(() => clearSavedDocument());

  it("saves and restores a document", () => {
    const doc = createEmptyDocument(640, 480, "MyLogo");
    expect(saveDocument(doc)).toBe(true);
    const restored = loadSavedDocument();
    expect(restored).not.toBeNull();
    expect(restored?.width).toBe(640);
    expect(restored?.name).toBe("MyLogo");
  });

  it("returns null after clear", () => {
    saveDocument(createEmptyDocument());
    clearSavedDocument();
    expect(loadSavedDocument()).toBeNull();
  });
});
