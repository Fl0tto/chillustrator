/**
 * Editor overlay <svg> — selection box, resize/rotate handles, marquee, hover.
 *
 * Rendered in host-local PIXEL space so handles stay a constant size regardless
 * of zoom. Kept separate from the artwork so it re-renders independently
 * (PERF-005) and never leaks into exported SVG.
 *
 * Handles carry `data-handle` / `data-rotate` attributes; the interaction layer
 * (Agent D) reads these from pointer targets to drive resize/rotate. This
 * component is purely presentational.
 */
import { memo } from "react";
import { useSelectionBounds, useViewport, useInteraction, useTool } from "@/store/selectors";
import { rootToLocal } from "@/geometry/viewport";
import type { HandleId } from "@/interactions/handles";

const HANDLE_SIZE = 8;
const ROTATE_OFFSET = 22;

const CORNER_HANDLES: { id: HandleId; fx: number; fy: number; cursor: string }[] = [
  { id: "nw", fx: 0, fy: 0, cursor: "nwse-resize" },
  { id: "n", fx: 0.5, fy: 0, cursor: "ns-resize" },
  { id: "ne", fx: 1, fy: 0, cursor: "nesw-resize" },
  { id: "e", fx: 1, fy: 0.5, cursor: "ew-resize" },
  { id: "se", fx: 1, fy: 1, cursor: "nwse-resize" },
  { id: "s", fx: 0.5, fy: 1, cursor: "ns-resize" },
  { id: "sw", fx: 0, fy: 1, cursor: "nesw-resize" },
  { id: "w", fx: 0, fy: 0.5, cursor: "ew-resize" },
];

export const EditorOverlay = memo(function EditorOverlay() {
  const bounds = useSelectionBounds();
  const viewport = useViewport();
  const interaction = useInteraction();
  const tool = useTool();
  // The Pen / node editors draw their own anchor+handle chrome instead.
  const showSelection = tool !== "pen" && tool !== "node";

  return (
    <svg className="chill-overlay" width="100%" height="100%" pointerEvents="none">
      {showSelection && bounds &&
        (() => {
          const tl = rootToLocal(bounds.minX, bounds.minY, viewport);
          const br = rootToLocal(bounds.maxX, bounds.maxY, viewport);
          const x = tl.x;
          const y = tl.y;
          const w = br.x - tl.x;
          const h = br.y - tl.y;
          const cx = x + w / 2;
          return (
            <g data-selection-overlay="true">
              <rect
                className="chill-selbox"
                x={x}
                y={y}
                width={w}
                height={h}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={1}
              />
              {/* Rotation handle */}
              <line
                x1={cx}
                y1={y}
                x2={cx}
                y2={y - ROTATE_OFFSET}
                stroke="var(--accent)"
                strokeWidth={1}
              />
              <circle
                className="chill-handle"
                data-rotate="true"
                cx={cx}
                cy={y - ROTATE_OFFSET}
                r={HANDLE_SIZE / 2 + 1}
                fill="#fff"
                stroke="var(--accent)"
                strokeWidth={1}
                pointerEvents="auto"
                style={{ cursor: "grab" }}
              />
              {CORNER_HANDLES.map((hd) => {
                const hx = x + hd.fx * w;
                const hy = y + hd.fy * h;
                return (
                  <rect
                    key={hd.id}
                    className="chill-handle"
                    data-handle={hd.id}
                    x={hx - HANDLE_SIZE / 2}
                    y={hy - HANDLE_SIZE / 2}
                    width={HANDLE_SIZE}
                    height={HANDLE_SIZE}
                    fill="#fff"
                    stroke="var(--accent)"
                    strokeWidth={1}
                    pointerEvents="auto"
                    style={{ cursor: hd.cursor }}
                  />
                );
              })}
            </g>
          );
        })()}

      {interaction.marquee &&
        (() => {
          const m = interaction.marquee;
          const tl = rootToLocal(m.x, m.y, viewport);
          const br = rootToLocal(m.x + m.width, m.y + m.height, viewport);
          return (
            <rect
              className="chill-marquee"
              x={Math.min(tl.x, br.x)}
              y={Math.min(tl.y, br.y)}
              width={Math.abs(br.x - tl.x)}
              height={Math.abs(br.y - tl.y)}
              fill="var(--accent)"
              fillOpacity={0.1}
              stroke="var(--accent)"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          );
        })()}
    </svg>
  );
});
