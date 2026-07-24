# chillustrator

An open-source, browser-based **SVG & logo editor** — create, edit, inspect, and
export clean SVG without a proprietary desktop app. This repository contains the
**Phase 0 prototype**: a coherent primitive editor with a clean architecture that
can grow into a serious vector-design application.

> Built with React 19 · TypeScript (strict) · Vite · Zustand · Immer · native
> inline SVG. See [`docs/architecture.md`](docs/architecture.md).

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run build      # type-check (tsc -b) + production build
npm run typecheck  # strict type-check only
npm run test       # unit/integration tests (Vitest)
npm run lint       # ESLint
npm run test:e2e   # Playwright (run `npx playwright install` first)
```

## What works (Phase 0)

- Shell: toolbar, tool rail, canvas, inspector, layers, status bar.
- Create rectangles, ellipses, lines, polygons, and point text.
- Select (click, shift-toggle, marquee), move, resize (8 handles), rotate.
- Solid fill, stroke color/width, opacity.
- Group / ungroup (nested), alignment, layer visibility/lock.
- Undo / redo — one entry per gesture; keyboard shortcuts.
- Autosave & safe SVG import/export _(landing via feature agents; see status)_.

Live progress: [`docs/implementation-status.md`](docs/implementation-status.md).

## Keyboard

| Key | Action |
|---|---|
| `V R E L P T` | Select / Rect / Ellipse / Line / Polygon / Text |
| `Ctrl/Cmd + Z` | Undo · `Ctrl/Cmd + Shift + Z` Redo |
| `Delete` / `Backspace` | Delete selection |
| Arrows | Nudge (Shift = ×10) |
| `Space` + drag / middle-drag | Pan · wheel = zoom |
| `Esc` | Cancel / back to Select |

## Architecture (short version)

The document is a **normalized, SVG-native model** — not a canvas bitmap or a
component tree. Every persistent edit is an atomic **command** captured as Immer
patches, so one drag = one undo entry. High-frequency pointer moves update the DOM
directly and commit a single command on release. Native SVG renders the artwork;
a separate overlay draws handles. `model/**` and `geometry/**` are
framework-independent.

## License

[MIT](LICENSE) (seed choice for the prototype; maintainers may revisit before
accepting external contributions).
```
