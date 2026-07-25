/**
 * EditorShell — top-level editor layout.
 *
 * Wave-1 baseline (orchestrator-owned). The toolbar, rail, inspector and layers
 * here are intentionally minimal but fully functional so the whole Phase-0 edit
 * loop works and is testable. Wave-2 (Agent E) replaces the panel internals with
 * richer components under src/components/**, and Agent F wires import/export.
 */
import { useRef, useState } from "react";
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
  Upload,
  Download,
  Code2,
  Combine,
  PenTool,
  Spline,
  Magnet,
  Grid2x2,
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
import { importSvg, buildDocumentFromImport } from "@/importExport/importSvg";
import { serializeSvg } from "@/importExport/serializeSvg";
import { downloadText, svgFilename } from "@/importExport/download";
import { runBoolean, booleanEligibility } from "@/interactions/booleanOps";
import { commitShapeBuilder } from "@/interactions/useShapeBuilder";
import { convertToPathCommand } from "@/commands/geometryCommands";
import { isConvertibleToPath } from "@/geometry/pathConvert";
import type { BooleanOperation } from "@/geometry/booleanTypes";
import { InspectorPanel } from "./panels/InspectorPanel";
import { LayersPanel } from "./panels/LayersPanel";
import { SourcePanel } from "./panels/SourcePanel";

const TOOLS: { id: ToolId; icon: React.ReactNode; title: string; key: string }[] = [
  { id: "select", icon: <MousePointer2 size={18} />, title: "Select", key: "V" },
  { id: "node", icon: <Spline size={18} />, title: "Edit path (direct-selection)", key: "A" },
  { id: "pen", icon: <PenTool size={18} />, title: "Pen", key: "P" },
  { id: "rect", icon: <Square size={18} />, title: "Rectangle", key: "R" },
  { id: "ellipse", icon: <Circle size={18} />, title: "Ellipse", key: "E" },
  { id: "line", icon: <Minus size={18} />, title: "Line", key: "L" },
  { id: "polygon", icon: <Hexagon size={18} />, title: "Polygon", key: "G" },
  { id: "text", icon: <Type size={18} />, title: "Text", key: "T" },
  { id: "build", icon: <Combine size={18} />, title: "Shape Builder", key: "B" },
];

const BOOLEAN_BUTTONS: { op: BooleanOperation; label: string; title: string }[] = [
  { op: "union", label: "U", title: "Union — merge shapes" },
  { op: "subtract", label: "S", title: "Subtract — front shape cuts the back" },
  { op: "intersect", label: "I", title: "Intersect — keep the overlap" },
  { op: "exclude", label: "X", title: "Exclude — remove the overlap" },
];

const ALIGN_BUTTONS: { edge: AlignEdge; label: string; title: string }[] = [
  { edge: "left", label: "L", title: "Align left" },
  { edge: "hcenter", label: "C", title: "Align center" },
  { edge: "right", label: "R", title: "Align right" },
  { edge: "top", label: "T", title: "Align top" },
  { edge: "vcenter", label: "M", title: "Align middle" },
  { edge: "bottom", label: "B", title: "Align bottom" },
];

