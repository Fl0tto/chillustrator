import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/editor.css";
import { App } from "./app/App";
import { useEditorStore } from "./store/editorStore";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

// Test hook: expose the store to e2e (Playwright) for deterministic assertions.
if (import.meta.env.DEV) {
  (window as unknown as { __editorStore?: typeof useEditorStore }).__editorStore = useEditorStore;
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
