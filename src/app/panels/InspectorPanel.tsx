/**
 * InspectorPanel — wave-1 baseline properties editor for the selection.
 * Superseded by Agent E's richer inspector (src/components/inspector) in wave 2.
 */
import { useSelectedNodes } from "@/store/selectors";
import { useEditorStore } from "@/store/editorStore";
import { solidPaint } from "@/model/factory";
import { setFillCommand, setStrokeCommand, setStrokeWidthCommand } from "@/commands/styleCommands";
import { setOpacityCommand, updateNodeGeometryCommand, setNodeTransformCommand } from "@/commands/transformCommands";
import type { SvgNode, PaintReference } from "@/model/types";

function NumberField({
  label,
  value,
  onCommit,
  step = 1,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  step?: number;
}) {
  return (
    <div className="field-row">
      <label>{label}</label>
      <input
        className="input"
        type="number"
        step={step}
        value={Math.round(value * 100) / 100}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onCommit(v);
        }}
      />
    </div>
  );
}

function PaintEditor({
  label,
  paint,
  onChange,
}: {
  label: string;
  paint: PaintReference | null;
  onChange: (p: PaintReference | null) => void;
}) {
  const color = paint?.kind === "solid" ? paint.value : "#000000";
  const opacity = paint?.opacity ?? 1;
  return (
    <div className="field-row">
      <label>{label}</label>
      <input
        type="color"
        className="color-swatch"
        value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#000000"}
        onChange={(e) => onChange(solidPaint(e.target.value, opacity))}
      />
      <input
        className="input"
        value={paint ? color : ""}
        placeholder="none"
        onChange={(e) => {
          const v = e.target.value.trim();
          onChange(v ? solidPaint(v, opacity) : null);
        }}
      />
      <button
        className="btn"
        title={paint ? "Remove" : "Add"}
        style={{ width: 28 }}
        onClick={() => onChange(paint ? null : solidPaint("#000000", 1))}
      >
        {paint ? "×" : "+"}
      </button>
    </div>
  );
}

function GeometryFields({ node }: { node: SvgNode }) {
  const apply = useEditorStore((s) => s.apply);
  const setPos = (e: number, f: number) =>
    apply(setNodeTransformCommand(node.id, { ...node.transform, e, f }));

  return (
    <>
      <NumberField label="X" value={node.transform.e} onCommit={(v) => setPos(v, node.transform.f)} />
      <NumberField label="Y" value={node.transform.f} onCommit={(v) => setPos(node.transform.e, v)} />
      {node.type === "rect" && (
        <>
          <NumberField label="W" value={node.width} onCommit={(v) => apply(updateNodeGeometryCommand(node.id, { width: Math.max(1, v) }))} />
          <NumberField label="H" value={node.height} onCommit={(v) => apply(updateNodeGeometryCommand(node.id, { height: Math.max(1, v) }))} />
          <NumberField label="Radius" value={node.rx} onCommit={(v) => apply(updateNodeGeometryCommand(node.id, { rx: Math.max(0, v), ry: Math.max(0, v) }))} />
        </>
      )}
      {node.type === "ellipse" && (
        <>
          <NumberField label="W" value={node.rx * 2} onCommit={(v) => apply(updateNodeGeometryCommand(node.id, { rx: Math.max(0.5, v / 2) }))} />
          <NumberField label="H" value={node.ry * 2} onCommit={(v) => apply(updateNodeGeometryCommand(node.id, { ry: Math.max(0.5, v / 2) }))} />
        </>
      )}
    </>
  );
}

function TextFields({ node }: { node: Extract<SvgNode, { type: "text" }> }) {
  const apply = useEditorStore((s) => s.apply);
  return (
    <div className="panel-section">
      <h3 className="panel-title">Text</h3>
      <div className="field-row">
        <label>Content</label>
        <input
          className="input"
          value={node.text}
          onChange={(e) => apply(updateNodeGeometryCommand(node.id, { text: e.target.value }, "Edit text"))}
        />
      </div>
      <NumberField label="Size" value={node.fontSize} onCommit={(v) => apply(updateNodeGeometryCommand(node.id, { fontSize: Math.max(1, v) }))} />
      <div className="field-row">
        <label>Font</label>
        <input
          className="input"
          value={node.fontFamily}
          onChange={(e) => apply(updateNodeGeometryCommand(node.id, { fontFamily: e.target.value }))}
        />
      </div>
    </div>
  );
}

export function InspectorPanel() {
  const nodes = useSelectedNodes();
  const apply = useEditorStore((s) => s.apply);

  if (nodes.length === 0) {
    return (
      <div className="panel-section">
        <h3 className="panel-title">Inspector</h3>
        <div className="empty-hint">Select an object to edit its properties.</div>
      </div>
    );
  }

  const ids = nodes.map((n) => n.id);
  const primary = nodes[0];

  return (
    <>
      <div className="panel-section">
        <h3 className="panel-title">
          {nodes.length === 1 ? `${primary.type} · ${primary.name}` : `${nodes.length} objects`}
        </h3>
        {nodes.length === 1 && <GeometryFields node={primary} />}
        <NumberField
          label="Opacity"
          value={primary.opacity}
          step={0.1}
          onCommit={(v) => apply(setOpacityCommand(ids, v))}
        />
      </div>

      <div className="panel-section">
        <h3 className="panel-title">Fill</h3>
        <PaintEditor label="Fill" paint={primary.style.fill} onChange={(p) => apply(setFillCommand(ids, p))} />
      </div>

      <div className="panel-section">
        <h3 className="panel-title">Stroke</h3>
        <PaintEditor label="Color" paint={primary.style.stroke} onChange={(p) => apply(setStrokeCommand(ids, p))} />
        <NumberField
          label="Width"
          value={primary.style.strokeWidth}
          step={0.5}
          onCommit={(v) => apply(setStrokeWidthCommand(ids, v))}
        />
      </div>

      {nodes.length === 1 && primary.type === "text" && <TextFields node={primary} />}
    </>
  );
}
