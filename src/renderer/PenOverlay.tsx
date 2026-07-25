/**
 * Pen-tool draft overlay — live preview of the path being drawn: committed
 * anchors + Bézier handles, a rubber-band segment from the last anchor to the
 * pointer, and a highlight on the first anchor when hovering it would close the
 * path. Presentational only; the committed PathNode is what ends up in artwork.
 */
import { memo } from "react";
import { usePenDraft, useViewport } from "@/store/selectors";
import { rootToLocal } from "@/geometry/viewport";
import { draftPreviewD, draftSegmentD } from "@/interactions/penPreview";

const R = 4;

export const PenOverlay = memo(function PenOverlay() {
  const draft = usePenDraft();
  const viewport = useViewport();
  if (!draft) return null;

  const groupTransform = `translate(${viewport.panX} ${viewport.panY}) scale(${viewport.zoom})`;
  const committed = draftPreviewD(draft.anchors);
  const live = draft.cursor && draft.anchors.length > 0
    ? draftSegmentD(draft.anchors[draft.anchors.length - 1], draft.cursor)
    : null;

  return (
    <svg className="chill-pen" width="100%" height="100%" pointerEvents="none">
      <g transform={groupTransform}>
        {committed && (
          <path d={committed} fill="none" stroke="var(--accent)" strokeWidth={1 / viewport.zoom} vectorEffect="non-scaling-stroke" />
        )}
        {live && (
          <path d={live} fill="none" stroke="var(--accent)" strokeWidth={1 / viewport.zoom} strokeDasharray={`${4 / viewport.zoom} ${3 / viewport.zoom}`} />
        )}
      </g>
      {draft.anchors.map((a, i) => {
        const p = rootToLocal(a.x, a.y, viewport);
        const isFirst = i === 0;
        const highlight = isFirst && draft.overStart;
        return (
          <g key={i}>
            {a.handleOut && <HandleLine a={p} b={rootToLocal(a.handleOut.x, a.handleOut.y, viewport)} />}
            {a.handleIn && <HandleLine a={p} b={rootToLocal(a.handleIn.x, a.handleIn.y, viewport)} />}
            <rect
              x={p.x - R}
              y={p.y - R}
              width={R * 2}
              height={R * 2}
              fill={highlight ? "var(--accent)" : "#fff"}
              stroke="var(--accent)"
              strokeWidth={1}
            />
          </g>
        );
      })}
    </svg>
  );
});

function HandleLine({ a, b }: { a: { x: number; y: number }; b: { x: number; y: number } }) {
  return (
    <>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--accent)" strokeWidth={1} opacity={0.6} />
      <circle cx={b.x} cy={b.y} r={3} fill="var(--accent)" />
    </>
  );
}
