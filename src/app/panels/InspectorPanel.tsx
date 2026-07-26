/**
 * InspectorPanel — properties editor for the selection.
 *
 * Transparency (ALP-005): independent Object / Fill / Stroke opacity, each with a
 * percentage input + slider and mixed-value handling for multiple selection.
 * Slider drags coalesce into ONE undo entry (applyCoalesced, HST-002).
 *
 * Wave 3 additions: gradient fills (linear/radial with a stop editor), a Google/
 * custom font picker for text, a non-destructive Warp section (arc/wave), and a
 * drop-shadow Effects section. Reference images show only geometry + opacity.
 */
import { useRef, useSyncExternalStore } from "react";
import { useSelectedNodes, usePathEdit } from "@/store/selectors";
import { useEditorStore } from "@/store/editorStore";
import { useShallow } from "zustand/react/shallow";
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
  applyGradientCommand,
  setGradientKindCommand,
  updateGradientCommand,
  type GradientKind,
  type PaintTarget,
} from "@/commands/paintCommands";
import { setWarpCommand, defaultWarp } from "@/commands/warpCommands";
import { addEffectCommand, removeEffectCommand, updateEffectCommand } from "@/commands/effectCommands";
import {
  setSelectedAnchorsMode,
  setSelectedSegmentCurved,
  setSelectedCornerRadius,
} from "@/interactions/pathEditActions";
import { locateAnchor } from "@/geometry/editablePath";
import { isGeometryWarpable } from "@/geometry/warpResolve";
import {
  availableFamilies,
  importCustomFont,
  isImportedFamily,
  loadGoogleFont,
  subscribeFonts,
} from "@/interactions/fontRegistry";
import type { AnchorMode } from "@/geometry/editablePath";
import type { Command } from "@/commands/command";
import type {
  GradientStop,
  PaintDefinition,
  ShadowEffect,
  SvgNode,
  PaintReference,
} from "@/model/types";

let dragKeySeq = 0;

