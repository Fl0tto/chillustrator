/**
 * Undo/redo history using Immer patches.
 *
 * Each entry stores the forward patches and their inverse, so one command —
 * however many low-level mutations it performed — is one reversible entry
 * (spec §8: HST-001..HST-005).
 */
import type { Patch } from "immer";

export interface HistoryEntry {
  label: string;
  patches: Patch[];
  inversePatches: Patch[];
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
