/**
 * Smart-alignment guide overlay — dotted guide lines + concise labels drawn in
 * host-pixel space. Purely presentational; reads active guides from the store.
 * Separate from artwork so guides NEVER appear in exported SVG (spec: guides
 * absent from exports).
 */
import { memo } from "react";
import { useGuides, useViewport } from "@/store/selectors";
import { rootToLocal } from "@/geometry/viewport";

export const GuidesOverlay = memo(function GuidesOverlay() {
  const guides = useGuides();
  const viewport = useViewport();
  if (guides.length === 0) return null;

  return (
    <svg className="chill-guides" width="100%" height="100%" pointerEvents="none">
      {guides.map((g, i) => {
        if (g.axis === "x") {
          const p = rootToLocal(g.value, g.from, viewport);
          const p2 = rootToLocal(g.value, g.to, viewport);
          const mid = (p.y + p2.y) / 2;
          return (
            <g key={i}>
              <line
                x1={p.x}
                y1={p.y}
                x2={p2.x}
                y2={p2.y}
                stroke="var(--snap, #ff36b0)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <GuideLabel x={p.x + 4} y={mid} text={g.label} />
              {g.points?.map((pt, j) => {
                const sp = rootToLocal(pt.x, pt.y, viewport);
                return <SnapDot key={j} x={sp.x} y={sp.y} />;
              })}
            </g>
          );
        }
        const p = rootToLocal(g.from, g.value, viewport);
        const p2 = rootToLocal(g.to, g.value, viewport);
        const mid = (p.x + p2.x) / 2;
        return (
          <g key={i}>
            <line
              x1={p.x}
              y1={p.y}
              x2={p2.x}
              y2={p2.y}
              stroke="var(--snap, #ff36b0)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <GuideLabel x={mid} y={p.y - 6} text={g.label} />
            {g.points?.map((pt, j) => {
              const sp = rootToLocal(pt.x, pt.y, viewport);
              return <SnapDot key={j} x={sp.x} y={sp.y} />;
            })}
          </g>
        );
      })}
    </svg>
  );
});

function GuideLabel({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text
      x={x}
      y={y}
      fontSize={10}
      fill="#fff"
      stroke="var(--snap, #ff36b0)"
      strokeWidth={0.5}
      paintOrder="stroke"
      dominantBaseline="middle"
      style={{ userSelect: "none" }}
    >
      {text}
    </text>
  );
}

function SnapDot({ x, y }: { x: number; y: number }) {
  return <rect x={x - 2.5} y={y - 2.5} width={5} height={5} fill="var(--snap, #ff36b0)" />;
}
