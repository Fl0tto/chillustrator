/**
 * Direct-selection (node) editor overlay — draws editable anchors, Bézier
 * handles for selected anchors, and a corner-radius handle for selected straight
 * corners. Interactive elements carry data-attributes the path-editor controller
 * reads (data-pen-anchor / data-pen-handle / data-pen-radius). Presentational.
 *
 * With the Corner tool active the anchors are re-styled as corner widgets so the
 * selected corner (the one a radius drag will affect) is unmistakable: selected
 * corners are filled and haloed, roundable-but-unselected corners are hollow, and
 * anchors that cannot be rounded (they carry handles) are dimmed out.
 */
import { memo } from "react";
import { usePathEdit, useViewport, useTool } from "@/store/selectors";
import { useEditorStore } from "@/store/editorStore";
import { rootToLocal } from "@/geometry/viewport";
import { worldMatrix } from "@/geometry/nodeGeometry";
import { applyToPoint, identityMatrix, type Point } from "@/geometry/matrix";
import {
  flatAnchors,
  anchorPoint,
  isRoundableCorner,
  type Anchor,
  type SubPath,
} from "@/geometry/editablePath";

const AR = 4.5;
const HR = 3.5;
/** Corner-tool widget radius, and the halo drawn around the selected corner. */
const CR = 5;
const CR_HALO = 9.5;
/** Minimum on-screen offset of the radius grip so it never sits on the anchor. */
const MIN_GRIP_PX = 16;

export const PathEditOverlay = memo(function PathEditOverlay() {
  const session = usePathEdit();
  const viewport = useViewport();
  const tool = useTool();
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
  const cornerTool = tool === "corner";

  return (
    <svg className="chill-pathedit" width="100%" height="100%" pointerEvents="none">
      {anchors.map(({ index, sub, anchor, a }) => {
        const p = toScreen(anchorPoint(a));
        const isSel = selected.has(index);
        const roundable = isRoundableCorner(session.path.subpaths[sub], anchor);
        return (
          <g key={index}>
            {!cornerTool && isSel && a.handleIn && (
              <Handle from={p} to={toScreen(a.handleIn)} which="in" index={index} />
            )}
            {!cornerTool && isSel && a.handleOut && (
              <Handle from={p} to={toScreen(a.handleOut)} which="out" index={index} />
            )}
            {isSel && roundable && (
              <RadiusHandle
                a={a}
                p={p}
                at={{ sub, anchor }}
                path={session.path}
                toScreen={toScreen}
                index={index}
              />
            )}
            {cornerTool ? (
              <CornerWidget index={index} p={p} selected={isSel} roundable={roundable} />
            ) : (
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
            )}
          </g>
        );
      })}
    </svg>
  );
});

/** Corner-tool anchor marker: selected / unselected / not-roundable. */
function CornerWidget({
  index,
  p,
  selected,
  roundable,
}: {
  index: number;
  p: Point;
  selected: boolean;
  roundable: boolean;
}) {
  if (!roundable) {
    // Not a corner the tool can act on — visible, but inert and click-through
    // so it never steals a press from a nearby roundable corner.
    return (
      <circle
        cx={p.x}
        cy={p.y}
        r={CR - 1.5}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1}
        opacity={0.35}
      />
    );
  }
  return (
    <>
      {selected && (
        <circle
          cx={p.x}
          cy={p.y}
          r={CR_HALO}
          fill="none"
          stroke="var(--snap, #ff36b0)"
          strokeWidth={1}
          opacity={0.55}
        />
      )}
      <circle
        data-pen-anchor={index}
        cx={p.x}
        cy={p.y}
        r={CR}
        fill={selected ? "var(--snap, #ff36b0)" : "#fff"}
        stroke="var(--snap, #ff36b0)"
        strokeWidth={1.5}
        pointerEvents="auto"
        style={{ cursor: "pointer" }}
      />
    </>
  );
}

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

/**
 * Corner-radius grip for a selected straight corner. The grip is placed at the
 * current radius along the corner bisector in the path's LOCAL space (so it
 * tracks the real setback at any zoom / node transform), then nudged out to a
 * minimum screen offset so it never collapses onto the anchor at radius 0.
 */
function RadiusHandle({
  a,
  p,
  at,
  path,
  toScreen,
  index,
}: {
  a: Anchor;
  p: Point;
  at: { sub: number; anchor: number };
  path: { subpaths: SubPath[] };
  toScreen: (pt: Point) => Point;
  index: number;
}) {
  const anchors = path.subpaths[at.sub].anchors;
  const n = anchors.length;
  const prev = anchors[(at.anchor - 1 + n) % n];
  const next = anchors[(at.anchor + 1) % n];
  if (!prev || !next) return null;

  // Bisector in LOCAL space, sampled at the current radius.
  const P = anchorPoint(a);
  const lA = unit({ x: prev.x - P.x, y: prev.y - P.y });
  const lB = unit({ x: next.x - P.x, y: next.y - P.y });
  const lBis = unit({ x: lA.x + lB.x, y: lA.y + lB.y });
  const r = a.cornerRadius ?? 0;
  const gp = toScreen({ x: P.x + lBis.x * r, y: P.y + lBis.y * r });

  let dir = unit({ x: gp.x - p.x, y: gp.y - p.y });
  if (dir.x === 0 && dir.y === 0) {
    // Radius 0 (or a degenerate transform): fall back to the screen bisector.
    const pp = toScreen(anchorPoint(prev));
    const pn = toScreen(anchorPoint(next));
    const uA = unit({ x: pp.x - p.x, y: pp.y - p.y });
    const uB = unit({ x: pn.x - p.x, y: pn.y - p.y });
    dir = unit({ x: uA.x + uB.x, y: uA.y + uB.y });
  }
  const dist = Math.max(MIN_GRIP_PX, Math.hypot(gp.x - p.x, gp.y - p.y));
  const hx = p.x + dir.x * dist;
  const hy = p.y + dir.y * dist;

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
