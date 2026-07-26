/**
 * Inline text editor. When `editingTextId` is set, renders an HTML <input>
 * positioned over the text node (in the node's own local space via a CSS matrix,
 * so rotation/scale/zoom all match) for in-place editing.
 *
 * Edits update the model live (coalesced → one undo entry per session). Enter or
 * blur commits and exits; Escape reverts to the text as it was when editing began.
 * The SVG glyphs are hidden while editing (see SvgNodeRenderer) so nothing doubles.
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import { useEditorStore } from "@/store/editorStore";
import { useViewport } from "@/store/selectors";
import { worldMatrix } from "@/geometry/nodeGeometry";
import { multiply } from "@/geometry/matrix";
import type { Matrix2D } from "@/model/types";
import { updateNodeGeometryCommand } from "@/commands/transformCommands";

export function TextEditOverlay() {
  const editingId = useEditorStore((s) => s.editingTextId);
  const node = useEditorStore((s) => (editingId ? s.document.nodes[editingId] : null));
  const viewport = useViewport();
  const inputRef = useRef<HTMLInputElement>(null);
  const originalText = useRef<string>("");
  const coalesceKey = useRef<string>("");

  const isText = node?.type === "text";

  useEffect(() => {
    if (isText && node) {
      originalText.current = node.text;
      coalesceKey.current = `edit-text:${node.id}:${Date.now()}`;
    }
    // Only reset the baseline when the edited node changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  useLayoutEffect(() => {
    if (isText && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isText]);

  if (!node || node.type !== "text" || !editingId) return null;

  // local → screen affine = viewport(pan/zoom) ∘ node-world.
  const vp: Matrix2D = { a: viewport.zoom, b: 0, c: 0, d: viewport.zoom, e: viewport.panX, f: viewport.panY };
  const m = multiply(vp, worldMatrix(useEditorStore.getState().document, editingId));
  const matrixCss = `matrix(${m.a}, ${m.b}, ${m.c}, ${m.d}, ${m.e}, ${m.f})`;

  const store = useEditorStore.getState();
  const commit = () => store.setEditingText(null);
  const cancel = () => {
    store.apply(updateNodeGeometryCommand(editingId, { text: originalText.current }, "Edit text"));
    store.setEditingText(null);
  };

  const textAlign = node.textAnchor === "middle" ? "center" : node.textAnchor === "end" ? "right" : "left";
  const translateX = node.textAnchor === "middle" ? "-50%" : node.textAnchor === "end" ? "-100%" : "0";

  return (
    <div
      style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: matrixCss, pointerEvents: "none" }}
    >
      <input
        ref={inputRef}
        value={node.text}
        onChange={(e) =>
          store.applyCoalesced(
            updateNodeGeometryCommand(editingId, { text: e.target.value }, "Edit text"),
            coalesceKey.current,
          )
        }
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        onBlur={commit}
        spellCheck={false}
        style={{
          position: "absolute",
          // Baseline sits ~0.8em below the input top; nudge up so glyphs overlap.
          left: node.x,
          top: node.y - node.fontSize * 0.8,
          transform: `translateX(${translateX})`,
          transformOrigin: "0 0",
          margin: 0,
          padding: 0,
          border: "none",
          outline: "1px solid var(--accent, #4c8bf5)",
          background: "rgba(255,255,255,0.85)",
          color: "#111",
          fontFamily: node.fontFamily,
          fontSize: node.fontSize,
          fontWeight: node.fontWeight as number,
          fontStyle: node.fontStyle,
          letterSpacing: node.letterSpacing || undefined,
          lineHeight: 1.1,
          textAlign,
          whiteSpace: "pre",
          pointerEvents: "auto",
          minWidth: node.fontSize,
          width: `${Math.max(node.text.length + 1, 3)}ch`,
        }}
      />
    </div>
  );
}
