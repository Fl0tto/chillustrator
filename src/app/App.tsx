import { useEffect } from "react";
import { EditorShell } from "./EditorShell";
import { usePreferences } from "@/store/selectors";

export function App() {
  const prefs = usePreferences();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", prefs.theme);
  }, [prefs.theme]);

  return <EditorShell />;
}
