/**
 * Renders <defs> for the artwork:
 *  - gradient/pattern paint definitions (doc.paints)
 *  - `<textPath>` arc baselines for arc-warped text nodes
 *  - `<filter>` drop-shadow effects for nodes carrying `effects`
 */
import { memo } from "react";
import { useEditorStore } from "@/store/editorStore";
import { useShallow } from "zustand/react/shallow";
import type { PaintDefinition, SvgNode } from "@/model/types";
import { toSvgTransform } from "@/geometry/matrix";
import { buildFilterMarkup, hasEffects } from "@/geometry/filters";
import { hasTextArcWarp, textArcPathD, textWarpArcId } from "@/geometry/warpResolve";

/** Rough glyph advance (matches nodeGeometry) for sizing the text arc span. */
const TEXT_ADVANCE_FACTOR = 0.6;

function renderPaint(paint: PaintDefinition) {
  const stops = paint.stops.map((s, i) => (
    <stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />
  ));
  const gradientTransform = paint.transform ? toSvgTransform(paint.transform) : undefined;

  if (paint.kind === "linearGradient") {
    return (
      <linearGradient
        key={paint.id}
        id={paint.id}
        x1={paint.x1}
        y1={paint.y1}
        x2={paint.x2}
        y2={paint.y2}
        gradientUnits={paint.units}
        spreadMethod={paint.spreadMethod}
        gradientTransform={gradientTransform}
      >
        {stops}
      </linearGradient>
    );
  }
  return (
    <radialGradient
      key={paint.id}
      id={paint.id}
      cx={paint.cx}
      cy={paint.cy}
      r={paint.r}
      fx={paint.fx}
      fy={paint.fy}
      gradientUnits={paint.units}
      spreadMethod={paint.spreadMethod}
      gradientTransform={gradientTransform}
    >
      {stops}
    </radialGradient>
  );
}

/** Text-arc baseline path def for one arc-warped text node. */
function renderTextArc(node: Extract<SvgNode, { type: "text" }>) {
  if (node.warp?.type !== "arc") return null;
  const width = Math.max(1, node.text.length * node.fontSize * TEXT_ADVANCE_FACTOR);
  const d = textArcPathD(node.warp, node.x, node.y, width);
  return <path key={textWarpArcId(node.id)} id={textWarpArcId(node.id)} d={d} fill="none" />;
}

/** Filter def (drop shadows) for one node, via generated markup. */
function renderFilter(node: SvgNode) {
  const markup = buildFilterMarkup(node);
  if (!markup) return null;
  return <g key={`f-${node.id}`} dangerouslySetInnerHTML={{ __html: markup }} />;
}

export const DefsRenderer = memo(function DefsRenderer() {
  const paints = useEditorStore(useShallow((s) => Object.values(s.document.paints)));
  const nodes = useEditorStore(useShallow((s) => Object.values(s.document.nodes)));

  const textArcs = nodes.filter(hasTextArcWarp) as Extract<SvgNode, { type: "text" }>[];
  const filtered = nodes.filter(hasEffects);

  if (paints.length === 0 && textArcs.length === 0 && filtered.length === 0) return null;
  return (
    <defs>
      {paints.map(renderPaint)}
      {textArcs.map(renderTextArc)}
      {filtered.map(renderFilter)}
    </defs>
  );
});
