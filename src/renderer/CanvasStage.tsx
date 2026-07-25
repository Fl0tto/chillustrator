/**
 * CanvasStage — the interactive canvas host.
 *
 * Composes the artwork <svg> (hit-testing + export surface) with the editor
 * overlay <svg> and attaches the interaction controller. The host div owns the
 * pointer/wheel surface; the two SVGs stack absolutely within it.
 */
import { useEffect, useRef } from "react";
import { ArtworkSvg } from "./ArtworkSvg";
import { EditorOverlay } from "./EditorOverlay";
import { ShapeBuilderOverlay } from "./ShapeBuilderOverlay";
import { GuidesOverlay } from "./GuidesOverlay";
import { PenOverlay } from "./PenOverlay";
import { PathEditOverlay } from "./PathEditOverlay";
import { useCanvasController } from "@/interactions/useCanvasController";
import { useHoverController } from "@/interactions/useHoverController";
import { useShapeBuilder } from "@/interactions/useShapeBuilder";
import { usePenTool } from "@/interactions/usePenTool";
import { usePathEditor } from "@/interactions/usePathEditor";
import { useEditorStore } from "@/store/editorStore";
import { fitToRect } from "@/geometry/viewport";

export function CanvasStage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useCanvasController(hostRef, svgRef);
  useHoverController(hostRef);
  useShapeBuilder(hostRef);
  usePenTool(hostRef);
  usePathEditor(hostRef, svgRef);

  // Fit the artboard into view once on mount.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const { width, height } = useEditorStore.getState().document;
    useEditorStore.getState().setViewport(fitToRect({ x: 0, y: 0, width, height }, rect.width, rect.height));
  }, []);

  return (
    <div ref={hostRef} className="chill-canvas-host" data-canvas-host="true">
      <ArtworkSvg ref={svgRef} />
      <EditorOverlay />
      <GuidesOverlay />
      <PenOverlay />
      <PathEditOverlay />
      <ShapeBuilderOverlay />
    </div>
  );
}