function NumberField({
  label,
  value,
  onCommit,
  step = 1,
  min,
  max,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <div className="field-row">
      <label>{label}</label>
      <input
        className="input"
        type="number"
        step={step}
        min={min}
        max={max}
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
 * A coalesced slider + number pair for an absolute numeric value. Drags collapse
 * into one undo entry via applyCoalesced.
 */
function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  makeCommand,
  coalesceKey,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  makeCommand: (v: number) => Command;
  coalesceKey: string;
}) {
  const applyCoalesced = useEditorStore((s) => s.applyCoalesced);
  const apply = useEditorStore((s) => s.apply);
  const dragKey = useRef<string | null>(null);
  return (
    <div className="field-row">
      <label>{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={() => {
          dragKey.current = `${coalesceKey}:${dragKeySeq++}`;
        }}
        onChange={(e) => {
          const v = Number(e.target.value);
          applyCoalesced(makeCommand(v), dragKey.current ?? `${coalesceKey}:${dragKeySeq++}`);
        }}
        style={{ flex: 1 }}
      />
      <input
        className="input"
        type="number"
        min={min}
        max={max}
        step={step}
        style={{ width: 60 }}
        value={Math.round(value * 100) / 100}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) apply(makeCommand(v));
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
  onValue,
}: {
  label: string;
  value: number | null;
  disabled?: boolean;
  makeCommand: (opacity: number) => Command;
  coalesceKey: string;
  onValue?: (opacity: number) => void;
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
          onValue?.(o);
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
          if (!Number.isNaN(v)) {
            const o = Math.max(0, Math.min(1, v / 100));
            apply(makeCommand(o));
            onValue?.(o);
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gradient editing
// ---------------------------------------------------------------------------

function gradientCss(paint: PaintDefinition): string {
  const stops = [...paint.stops]
    .sort((a, b) => a.offset - b.offset)
    .map((s) => `${s.color} ${Math.round(s.offset * 100)}%`)
    .join(", ");
  return paint.kind === "linearGradient"
    ? `linear-gradient(90deg, ${stops})`
    : `radial-gradient(circle, ${stops})`;
}

function linearAngle(paint: Extract<PaintDefinition, { kind: "linearGradient" }>): number {
  const a = (Math.atan2(paint.y2 - paint.y1, paint.x2 - paint.x1) * 180) / Math.PI;
  return (a + 360) % 360;
}

function angleToCoords(deg: number): { x1: number; y1: number; x2: number; y2: number } {
  const a = (deg * Math.PI) / 180;
  return {
    x1: 0.5 - Math.cos(a) / 2,
    y1: 0.5 - Math.sin(a) / 2,
    x2: 0.5 + Math.cos(a) / 2,
    y2: 0.5 + Math.sin(a) / 2,
  };
}

function GradientEditor({ paint }: { paint: PaintDefinition }) {
  const apply = useEditorStore((s) => s.apply);
  const applyCoalesced = useEditorStore((s) => s.applyCoalesced);
  const stops = [...paint.stops].sort((a, b) => a.offset - b.offset);

  const setStops = (next: GradientStop[], coalesceKey?: string) => {
    const cmd = updateGradientCommand(paint.id, { stops: next });
    if (coalesceKey) applyCoalesced(cmd, coalesceKey);
    else apply(cmd);
  };
  const patchStop = (i: number, patch: Partial<GradientStop>, coalesceKey?: string) => {
    const next = stops.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    setStops(next, coalesceKey);
  };

  return (
    <>
      <div className="field-row">
        <label>Type</label>
        <button
          className={`btn ${paint.kind === "linearGradient" ? "active" : ""}`}
          onClick={() => apply(setGradientKindCommand(paint.id, "linearGradient"))}
        >
          Linear
        </button>
        <button
          className={`btn ${paint.kind === "radialGradient" ? "active" : ""}`}
          onClick={() => apply(setGradientKindCommand(paint.id, "radialGradient"))}
        >
          Radial
        </button>
      </div>

      <div
        style={{
          height: 16,
          borderRadius: 4,
          margin: "4px 0",
          background: gradientCss(paint),
          border: "1px solid var(--border, #3a3f4b)",
        }}
      />

      {paint.kind === "linearGradient" ? (
        <SliderField
          label="Angle"
          value={linearAngle(paint)}
          min={0}
          max={360}
          makeCommand={(deg) => updateGradientCommand(paint.id, angleToCoords(deg))}
          coalesceKey={`grad-angle:${paint.id}`}
        />
      ) : (
        <>
          <SliderField label="Center X" value={paint.cx} min={0} max={1} step={0.01} makeCommand={(cx) => updateGradientCommand(paint.id, { cx })} coalesceKey={`grad-cx:${paint.id}`} />
          <SliderField label="Center Y" value={paint.cy} min={0} max={1} step={0.01} makeCommand={(cy) => updateGradientCommand(paint.id, { cy })} coalesceKey={`grad-cy:${paint.id}`} />
          <SliderField label="Radius" value={paint.r} min={0.01} max={1.5} step={0.01} makeCommand={(r) => updateGradientCommand(paint.id, { r })} coalesceKey={`grad-r:${paint.id}`} />
        </>
      )}

      <div className="field-row">
        <label>Stops</label>
        <button
          className="btn"
          title="Add stop"
          onClick={() => setStops([...paint.stops, { offset: 0.5, color: "#888888", opacity: 1 }])}
        >
          + Stop
        </button>
      </div>
      {stops.map((s, i) => (
        <div key={i} className="field-row" style={{ gap: 4 }}>
          <input
            type="color"
            className="color-swatch"
            value={/^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : "#000000"}
            onChange={(e) => patchStop(i, { color: e.target.value }, `grad-stop-color:${paint.id}:${i}`)}
          />
          <input
            className="input"
            type="number"
            min={0}
            max={100}
            title="Offset %"
            style={{ width: 56 }}
            value={Math.round(s.offset * 100)}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isNaN(v)) patchStop(i, { offset: Math.max(0, Math.min(1, v / 100)) });
            }}
          />
          <input
            className="input"
            type="number"
            min={0}
            max={100}
            title="Opacity %"
            style={{ width: 56 }}
            value={Math.round(s.opacity * 100)}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isNaN(v)) patchStop(i, { opacity: Math.max(0, Math.min(1, v / 100)) });
            }}
          />
          <button
            className="btn"
            title="Remove stop"
            style={{ width: 28 }}
            disabled={stops.length <= 2}
            onClick={() => setStops(paint.stops.filter((_, idx) => idx !== i))}
          >
            ×
          </button>
        </div>
      ))}
    </>
  );
}

