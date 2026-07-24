import { useEffect, useRef } from "react";
import { EditorShell } from "./EditorShell";
import { usePreferences } from "@/store/selectors";
import { useEditorStore } from "@/store/editorStore";
import {
  createDebouncedAutosave,
  loadSavedDocument,
} from "@/importExport/persistence";

export function App() {
  const prefs = usePreferences();
  const restored = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", prefs.theme);
  }, [prefs.theme]);

  // Restore the most recent autosaved document once, on first mount (SAV-001).
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const saved = loadSavedDocument();
    if (saved) useEditorStore.getState().loadDocument(saved);
  }, []);

  // Debounced autosave: persist the document whenever it changes.
  useEffect(() => {
    const autosave = createDebouncedAutosave();
    let last = useEditorStore.getState().document;
    const unsub = useEditorStore.subscribe((state) => {
      if (state.document !== last) {
        last = state.document;
        autosave(last);
      }
    });
    return unsub;
  }, []);

  return <EditorShell />;
}
