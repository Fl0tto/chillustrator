/**
 * Document construction and top-level helpers. Framework-independent.
 */
import { createDocumentId } from "./ids";
import { SCHEMA_VERSION, type SvgDocumentModel } from "./types";

export const DEFAULT_DOC_WIDTH = 1200;
export const DEFAULT_DOC_HEIGHT = 800;

export function createEmptyDocument(
  width = DEFAULT_DOC_WIDTH,
  height = DEFAULT_DOC_HEIGHT,
  name = "Untitled",
): SvgDocumentModel {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    documentId: createDocumentId(),
    name,
    width,
    height,
    viewBox: [0, 0, width, height],
    rootNodeIds: [],
    nodes: {},
    paints: {},
    metadata: {
      createdAt: now,
      updatedAt: now,
      generator: "chillustrator",
    },
  };
}

/** Total node count (for limits/diagnostics). */
export function nodeCount(doc: SvgDocumentModel): number {
  return Object.keys(doc.nodes).length;
}

/** Touch the updatedAt timestamp (call inside commands). */
export function touchDocument(doc: SvgDocumentModel): void {
  doc.metadata.updatedAt = new Date().toISOString();
}
