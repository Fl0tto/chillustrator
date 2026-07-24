/**
 * Shape Builder overlay — draws the atomic faces of the arrangement so the user
 * can see what they're picking. Kept faces are filled solid; the hovered face
 * gets a highlight. Rendered inside a single root→screen transform group so the
 * world-space face geometry lines up with the artwork under any zoom/pan.
 *
 * Presentational only; the useShapeBuilder hook owns the interaction.
 */
import { memo } from "react";
import { useEditorStore } from "@/store/editorStore";
import { useViewport } from "@/store/selectors";
import { serializePath } from "@/geometry/pathData";

export const ShapeBuilderOverlay = memo(function ShapeBuilderOverlay() {
  const shapeBuilder = useEditorStore((s) => s.shapeBuilder);
  const viewport = useViewport();
  if (!shapeBuilder || shapeBuilder.faces.length === 0) return null;

  const { faces, kept, hovered } = shapeBuilder;
  const keptSet = new Set(kept);

  return (
    <svg className="chill-sb-overlay" width="100%" height="100%" pointerEvents="none">
      <g transform={`translate(${viewport.panX} ${viewport.panY}) scale(${viewport.zoom})`}>
        {faces.map((face, i) => {
          const d = serializePath(face.geometry, 3);
          const isKept = keptSet.has(i);
          const isHover = i === hovered;
          const fill = isKept
            ? "color-mix(in srgb, var(--accent) 45%, transparent)"
            : isHover
              ? "color-mix(in srgb, var(--accent) 22%, transparent)"
              : "transparent";
          return (
            <path
              key={face.id}
              d={d}
              fill={fill}
              fillRule="evenodd"
              stroke="var(--accent)"
              strokeWidth={isKept || isHover ? 1.5 : 0.75}
              strokeOpacity={isKept || isHover ? 0.9 : 0.4}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </g>
    </svg>
  );
});
