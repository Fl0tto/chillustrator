/**
 * LayersPanel — wave-1 baseline hierarchy view.
 * Superseded by Agent E's richer layers panel (src/components/layers) in wave 2.
 */
import { Fragment } from "react";
import {
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Square,
  Circle,
  Minus,
  Hexagon,
  Type,
  Folder,
  Spline,
  Image as ImageIcon,
  ChevronRight,
} from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { useSelection } from "@/store/selectors";
import { useShallow } from "zustand/react/shallow";
import { setLockCommand, setVisibilityCommand } from "@/commands/nodeCommands";
import type { SvgNode } from "@/model/types";

function typeIcon(node: SvgNode) {
  switch (node.type) {
    case "rect":
      return <Square size={14} />;
    case "ellipse":
      return <Circle size={14} />;
    case "line":
      return <Minus size={14} />;
    case "polygon":
      return <Hexagon size={14} />;
    case "text":
      return <Type size={14} />;
    case "path":
      return <Spline size={14} />;
    case "image":
      return <ImageIcon size={14} />;
    case "group":
      return <Folder size={14} />;
    default:
      return <ChevronRight size={14} />;
  }
}

function LayerRow({ id, depth }: { id: string; depth: number }) {
  const node = useEditorStore((s) => s.document.nodes[id]);
  const selection = useSelection();
  const apply = useEditorStore((s) => s.apply);
  const setSelection = useEditorStore((s) => s.setSelection);
  const toggleSelection = useEditorStore((s) => s.toggleSelection);
  if (!node) return null;
  const selected = selection.includes(id);

  return (
    <Fragment>
      <div
        className={`layer-row ${selected ? "selected" : ""}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={(e) => (e.shiftKey ? toggleSelection(id) : setSelection([id]))}
      >
        {typeIcon(node)}
        <span className="name">{node.name}</span>
        <button
          className="icon-btn"
          title={node.visible ? "Hide" : "Show"}
          onClick={(e) => {
            e.stopPropagation();
            apply(setVisibilityCommand([id], !node.visible));
          }}
        >
          {node.visible ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button
          className="icon-btn"
          title={node.locked ? "Unlock" : "Lock"}
          onClick={(e) => {
            e.stopPropagation();
            apply(setLockCommand([id], !node.locked));
          }}
        >
          {node.locked ? <Lock size={14} /> : <LockOpen size={14} />}
        </button>
      </div>
      {node.type === "group" &&
        [...node.childIds].reverse().map((cid) => <LayerRow key={cid} id={cid} depth={depth + 1} />)}
    </Fragment>
  );
}

export function LayersPanel() {
  // Render top-most first (reverse paint order) so stacking reads intuitively.
  const rootIds = useEditorStore(useShallow((s) => [...s.document.rootNodeIds].reverse()));

  return (
    <div className="panel-section" style={{ flex: 1 }}>
      <h3 className="panel-title">Layers</h3>
      {rootIds.length === 0 ? (
        <div className="empty-hint">No objects yet. Pick a tool and draw on the canvas.</div>
      ) : (
        rootIds.map((id) => <LayerRow key={id} id={id} depth={0} />)
      )}
    </div>
  );
}
