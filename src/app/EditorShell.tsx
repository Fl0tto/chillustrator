/**
 * EditorShell — top-level editor layout.
 *
 * Wave-1 baseline (orchestrator-owned). The toolbar, rail, inspector and layers
 * here are intentionally minimal but fully functional so the whole Phase-0 edit
 * loop works and is testable. Wave-2 (Agent E) replaces the panel internals with
 * richer components under src/components/**, and Agent F wires import/export.
 */
import {
  MousePointer2,
  Square,
  Circle,
  Minus,
  Hexagon,
  Type,
  Undo2,
  Redo2,
  Trash2,
  Group,
  Ungroup,
  Sun,
  Moon,
} from "lucide-react";
import { CanvasStage } from "@/renderer/CanvasStage";
import { useEditorStore, type ToolId } from "@/store/editorStore";
import {
  useTool,
  useSelection,
  useHistoryFlags,
  useViewport,
  usePreferences,
} from "@/store/selectors";
import { deleteNodesCommand } from "@/commands/nodeCommands";
import { groupNodesCommand, ungroupCommand, alignCommand, type AlignEdge } from "@/commands/layerCommands";
import { InspectorPanel } from "./panels/InspectorPanel";
import { LayersPanel } from "./panels/LayersPanel";

const TOOLS: { id: ToolId; icon: React.ReactNode; title: string; key: string }[] = [
  { id: "select", icon: <MousePointer2 size={18} />, title: "Select", key: "V" },
  { id: "rect", icon: <Square size={18} />, title: "Rectangle", key: "R" },
  { id: "ellipse", icon: <Circle size={18} />, title: "Ellipse", key: "E" },
  { id: "line", icon: <Minus size={18} />, title: "Line", key: "L" },
  { id: "polygon", icon: <Hexagon size={18} />, title: "Polygon", key: "P" },
  { id: "text", icon: <Type size={18} />, title: "Text", key: "T" },
];

const ALIGN_BUTTONS: { edge: AlignEdge; label: string; title: string }[] = [
  { edge: "left", label: "L", title: "Align left" },
  { edge: "hcenter", label: "C", title: "Align center" },
  { edge: "right", label: "R", title: "Align right" },
  { edge: "top", label: "T", title: "Align top" },
  { edge: "vcenter", label: "M", title: "Align middle" },
  { edge: "bottom", label: "B", title: "Align bottom" },
];

function Toolbar() {
  const { canUndo, canRedo } = useHistoryFlags();
  const selection = useSelection();
  const prefs = usePreferences();
  const apply = useEditorStore((s) => s.apply);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const setSelection = useEditorStore((s) => s.setSelection);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const setPreferences = useEditorStore((s) => s.setPreferences);

  const hasSel = selection.length > 0;
  const canGroup = selection.length >= 2;
  const canUngroup = selection.some((id) => useEditorStore.getState().document.nodes[id]?.type === "group");

  return (
    <div className="chill-toolbar">
      <span className="brand">chillustrator</span>

      <div className="group">
        <button className="btn" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
          <Undo2 size={16} />
        </button>
        <button className="btn" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
          <Redo2 size={16} />
        </button>
      </div>

      <div className="group">
        <button
          className="btn"
          title="Delete (Del)"
          disabled={!hasSel}
          onClick={() => {
            apply(deleteNodesCommand(selection));
            clearSelection();
          }}
        >
          <Trash2 size={16} />
        </button>
        <button
          className="btn"
          title="Group (Ctrl+G)"
          disabled={!canGroup}
          onClick={() => {
            let gid = "";
            apply(groupNodesCommand(selection, (id) => (gid = id)));
            if (gid) setSelection([gid]);
          }}
        >
          <Group size={16} />
        </button>
        <button
          className="btn"
          title="Ungroup (Ctrl+Shift+G)"
          disabled={!canUngroup}
          onClick={() => {
            const groups = selection.filter(
              (id) => useEditorStore.getState().document.nodes[id]?.type === "group",
            );
            const freed: string[] = [];
            for (const gid of groups) apply(ungroupCommand(gid, (ids) => freed.push(...ids)));
            if (freed.length) setSelection(freed);
          }}
        >
          <Ungroup size={16} />
        </button>
      </div>

      <div className="group">
        {ALIGN_BUTTONS.map((a) => (
          <button
            key={a.edge}
            className="btn"
            title={a.title}
            disabled={selection.length < 2}
            onClick={() => apply(alignCommand(selection, a.edge))}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="spacer" />

      <button
        className="btn"
        title="Toggle theme"
        onClick={() => setPreferences({ theme: prefs.theme === "dark" ? "light" : "dark" })}
      >
        {prefs.theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </div>
  );
}

function ToolRail() {
  const tool = useTool();
  const setTool = useEditorStore((s) => s.setTool);
  return (
    <div className="chill-rail">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          className={`btn tool ${tool === t.id ? "active" : ""}`}
          title={`${t.title} (${t.key})`}
          onClick={() => setTool(t.id)}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}

function StatusBar() {
  const tool = useTool();
  const selection = useSelection();
  const viewport = useViewport();
  const setViewport = useEditorStore((s) => s.setViewport);
  return (
    <div className="chill-status">
      <span>Tool: {tool}</span>
      <span>{selection.length} selected</span>
      <span className="spacer" style={{ flex: 1 }} />
      <button className="btn" style={{ height: 20 }} onClick={() => setViewport({ zoom: 1 })}>
        {Math.round(viewport.zoom * 100)}%
      </button>
    </div>
  );
}

export function EditorShell() {
  return (
    <div className="chill-shell">
      <Toolbar />
      <ToolRail />
      <div className="chill-canvas">
        <CanvasStage />
      </div>
      <div className="chill-panels">
        <InspectorPanel />
        <LayersPanel />
      </div>
      <StatusBar />
    </div>
  );
}
