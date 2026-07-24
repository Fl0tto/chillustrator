/**
 * useHoverController — tracks the hovered node id for overlay/layers feedback.
 * OWNED BY: Agent D (interactions). Seeded baseline. Hover is editor state, not
 * undoable, and updates are throttled to pointer move on the host only.
 */
import { useEffect, type RefObject } from "react";
import { useEditorStore } from "@/store/editorStore";
import { isEffectivelyLocked } from "@/model/tree";

export function useHoverController(hostRef: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const store = useEditorStore;

    const onMove = (e: PointerEvent) => {
      if (store.getState().interaction.isGesture) return;
      const target = e.target as Element | null;
      const el = target?.closest?.("[data-node-id]");
      const id = el?.getAttribute("data-node-id") ?? null;
      if (id) {
        const doc = store.getState().document;
        store.getState().setHovered(isEffectivelyLocked(doc, id) ? null : id);
      } else {
        store.getState().setHovered(null);
      }
    };
    const onLeave = () => store.getState().setHovered(null);

    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, [hostRef]);
}
