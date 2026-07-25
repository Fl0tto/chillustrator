/**
 * Undo/redo history using Immer patches.
 *
 * Each entry stores the forward patches and their inverse, so one command —
 * however many low-level mutations it performed — is one reversible entry
 * (spec §8: HST-001..HST-005).
 */
import type { Patch } from "immer";
import type { SvgDocumentModel } from "@/model/types";

export interface HistoryEntry {
  label: string;
  patches: Patch[];
  inversePatches: Patch[];
  /**
   * When set, consecutive `applyCoalesced` calls sharing the same key collapse
   * into this single entry (e.g. a slider drag = one undo step, spec HST-002).
   */
  coalesceKey?: string;
  /**
   * The document state captured before the coalesce run began. Re-applying the
   * (absolute-valued) command to this base recomputes the merged patches so the
   * single entry always spans start→latest of the run.
   */
  coalesceBase?: SvgDocumentModel;
}

export interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export const HISTORY_LIMIT = 100;

export function emptyHistory(): HistoryState {
  return { past: [], future: [] };
}

/** Record a new entry, capping the past and clearing redo. */
export function recordEntry(history: HistoryState, entry: HistoryEntry): HistoryState {
  const past = [...history.past, entry];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, future: [] };
}

export function canUndo(history: HistoryState): boolean {
  return history.past.length > 0;
}

export function canRedo(history: HistoryState): boolean {
  return history.future.length > 0;
}
