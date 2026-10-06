/**
 * Curve-tool draft overlay. Shows committed curve segments, the live segment,
 * placed endpoints and lightweight radius/direction feedback for wheel edits.
 */
import { memo } from "react";
import { useCurveDraft, useViewport } from "@/store/selectors";
import { rootToLocal } from "@/geometry/viewport";
import {
  cubicFromBend,
  curveBendPoint,
  curvePathGeometry,
  equivalentCurveRadius,
} from "@/geometry/curvePath";
import { serializePath } from "@/geometry/pathData";

const R = 4;

export const CurveOverlay = memo(function CurveOverlay() {
  const draft = useCurveDraft();
  const viewport = useViewport();
  if (!draft || draft.points.length === 0) return null;

  const zoom = Math.max(viewport.zoom, 1e-6);
  const transform = `translate(${viewport.panX} ${viewport.panY}) scale(${viewport.zoom})`;
  const committed =
    draft.points.length > 1
      ? serializePath(curvePathGeometry(draft.points, draft.bends), 4)
      : "";
  const start = draft.points[draft.points.length - 1];

  let live = "";
  let bendPoint: { x: number; y: number } | null = null;
  let labelPoint: { x: number; y: number } | null = null;
  let label = "";
  if (draft.cursor && Math.hypot(draft.cursor.x - start.x, draft.cursor.y - start.y) > 1e-6) {
    const c = cubicFromBend(start, draft.cursor, draft.activeBend);
    live = serializePath(
      {
        segments: [
          { type: "M", x: start.x, y: start.y },
          c,
        ],
      },
      4,
    );
    bendPoint = curveBendPoint(start, draft.cursor, draft.activeBend);
    labelPoint = rootToLocal(bendPoint.x, bendPoint.y, viewport);
    const radius = equivalentCurveRadius(start, draft.cursor, draft.activeBend);
    const side =
      Math.abs(draft.activeBend) < 0.01 ? "straight" : draft.activeBend > 0 ? "left" : "right";
    label = Number.isFinite(radius) ? `R ${Math.round(radius)} · ${side}` : "R ∞ · straight";
  }

  return (
    <svg className="chill-curve" width="100%" height="100%" pointerEvents="none">
      <g transform={transform}>
        {committed && (
          <path
            d={committed}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1 / zoom}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {live && (
          <path
            d={live}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1 / zoom}
            strokeDasharray={`${5 / zoom} ${3 / zoom}`}
          />
        )}
        {draft.cursor && bendPoint && (
          <>
            <line
              x1={(start.x + draft.cursor.x) / 2}
              y1={(start.y + draft.cursor.y) / 2}
              x2={bendPoint.x}
              y2={bendPoint.y}
              stroke="var(--snap)"
              strokeWidth={1 / zoom}
              strokeDasharray={`${3 / zoom} ${2 / zoom}`}
            />
            <circle cx={bendPoint.x} cy={bendPoint.y} r={3 / zoom} fill="var(--snap)" />
          </>
        )}
      </g>

      {draft.points.map((p, i) => {
        const s = rootToLocal(p.x, p.y, viewport);
        return (
          <rect
            key={i}
            x={s.x - R}
            y={s.y - R}
            width={R * 2}
            height={R * 2}
            fill="#fff"
            stroke="var(--accent)"
            strokeWidth={1}
          />
        );
      })}

      {labelPoint && (
        <text
          x={labelPoint.x + 10}
          y={labelPoint.y - 10}
          fill="var(--text)"
          fontSize={11}
          paintOrder="stroke"
          stroke="var(--bg-panel)"
          strokeWidth={3}
        >
          {label}
        </text>
      )}
    </svg>
  );
});
