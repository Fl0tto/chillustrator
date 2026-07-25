/**
 * InspectorPanel — properties editor for the selection.
 *
 * Transparency (ALP-005): independent Object / Fill / Stroke opacity, each with a
 * percentage input + slider and mixed-value handling for multiple selection.
 * Slider drags coalesce into ONE undo entry (applyCoalesced, HST-002). When the
 * node editor is active a Path section exposes anchor mode, segment type, and
 * corner-radius controls.
 */
import { useRef } from "react";
import { useSelectedNodes, usePathEdit } from "@/store/selectors";
import { useEditorStore } from "@/store/editorStore";
import { solidPaint } from "@/model/factory";
import {
  setFillCommand,
  setStrokeCommand,
  setStrokeWidthCommand,
  setFillOpacityCommand,
  setStrokeOpacityCommand,
} from "@/commands/styleCommands";
import { setOpacityCommand, updateNodeGeometryCommand, setNodeTransformCommand } from "@/commands/transformCommands";
import {
  setSelectedAnchorsMode,
  setSelectedSegmentCurved,
  setSelectedCornerRadius,
} from "@/interactions/pathEditActions";
import { locateAnchor } from "@/geometry/editablePath";
import type { AnchorMode } from "@/geometry/editablePath";
import type { Command } from "@/commands/command";
import type { SvgNode, PaintReference } from "@/model/types";

let dragKeySeq = 0;

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

/**
 * Percentage opacity control: slider (coalesced live drag) + numeric input.
 * `value` is 0..1 or null when the selection has mixed values.
 */
function AlphaControl({
  label,
  value,
  disabled,
  makeCommand,
  coalesceKey,
}: {
  label: string;
  value: number | null;
  disabled?: boolean;
  makeCommand: (opacity: number) => Command;
  coalesceKey: string;
}) {
  const applyCoalesced = useEditorStore((s) => s.applyCoalesced);
  const apply = useEditorStore((s) => s.apply);
  const dragKey = useRef<string | null>(null);
  const pct = value === null ? "" : Math.round(value * 100);

  return (
    <div className="field-row">
      <label>{label}</label>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        disabled={disabled}
        value={value === null ? 100 : Math.round(value * 100)}
        onPointerDown={() => {
          dragKey.current = `${coalesceKey}:${dragKeySeq++}`;
        }}
        onChange={(e) => {
          const o = Number(e.target.value) / 100;
          const key = dragKey.current ?? `${coalesceKey}:${dragKeySeq++}`;
          applyCoalesced(makeCommand(o), key);
        }}
        style={{ flex: 1 }}
      />
      <input
        className="input"
        type="number"
        min={0}
        max={100}
        style={{ width: 56 }}
        disabled={disabled}
        placeholder={value === null ? "—" : undefined}
        value={pct}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) apply(makeCommand(Math.max(0, Math.min(1, v / 100))));
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

/** Path node-editor controls (visible while the node tool has a session). */
function PathEditFields() {
  const session = usePathEdit();
  if (!session) return null;
  const selCount = session.selected.length;

  // Corner radius of the first selected anchor (for the numeric input).
  let radius = 0;
  if (selCount > 0) {
    const loc = locateAnchor(session.path, session.selected[0]);
    if (loc) radius = session.path.subpaths[loc.sub].anchors[loc.anchor].cornerRadius ?? 0;
  }

  const modeBtn = (mode: AnchorMode, text: string) => (
    <button className="btn" disabled={selCount === 0} onClick={() => setSelectedAnchorsMode(mode)}>
      {text}
    </button>
  );

  return (
    <div className="panel-section">
      <h3 className="panel-title">Path — {selCount} anchor{selCount === 1 ? "" : "s"}</h3>
      <div className="field-row">
        <label>Anchor</label>
        {modeBtn("corner", "Corner")}
        {modeBtn("smooth", "Smooth")}
        {modeBtn("symmetric", "Symmetric")}
      </div>
      <div className="field-row">
        <label>Segment</label>
        <button className="btn" disabled={selCount === 0} onClick={() => setSelectedSegmentCurved(false)}>
          Line
        </button>
        <button className="btn" disabled={selCount === 0} onClick={() => setSelectedSegmentCurved(true)}>
          Curve
        </button>
      </div>
      <NumberField
        label="Corner R"
        value={radius}
        step={1}
        onCommit={(v) => setSelectedCornerRadius(Math.max(0, v))}
      />
      <div className="empty-hint">
        Drag anchors & handles on the canvas. Use the pink grip to round a corner.
      </div>
    </div>
  );
}

/** Common value across a list, or null when they differ ("Mixed"). */
function common<T>(values: T[]): T | null {
  if (values.length === 0) return null;
  const first = values[0];
  return values.every((v) => v === first) ? first : null;
}

export function InspectorPanel() {
  const nodes = useSelectedNodes();
  const apply = useEditorStore((s) => s.apply);
  const pathEdit = usePathEdit();

  if (nodes.length === 0 && !pathEdit) {
    return (
      <div className="panel-section">
        <h3 className="panel-title">Inspector</h3>
        <div className="empty-hint">Select an object to edit its properties.</div>
      </div>
    );
  }

  const ids = nodes.map((n) => n.id);
  const primary = nodes[0];

  const objectOpacity = common(nodes.map((n) => n.opacity));
  const withFill = nodes.filter((n) => n.style.fill);
  const withStroke = nodes.filter((n) => n.style.stroke);
  const fillOpacity = withFill.length ? common(withFill.map((n) => n.style.fill!.opacity)) : null;
  const strokeOpacity = withStroke.length ? common(withStroke.map((n) => n.style.stroke!.opacity)) : null;

  return (
    <>
      {primary && (
        <div className="panel-section">
          <h3 className="panel-title">
            {nodes.length === 1 ? `${primary.type} · ${primary.name}` : `${nodes.length} objects`}
          </h3>
          {nodes.length === 1 && <GeometryFields node={primary} />}
          <AlphaControl
            label="Opacity"
            value={objectOpacity}
            makeCommand={(o) => setOpacityCommand(ids, o)}
            coalesceKey={`opacity:${ids.join(",")}`}
          />
        </div>
      )}

      {primary && (
        <div className="panel-section">
          <h3 className="panel-title">Fill</h3>
          <PaintEditor label="Fill" paint={primary.style.fill} onChange={(p) => apply(setFillCommand(ids, p))} />
          <AlphaControl
            label="Fill α"
            value={fillOpacity}
            disabled={withFill.length === 0}
            makeCommand={(o) => setFillOpacityCommand(ids, o)}
            coalesceKey={`fill-opacity:${ids.join(",")}`}
          />
        </div>
      )}

      {primary && (
        <div className="panel-section">
          <h3 className="panel-title">Stroke</h3>
          <PaintEditor label="Color" paint={primary.style.stroke} onChange={(p) => apply(setStrokeCommand(ids, p))} />
          <NumberField
            label="Width"
            value={primary.style.strokeWidth}
            step={0.5}
            onCommit={(v) => apply(setStrokeWidthCommand(ids, v))}
          />
          <AlphaControl
            label="Stroke α"
            value={strokeOpacity}
            disabled={withStroke.length === 0}
            makeCommand={(o) => setStrokeOpacityCommand(ids, o)}
            coalesceKey={`stroke-opacity:${ids.join(",")}`}
          />
        </div>
      )}

      {nodes.length === 1 && primary.type === "text" && <TextFields node={primary} />}
      <PathEditFields />
    </>
  );
}
