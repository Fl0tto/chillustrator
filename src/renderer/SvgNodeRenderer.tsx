/**
 * Renders a single model node (and, for groups, its children) as native SVG.
 *
 * Memoized on the node object identity: because the store produces new node
 * objects only for changed nodes (Immer structural sharing), an unrelated edit
 * does not re-render this component (PERF-004).
 */
import { memo } from "react";
import { useEditorStore } from "@/store/editorStore";
import type { SvgNode } from "@/model/types";
import { baseNodeProps, styleToProps } from "./renderAttributes";
import { hasGeometryWarp, hasTextArcWarp, textWarpArcId, warpedPathD } from "@/geometry/warpResolve";

interface NodeProps {
  nodeId: string;
}

function NodeChildren({ ids }: { ids: string[] }) {
  return (
    <>
      {ids.map((id) => (
        <SvgNodeRenderer key={id} nodeId={id} />
      ))}
    </>
  );
}

function renderNode(node: SvgNode, editing = false) {
  if (!node.visible) return null;
  const base = baseNodeProps(node);
  const style = styleToProps(node.style);

  // Non-destructive geometry warp: render shapes/paths as a deformed <path>.
  if (hasGeometryWarp(node)) {
    const d = warpedPathD(node);
    if (d) return <path {...base} {...style} d={d} />;
  }

  switch (node.type) {
    case "rect":
      return (
        <rect
          {...base}
          {...style}
          x={node.x}
          y={node.y}
          width={node.width}
          height={node.height}
          rx={node.rx || undefined}
          ry={node.ry || undefined}
        />
      );
    case "ellipse":
      return <ellipse {...base} {...style} cx={node.cx} cy={node.cy} rx={node.rx} ry={node.ry} />;
    case "line":
      return (
        <line {...base} {...style} x1={node.x1} y1={node.y1} x2={node.x2} y2={node.y2} fill="none" />
      );
    case "polygon": {
      const pts = node.points.map((p) => `${p.x},${p.y}`).join(" ");
      return node.closed ? (
        <polygon {...base} {...style} points={pts} />
      ) : (
        <polyline {...base} {...style} points={pts} fill="none" />
      );
    }
    case "path":
      return <path {...base} {...style} d={node.d} />;
    case "text": {
      const textProps = {
        ...base,
        ...style,
        fontFamily: node.fontFamily,
        fontSize: node.fontSize,
        fontWeight: node.fontWeight,
        fontStyle: node.fontStyle,
        letterSpacing: node.letterSpacing || undefined,
        // Hide glyphs while the inline editor is open so nothing doubles.
        visibility: editing ? ("hidden" as const) : undefined,
        style: { whiteSpace: "pre" as const, ...style.style },
      };
      // Arc-warped text rides a generated <textPath> and stays editable text.
      if (hasTextArcWarp(node)) {
        return (
          <text {...textProps} textAnchor="middle">
            <textPath href={`#${textWarpArcId(node.id)}`} startOffset="50%">
              {node.text}
            </textPath>
          </text>
        );
      }
      return (
        <text {...textProps} x={node.x} y={node.y} textAnchor={node.textAnchor}>
          {node.text}
        </text>
      );
    }
    case "image":
      return (
        <image
          {...base}
          x={node.x}
          y={node.y}
          width={node.width}
          height={node.height}
          href={node.href}
          preserveAspectRatio="none"
        />
      );
    case "group":
      return (
        <g {...base} {...style}>
          <NodeChildren ids={node.childIds} />
        </g>
      );
    case "unknown":
      // innerMarkup is pre-sanitized at import time (SEC-002/003).
      return (
        <g {...base}>
          <g dangerouslySetInnerHTML={{ __html: node.innerMarkup }} />
        </g>
      );
  }
}

export const SvgNodeRenderer = memo(function SvgNodeRenderer({ nodeId }: NodeProps) {
  const node = useEditorStore((s) => s.document.nodes[nodeId]);
  const editing = useEditorStore((s) => s.editingTextId === nodeId);
  if (!node) return null;
  return renderNode(node, editing);
});

/** Render a node object not backed by the store (e.g. a live creation preview). */
export function StaticSvgNode({ node }: { node: SvgNode }) {
  return renderNode(node);
}
