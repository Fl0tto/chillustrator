/**
 * Renders <defs> for gradient/pattern paint definitions from doc.paints.
 */
import { memo } from "react";
import { useEditorStore } from "@/store/editorStore";
import { useShallow } from "zustand/react/shallow";
import type { PaintDefinition } from "@/model/types";
import { toSvgTransform } from "@/geometry/matrix";

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

export const DefsRenderer = memo(function DefsRenderer() {
  const paints = useEditorStore(useShallow((s) => Object.values(s.document.paints)));
  if (paints.length === 0) return null;
  return <defs>{paints.map(renderPaint)}</defs>;
});