/** Fill or Stroke paint section: None / Solid / Linear / Radial + editor. */
function PaintSection({
  label,
  target,
  primary,
  ids,
  paint,
}: {
  label: string;
  target: PaintTarget;
  primary: SvgNode;
  ids: string[];
  paint: PaintReference | null;
}) {
  const apply = useEditorStore((s) => s.apply);
  const setDefaultStyle = useEditorStore((s) => s.setDefaultStyle);
  const paints = useEditorStore((s) => s.document.paints);

  const setSolid = target === "fill" ? setFillCommand : setStrokeCommand;
  const kind: "none" | "solid" | "gradient" =
    !paint ? "none" : paint.kind === "solid" ? "solid" : "gradient";
  const gradient = paint?.kind === "definition" ? paints[paint.value] : undefined;
  const seedColor = paint?.kind === "solid" ? paint.value : gradient?.stops[0]?.color ?? "#888888";
  const color = paint?.kind === "solid" ? paint.value : "#000000";
  const opacity = paint?.opacity ?? 1;

  const chooseType = (type: "none" | "solid" | GradientKind) => {
    if (type === "none") {
      apply(setSolid(ids, null));
      if (target === "fill") setDefaultStyle({ fill: null });
    } else if (type === "solid") {
      const p = solidPaint(seedColor, 1);
      apply(setSolid(ids, p));
      if (target === "fill") setDefaultStyle({ fill: p });
    } else {
      apply(applyGradientCommand(ids, target, type, seedColor));
    }
  };

  const typeBtn = (id: "none" | "solid" | GradientKind, text: string, active: boolean) => (
    <button className={`btn ${active ? "active" : ""}`} onClick={() => chooseType(id)}>
      {text}
    </button>
  );

  return (
    <div className="panel-section">
      <h3 className="panel-title">{label}</h3>
      <div className="field-row" style={{ gap: 4 }}>
        <label>Paint</label>
        {typeBtn("none", "None", kind === "none")}
        {typeBtn("solid", "Solid", kind === "solid")}
        {typeBtn("linearGradient", "Linear", gradient?.kind === "linearGradient")}
        {typeBtn("radialGradient", "Radial", gradient?.kind === "radialGradient")}
      </div>

      {kind === "solid" && (
        <div className="field-row">
          <label>Color</label>
          <input
            type="color"
            className="color-swatch"
            value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#000000"}
            onChange={(e) => {
              const p = solidPaint(e.target.value, opacity);
              apply(setSolid(ids, p));
              if (target === "fill") setDefaultStyle({ fill: p });
            }}
          />
          <input
            className="input"
            value={color}
            onChange={(e) => {
              const v = e.target.value.trim();
              const p = v ? solidPaint(v, opacity) : null;
              apply(setSolid(ids, p));
              if (target === "fill") setDefaultStyle({ fill: p });
            }}
          />
        </div>
      )}

      {gradient && <GradientEditor paint={gradient} />}

      {kind === "solid" && (
        <AlphaControl
          label={`${label} α`}
          value={opacity}
          makeCommand={(o) =>
            target === "fill" ? setFillOpacityCommand(ids, o) : setStrokeOpacityCommand(ids, o)
          }
          coalesceKey={`${target}-opacity:${ids.join(",")}`}
        />
      )}

      {target === "stroke" && (
        <NumberField
          label="Width"
          value={primary.style.strokeWidth}
          step={0.5}
          onCommit={(v) => {
            apply(setStrokeWidthCommand(ids, v));
            setDefaultStyle({ strokeWidth: v });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Geometry / text / warp / effects sections
// ---------------------------------------------------------------------------

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
      {node.type === "image" && (
        <>
          <NumberField label="W" value={node.width} onCommit={(v) => apply(updateNodeGeometryCommand(node.id, { width: Math.max(1, v) }))} />
          <NumberField label="H" value={node.height} onCommit={(v) => apply(updateNodeGeometryCommand(node.id, { height: Math.max(1, v) }))} />
        </>
      )}
    </>
  );
}

function FontControls({ node }: { node: Extract<SvgNode, { type: "text" }> }) {
  const apply = useEditorStore((s) => s.apply);
  const fileInput = useRef<HTMLInputElement>(null);
  // Re-render when a custom font is imported.
  const families = useSyncExternalStore(subscribeFonts, availableFamilies, availableFamilies);
  const listed = families.includes(node.fontFamily) ? families : [node.fontFamily, ...families];

  const setFamily = (family: string) => {
    if (!isImportedFamily(family)) loadGoogleFont(family);
    apply(updateNodeGeometryCommand(node.id, { fontFamily: family }, "Change font"));
  };

  return (
    <>
      <div className="field-row">
        <label>Font</label>
        <select
          className="input"
          value={node.fontFamily}
          onChange={(e) => setFamily(e.target.value)}
          style={{ flex: 1 }}
        >
          {listed.map((f) => (
            <option key={f} value={f}>
              {f}
              {isImportedFamily(f) ? " (imported)" : ""}
            </option>
          ))}
        </select>
        <input
          ref={fileInput}
          type="file"
          accept=".ttf,.otf,.woff,.woff2,font/*"
          style={{ display: "none" }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              const family = await importCustomFont(file);
              setFamily(family);
            } catch {
              window.alert("Could not load that font file.");
            }
          }}
        />
        <button className="btn" title="Import font file" style={{ width: 32 }} onClick={() => fileInput.current?.click()}>
          +
        </button>
      </div>
      <div className="field-row">
        <label>Weight</label>
        <select
          className="input"
          value={String(node.fontWeight)}
          onChange={(e) => apply(updateNodeGeometryCommand(node.id, { fontWeight: Number(e.target.value) }))}
        >
          {[300, 400, 500, 600, 700, 800].map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
        <button
          className={`btn ${node.fontStyle === "italic" ? "active" : ""}`}
          title="Italic"
          onClick={() =>
            apply(updateNodeGeometryCommand(node.id, { fontStyle: node.fontStyle === "italic" ? "normal" : "italic" }))
          }
        >
          <em>I</em>
        </button>
      </div>
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
      <FontControls node={node} />
    </div>
  );
}

/** Non-destructive warp controls (arc bend / sine wave). */
function WarpSection({ node }: { node: SvgNode }) {
  const apply = useEditorStore((s) => s.apply);
  const warp = node.warp;
  const isText = node.type === "text";
  const canWave = isGeometryWarpable(node); // wave needs real geometry, not textPath

  const setType = (type: "none" | "arc" | "wave") => {
    if (type === "none") apply(setWarpCommand([node.id], null));
    else apply(setWarpCommand([node.id], defaultWarp(type)));
  };

  return (
    <div className="panel-section">
      <h3 className="panel-title">Warp</h3>
      <div className="field-row" style={{ gap: 4 }}>
        <label>Type</label>
        <button className={`btn ${!warp ? "active" : ""}`} onClick={() => setType("none")}>
          None
        </button>
        <button className={`btn ${warp?.type === "arc" ? "active" : ""}`} onClick={() => setType("arc")}>
          Arc
        </button>
        <button
          className={`btn ${warp?.type === "wave" ? "active" : ""}`}
          disabled={!canWave}
          title={canWave ? "Sine wave" : "Wave warp is not available for text"}
          onClick={() => setType("wave")}
        >
          Wave
        </button>
      </div>

      {warp?.type === "arc" && (
        <>
          <div className="field-row" style={{ gap: 4 }}>
            <label>Bend</label>
            {(["top", "bottom", "left", "right"] as const).map((dir) => (
              <button
                key={dir}
                className={`btn ${warp.direction === dir ? "active" : ""}`}
                onClick={() => apply(setWarpCommand([node.id], { ...warp, direction: dir }))}
              >
                {dir[0].toUpperCase()}
              </button>
            ))}
          </div>
          <SliderField
            label="Radius"
            value={warp.radius}
            min={20}
            max={1000}
            makeCommand={(radius) => setWarpCommand([node.id], { ...warp, radius })}
            coalesceKey={`warp-radius:${node.id}`}
          />
          {!isText && (
            <SliderField
              label="Amount"
              value={Math.round(warp.amount * 100)}
              min={0}
              max={100}
              makeCommand={(pct) => setWarpCommand([node.id], { ...warp, amount: pct / 100 })}
              coalesceKey={`warp-amount:${node.id}`}
            />
          )}
        </>
      )}

      {warp?.type === "wave" && (
        <>
          <div className="field-row" style={{ gap: 4 }}>
            <label>Axis</label>
            <button
              className={`btn ${warp.axis === "horizontal" ? "active" : ""}`}
              onClick={() => apply(setWarpCommand([node.id], { ...warp, axis: "horizontal" }))}
            >
              Horizontal
            </button>
            <button
              className={`btn ${warp.axis === "vertical" ? "active" : ""}`}
              onClick={() => apply(setWarpCommand([node.id], { ...warp, axis: "vertical" }))}
            >
              Vertical
            </button>
            <button
              className="btn"
              title="Flip direction"
              onClick={() => apply(setWarpCommand([node.id], { ...warp, direction: (warp.direction * -1) as 1 | -1 }))}
            >
              ±
            </button>
          </div>
          <SliderField label="Amplitude" value={warp.amplitude} min={0} max={200} makeCommand={(amplitude) => setWarpCommand([node.id], { ...warp, amplitude })} coalesceKey={`warp-amp:${node.id}`} />
          <SliderField label="Frequency" value={warp.frequency} min={0.25} max={12} step={0.25} makeCommand={(frequency) => setWarpCommand([node.id], { ...warp, frequency })} coalesceKey={`warp-freq:${node.id}`} />
          <SliderField label="Phase" value={Math.round((warp.phase * 180) / Math.PI)} min={0} max={360} makeCommand={(deg) => setWarpCommand([node.id], { ...warp, phase: (deg * Math.PI) / 180 })} coalesceKey={`warp-phase:${node.id}`} />
        </>
      )}
      {isText && (
        <div className="empty-hint">Text supports the Arc warp (rides a live text path). Wave warps shapes &amp; paths.</div>
      )}
    </div>
  );
}

/** Drop-shadow effects (outer / inner), non-destructive. */
function EffectsSection({ node }: { node: SvgNode }) {
  const apply = useEditorStore((s) => s.apply);
  const applyCoalesced = useEditorStore((s) => s.applyCoalesced);
  const effects = node.effects ?? [];

  const patch = (e: ShadowEffect, p: Partial<Omit<ShadowEffect, "id">>, key?: string) => {
    const cmd = updateEffectCommand(node.id, e.id, p);
    if (key) applyCoalesced(cmd, key);
    else apply(cmd);
  };

  return (
    <div className="panel-section">
      <h3 className="panel-title">Effects</h3>
      <div className="field-row" style={{ gap: 4 }}>
        <label>Shadow</label>
        <button className="btn" onClick={() => apply(addEffectCommand([node.id], "outer"))}>
          + Outer
        </button>
        <button className="btn" onClick={() => apply(addEffectCommand([node.id], "inner"))}>
          + Inner
        </button>
      </div>
      {effects.length === 0 && <div className="empty-hint">No shadows. Add an outer or inner drop shadow.</div>}
      {effects.map((e) => (
        <div key={e.id} style={{ borderTop: "1px solid var(--border, #3a3f4b)", paddingTop: 6, marginTop: 6 }}>
          <div className="field-row" style={{ gap: 4 }}>
            <label>
              <input type="checkbox" checked={e.enabled} onChange={(ev) => patch(e, { enabled: ev.target.checked })} />{" "}
              {e.kind === "outer" ? "Outer" : "Inner"}
            </label>
            <input
              type="color"
              className="color-swatch"
              value={/^#[0-9a-fA-F]{6}$/.test(e.color) ? e.color : "#000000"}
              onChange={(ev) => patch(e, { color: ev.target.value }, `fx-color:${e.id}`)}
            />
            <button className="btn" style={{ width: 28 }} title="Remove" onClick={() => apply(removeEffectCommand(node.id, e.id))}>
              ×
            </button>
          </div>
          <SliderField label="Offset X" value={e.dx} min={-100} max={100} makeCommand={(dx) => updateEffectCommand(node.id, e.id, { dx })} coalesceKey={`fx-dx:${e.id}`} />
          <SliderField label="Offset Y" value={e.dy} min={-100} max={100} makeCommand={(dy) => updateEffectCommand(node.id, e.id, { dy })} coalesceKey={`fx-dy:${e.id}`} />
          <SliderField label="Blur" value={e.blur} min={0} max={100} makeCommand={(blur) => updateEffectCommand(node.id, e.id, { blur })} coalesceKey={`fx-blur:${e.id}`} />
          <SliderField label="Spread" value={e.spread ?? 0} min={0} max={50} makeCommand={(spread) => updateEffectCommand(node.id, e.id, { spread })} coalesceKey={`fx-spread:${e.id}`} />
          <SliderField label="Opacity" value={Math.round(e.opacity * 100)} min={0} max={100} makeCommand={(pct) => updateEffectCommand(node.id, e.id, { opacity: pct / 100 })} coalesceKey={`fx-op:${e.id}`} />
        </div>
      ))}
    </div>
  );
}

/** Path node-editor controls (visible while the node tool has a session). */
function PathEditFields() {
  const session = usePathEdit();
  if (!session) return null;
  const selCount = session.selected.length;

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
        Drag anchors &amp; handles on the canvas. Use the pink grip to round a corner.
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
  const ids = nodes.map((n) => n.id);
  const pathEdit = usePathEdit();
  // Subscribe so section editors re-render on paint edits.
  useEditorStore(useShallow((s) => Object.keys(s.document.paints)));

  if (nodes.length === 0 && !pathEdit) {
    return (
      <div className="panel-section">
        <h3 className="panel-title">Inspector</h3>
        <div className="empty-hint">Select an object to edit its properties.</div>
      </div>
    );
  }

  const primary = nodes[0];
  const single = nodes.length === 1 && primary;
  const isImage = single && primary.type === "image";

  const objectOpacity = common(nodes.map((n) => n.opacity));
  const canWarp = single && (isGeometryWarpable(primary) || primary.type === "text");

  return (
    <>
      {primary && (
        <div className="panel-section">
          <h3 className="panel-title">
            {nodes.length === 1
              ? `${primary.type}${isImage && primary.reference ? " · reference" : ""} · ${primary.name}`
              : `${nodes.length} objects`}
          </h3>
          {single && <GeometryFields node={primary} />}
          <AlphaControl
            label="Opacity"
            value={objectOpacity}
            makeCommand={(o) => setOpacityCommand(ids, o)}
            coalesceKey={`opacity:${ids.join(",")}`}
          />
        </div>
      )}

      {primary && !isImage && (
        <PaintSection label="Fill" target="fill" primary={primary} ids={ids} paint={primary.style.fill} />
      )}
      {primary && !isImage && (
        <PaintSection label="Stroke" target="stroke" primary={primary} ids={ids} paint={primary.style.stroke} />
      )}

      {single && primary.type === "text" && <TextFields node={primary} />}
      {canWarp && <WarpSection node={primary} />}
      {single && !isImage && <EffectsSection node={primary} />}
      <PathEditFields />
    </>
  );
}
