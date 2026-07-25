/**
 * Direct-selection (node) editor overlay — draws editable anchors, Bézier
 * handles for selected anchors, and a corner-radius handle for selected straight
 * corners. Interactive elements carry data-attributes the path-editor controller
 * reads (data-pen-anchor / data-pen-handle / data-pen-radius). Presentational.
 */
import { memo } from "react";
import { usePathEdit, useViewport } from "@/store/selectors";
import { useEditorStore } from "@/store/editorStore";
import { rootToLocal } from "@/geometry/viewport";
import { worldMatrix } from "@/geometry/nodeGeometry";
import { applyToPoint, identityMatrix, type Point } from "@/geometry/matrix";
import { flatAnchors, anchorPoint, type Anchor } from "@/geometry/editablePath";

const AR = 4.5;
const HR = 3.5;

export const PathEditOverlay = memo(function PathEditOverlay() {
  const session = usePathEdit();
  const viewport = useViewport();
  const document = useEditorStore((s) => s.document);
  if (!session) return null;
  const node = document.nodes[session.nodeId];
  if (!node) return null;

  const world = worldMatrix(document, session.nodeId) ?? identityMatrix();
  const toScreen = (p: Point) => {
    const w = applyToPoint(world, p);
    return rootToLocal(w.x, w.y, viewport);
  };

  const anchors = flatAnchors(session.path);
  const selected = new Set(session.selected);

  return (
    <svg className="chill-pathedit" width="100%" height="100%" pointerEvents="none">
      {anchors.map(({ index, sub, anchor, a }) => {
        const p = toScreen(anchorPoint(a));
        const isSel = selected.has(index);
        return (
          <g key={index}>
            {isSel && a.handleIn && <Handle from={p} to={toScreen(a.handleIn)} which="in" index={index} />}
            {isSel && a.handleOut && <Handle from={p} to={toScreen(a.handleOut)} which="out" index={index} />}
            {isSel && <RadiusHandle overlaySession={{ sub, anchor }} a={a} p={p} toScreen={toScreen} index={index} session={session} />}
            <rect
              data-pen-anchor={index}
              x={p.x - AR}
              y={p.y - AR}
              width={AR * 2}
              height={AR * 2}
              fill={isSel ? "var(--accent)" : "#fff"}
              stroke="var(--accent)"
              strokeWidth={1}
              pointerEvents="auto"
              style={{ cursor: "pointer" }}
            />
          </g>
        );
      })}
    </svg>
  );
});

function Handle({
  from,
  to,
  which,
  index,
}: {
  from: Point;
  to: Point;
  which: "in" | "out";
  index: number;
}) {
  return (
    <>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="var(--accent)" strokeWidth={1} opacity={0.7} />
      <circle
        data-pen-handle={which}
        data-anchor-index={index}
        cx={to.x}
        cy={to.y}
        r={HR}
        fill="var(--accent)"
        pointerEvents="auto"
        style={{ cursor: "grab" }}
      />
    </>
  );
}

/** Corner-radius grip: shown for a selected straight corner anchor. */
function RadiusHandle({
  a,
  p,
  toScreen,
  index,
  session,
  overlaySession,
}: {
  a: Anchor;
  p: Point;
  toScreen: (pt: Point) => Point;
  index: number;
  session: NonNullable<ReturnType<typeof usePathEdit>>;
  overlaySession: { sub: number; anchor: number };
}) {
  const straightCorner = !a.handleIn && !a.handleOut;
  if (!straightCorner) return null;
  const sub = session.path.subpaths[overlaySession.sub];
  const anchors = sub.anchors;
  const n = anchors.length;
  if (n < 3 && !sub.closed) return null;
  const prev = anchors[(overlaySession.anchor - 1 + n) % n];
  const next = anchors[(overlaySession.anchor + 1) % n];
  if (!prev || !next) return null;

  // Bisector direction (screen space) into the corner interior.
  const pp = toScreen(anchorPoint(prev));
  const pn = toScreen(anchorPoint(next));
  const uA = unit({ x: pp.x - p.x, y: pp.y - p.y });
  const uB = unit({ x: pn.x - p.x, y: pn.y - p.y });
  const bis = unit({ x: uA.x + uB.x, y: uA.y + uB.y });
  const dist = Math.max(16, a.cornerRadius ?? 0);
  const hx = p.x + bis.x * dist;
  const hy = p.y + bis.y * dist;

  return (
    <>
      <line x1={p.x} y1={p.y} x2={hx} y2={hy} stroke="var(--snap, #ff36b0)" strokeWidth={1} strokeDasharray="2 2" />
      <circle
        data-pen-radius={index}
        cx={hx}
        cy={hy}
        r={HR}
        fill="var(--snap, #ff36b0)"
        pointerEvents="auto"
        style={{ cursor: "pointer" }}
      />
    </>
  );
}

function unit(v: Point): Point {
  const len = Math.hypot(v.x, v.y);
  if (len < 1e-6) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}
