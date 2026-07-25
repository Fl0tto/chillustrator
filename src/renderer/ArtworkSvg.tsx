/**
 * The authoritative artwork <svg>.
 *
 * Content is rendered natively (spec §4.7) inside a single pan/zoom group. This
 * element is the hit-testing surface; interactions read pointer targets from it
 * and measure geometry from it. It contains NO editor handles (those live in the
 * separate overlay), so it maps 1:1 to what export produces.
 */
import { forwardRef } from "react";
import { useEditorStore } from "@/store/editorStore";
import { useShallow } from "zustand/react/shallow";
import { SvgNodeRenderer, StaticSvgNode } from "./SvgNodeRenderer";
import { DefsRenderer } from "./DefsRenderer";

const CHECKER = "chill-checker";
const GRID = "chill-grid";

export const ArtworkSvg = forwardRef<SVGSVGElement>(function ArtworkSvg(_props, ref) {
  const rootNodeIds = useEditorStore(useShallow((s) => s.document.rootNodeIds));
  const width = useEditorStore((s) => s.document.width);
  const height = useEditorStore((s) => s.document.height);
  const viewport = useEditorStore(useShallow((s) => s.viewport));
  const showChecker = useEditorStore((s) => s.preferences.showCheckerboard);
  const showGrid = useEditorStore((s) => s.preferences.snapGrid);
  const gridSize = useEditorStore((s) => s.preferences.gridSize);
  const previewNode = useEditorStore((s) => s.interaction.previewNode);

  const groupTransform = `translate(${viewport.panX} ${viewport.panY}) scale(${viewport.zoom})`;
  // Keep grid lines ~1 device px regardless of zoom (pattern lives in user space).
  const gridStroke = 1 / Math.max(viewport.zoom, 1e-6);

  return (
    <svg
      ref={ref}
      className="chill-artwork"
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      data-artwork-root="true"
    >
      <defs>
        <pattern id={CHECKER} width="20" height="20" patternUnits="userSpaceOnUse">
          <rect width="20" height="20" fill="#ffffff" />
          <rect width="10" height="10" fill="#e6e6e9" />
          <rect x="10" y="10" width="10" height="10" fill="#e6e6e9" />
        </pattern>
        {showGrid && gridSize > 0 && (
          <pattern id={GRID} width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
            <path
              d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
              fill="none"
              stroke="#7c83a3"
              strokeOpacity={0.35}
              strokeWidth={gridStroke}
            />
          </pattern>
        )}
      </defs>
      <g transform={groupTransform}>
        {/* Artboard background */}
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill={showChecker ? `url(#${CHECKER})` : "#ffffff"}
          data-artboard="true"
        />
        {showGrid && gridSize > 0 && (
          <rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill={`url(#${GRID})`}
            pointerEvents="none"
            data-grid="true"
          />
        )}
        <DefsRenderer />
        <g data-artwork-content="true">
          {rootNodeIds.map((id) => (
            <SvgNodeRenderer key={id} nodeId={id} />
          ))}
        </g>
        {previewNode && (
          <g data-preview="true" pointerEvents="none">
            <StaticSvgNode node={previewNode} />
          </g>
        )}
      </g>
    </svg>
  );
});
