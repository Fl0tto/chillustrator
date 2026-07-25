/**
 * Local autosave / restore of the document model (SAV-001).
 *
 * Persists the persistent document (not editor/transient state) to localStorage,
 * debounced, and restores the most recent document on load. History is
 * intentionally NOT persisted — a reload starts a fresh undo stack.
 */
import type { SvgDocumentModel } from "@/model/types";
import { SCHEMA_VERSION } from "@/model/types";

const STORAGE_KEY = "chillustrator:document:v1";
const PREFS_KEY = "chillustrator:preferences:v1";

interface StoredEnvelope {
  schemaVersion: number;
  savedAt: string;
  document: SvgDocumentModel;
}

function hasStorage(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

/** Persist the document immediately (synchronous). Returns false on failure. */
export function saveDocument(doc: SvgDocumentModel): boolean {
  if (!hasStorage()) return false;
  try {
    const envelope: StoredEnvelope = {
      schemaVersion: SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      document: doc,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false; // quota exceeded / serialization error
  }
}

/** Restore the most recently autosaved document, or null when absent/invalid. */
export function loadSavedDocument(): SvgDocumentModel | null {
  if (!hasStorage()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const envelope = JSON.parse(raw) as StoredEnvelope;
    if (!envelope || typeof envelope !== "object" || !envelope.document) return null;
    if (envelope.schemaVersion !== SCHEMA_VERSION) return null; // migration boundary
    const doc = envelope.document;
    // Minimal structural sanity check before trusting stored data.
    if (!doc.nodes || !Array.isArray(doc.rootNodeIds) || typeof doc.width !== "number") return null;
    return doc;
  } catch {
    return null;
  }
}

/** Remove the autosaved document (used by explicit reset). */
export function clearSavedDocument(): void {
  if (!hasStorage()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Persist a small, JSON-safe subset of editor preferences (e.g. the Smart Guides
 * toggle, checkerboard). Kept separate from the document envelope so it survives
 * document reloads. Partial by design — unknown keys are ignored on load.
 */
export function savePreferences(prefs: Record<string, unknown>): void {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota / serialization failures
  }
}

/** Load persisted preferences, or an empty object when absent/invalid. */
export function loadPreferences(): Record<string, unknown> {
  if (!hasStorage()) return {};
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Create a debounced autosave function. Call the returned function whenever the
 * document changes; it writes at most once per `delayMs` of quiet time.
 */
export function createDebouncedAutosave(delayMs = 800): (doc: SvgDocumentModel) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: SvgDocumentModel | null = null;
  return (doc: SvgDocumentModel) => {
    pending = doc;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (pending) saveDocument(pending);
      pending = null;
      timer = null;
    }, delayMs);
  };
}