function Toolbar({ onToggleSource, sourceOpen }: { onToggleSource: () => void; sourceOpen: boolean }) {
  const { canUndo, canRedo } = useHistoryFlags();
  const selection = useSelection();
  const prefs = usePreferences();
  const apply = useEditorStore((s) => s.apply);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const setSelection = useEditorStore((s) => s.setSelection);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const setPreferences = useEditorStore((s) => s.setPreferences);
  const fileInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState(false);

  const flash = (msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3000);
  };

  const onBoolean = (op: BooleanOperation) => {
    if (busy) return;
    setBusy(true);
    runBoolean(op)
      .then((r) => {
        if (!r.ok && r.warning) flash(r.warning);
      })
      .finally(() => setBusy(false));
  };

  const onConvertToPath = () => {
    const ids = useEditorStore.getState().selection;
    const doc = useEditorStore.getState().document;
    const targets = ids.filter((id) => {
      const n = doc.nodes[id];
      return n && n.type !== "path" && isConvertibleToPath(n);
    });
    if (targets.length === 0) return;
    const newIds: string[] = [];
    for (const id of targets) apply(convertToPathCommand(id, (nid) => newIds.push(nid)));
    if (newIds.length) setSelection(newIds);
  };

  const onImportFile = async (file: File) => {
    const text = await file.text();
    const result = importSvg(text);
    if (!result.ok) {
      window.alert(`Import failed: ${result.reason}`);
      return;
    }
    const doc = buildDocumentFromImport(result, file.name.replace(/\.svg$/i, ""));
    // One undoable transaction (HST-005).
    useEditorStore.getState().loadDocument(doc, { record: true, label: "Import SVG" });
    if (result.warnings.length > 0) {
      console.warn("[import] warnings:", result.warnings);
    }
  };

  const onExport = () => {
    const doc = useEditorStore.getState().document;
    const svg = serializeSvg(doc, { precision: prefs.exportPrecision, pretty: true });
    downloadText(svg, svgFilename(doc.name));
  };

  const hasSel = selection.length > 0;
  const canGroup = selection.length >= 2;
  const canUngroup = selection.some((id) => useEditorStore.getState().document.nodes[id]?.type === "group");
  const canBool =
    selection.length >= 2 && booleanEligibility(useEditorStore.getState().document, selection).ok;
  const canConvert = selection.some((id) => {
    const n = useEditorStore.getState().document.nodes[id];
    return n ? n.type !== "path" && isConvertibleToPath(n) : false;
  });

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

      <div className="group">
        {BOOLEAN_BUTTONS.map((b) => (
          <button
            key={b.op}
            className="btn"
            title={b.title}
            disabled={!canBool || busy}
            onClick={() => onBoolean(b.op)}
          >
            {b.label}
          </button>
        ))}
        <button className="btn" title="Convert to path" disabled={!canConvert} onClick={onConvertToPath}>
          Path
        </button>
      </div>

      {notice && <span className="chill-notice">{notice}</span>}

      <div className="spacer" style={{ flex: 1 }} />

      <div className="group">
        <input
          ref={fileInput}
          type="file"
          accept=".svg,image/svg+xml"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onImportFile(file);
            e.target.value = ""; // allow re-importing the same file
          }}
        />
        <button className="btn" title="Import SVG" onClick={() => fileInput.current?.click()}>
          <Upload size={16} />
        </button>
        <button className="btn" title="Export SVG" onClick={onExport}>
          <Download size={16} />
        </button>
        <button
          className={`btn ${sourceOpen ? "active" : ""}`}
          title="View SVG source"
          onClick={onToggleSource}
        >
          <Code2 size={16} />
        </button>
      </div>

      <div className="group">
        <button
          className={`btn ${prefs.snapEnabled ? "active" : ""}`}
          title={`Smart Guides: ${prefs.snapEnabled ? "on" : "off"} (Alt bypasses during a drag)`}
          data-testid="toggle-smart-guides"
          aria-pressed={prefs.snapEnabled}
          onClick={() => setPreferences({ snapEnabled: !prefs.snapEnabled })}
        >
          <Magnet size={16} />
        </button>
        <button
          className={`btn ${prefs.showCheckerboard ? "active" : ""}`}
          title={`Transparency checkerboard: ${prefs.showCheckerboard ? "on" : "off"}`}
          data-testid="toggle-checkerboard"
          aria-pressed={prefs.showCheckerboard}
          onClick={() => setPreferences({ showCheckerboard: !prefs.showCheckerboard })}
        >
          <Grid2x2 size={16} />
        </button>
      </div>

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

function BuildBar() {
  const tool = useTool();
  const shapeBuilder = useEditorStore((s) => s.shapeBuilder);
  const setTool = useEditorStore((s) => s.setTool);
  if (tool !== "build") return null;

  const faceCount = shapeBuilder?.faces.length ?? 0;
  const keptCount = shapeBuilder?.kept.length ?? 0;
  const empty = faceCount === 0;

  return (
    <div className="chill-buildbar">
      <Combine size={15} />
      {empty ? (
        <span>Select 2+ overlapping shapes, then pick the Shape Builder tool.</span>
      ) : (
        <span>
          Click regions to keep ({keptCount} selected), then Build. Press Enter to build, Esc to cancel.
        </span>
      )}
      <span className="spacer" style={{ flex: 1 }} />
      <button className="btn" onClick={() => setTool("select")}>
        Cancel
      </button>
      <button
        className="btn primary"
        disabled={keptCount === 0}
        onClick={() => commitShapeBuilder()}
      >
        Build path
      </button>
    </div>
  );
}

export function EditorShell() {
  const [showSource, setShowSource] = useState(false);
  return (
    <div className="chill-shell">
      <Toolbar onToggleSource={() => setShowSource((v) => !v)} sourceOpen={showSource} />
      <ToolRail />
      <div className="chill-canvas">
        <CanvasStage />
        <BuildBar />
      </div>
      <div className="chill-panels">
        <InspectorPanel />
        <LayersPanel />
        {showSource && <SourcePanel onClose={() => setShowSource(false)} />}
      </div>
      <StatusBar />
    </div>
  );
}
