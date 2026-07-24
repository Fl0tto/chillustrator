# ADR 0003 — Native SVG renderer with separate overlay

**Status:** Accepted (Phase 0)

## Decision

Editable artwork renders as native inline SVG (spec §4.7): direct correspondence
to export, native hit-testing, native text/gradients/clipping, accessible DOM.

- Artwork `<svg>` (`ArtworkSvg`) holds only artwork inside one pan/zoom `<g>`; it
  is the hit-testing and export surface and contains no editor chrome.
- A second overlay `<svg>` (`EditorOverlay`) draws selection box, resize/rotate
  handles, and marquee in screen-pixel space so they stay constant-size under
  zoom, and re-renders independently of the artwork (PERF-005).
- Per-node component (`SvgNodeRenderer`) is `memo`-ised and subscribes to just its
  own node; Immer structural sharing means unrelated edits don't re-render it
  (PERF-004).
- Pixel-accurate bounds (curved paths, text) come from the live DOM via
  `getBBox`/CTM (`geometry/domMeasure.ts`), used for measurement only.

## Consequences

Canvas/WebGL may later back thumbnails, minimaps, or heavy filters (spec §4.8) but
will not replace the SVG-native document/export model in Phase 0.
```
