/**
 * Command contract.
 *
 * A Command describes ONE user-visible, atomic, reversible edit to the document
 * (spec §8). Its `apply` mutates an Immer draft in place; the store captures
 * Immer patches so any command — even a multi-step transaction — collapses to a
 * single undo entry.
 *
 * Commands are framework-independent and must not touch React/DOM/store state
 * other than the document draft they receive.
 */
import type { SvgDocumentModel } from "@/model/types";

export interface Command {
  /** Human-readable label shown in history/undo tooltips. */
  label: string;
  /** Mutate the document draft in place. */
  apply(draft: SvgDocumentModel): void;
}

/** Compose several commands into one labeled transaction (HST-003). */
export function transaction(label: string, commands: Command[]): Command {
  return {
    label,
    apply(draft) {
      for (const c of commands) c.apply(draft);
    },
  };
}
