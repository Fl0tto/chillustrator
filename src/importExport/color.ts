/**
 * Color / paint value parsing for SVG import.
 *
 * Framework-independent. Converts CSS color strings and url(#id) references
 * into the model's PaintReference shape. Kept intentionally small and
 * dependency-free — a full CSS color engine can replace this later.
 */
import type { PaintReference } from "@/model/types";

const NAMED_TRANSPARENT = new Set(["none", "transparent"]);

/** Result of parsing a paint value: a PaintReference, or null for "none". */
export interface ParsedPaint {
  paint: PaintReference | null;
  /** Alpha extracted from rgba()/#rrggbbaa, 1 when opaque. */
  alpha: number;
  /** Old gradient/def id if this was a url(#id) reference (pre-remap). */
  refId?: string;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

function toHexByte(n: number): string {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return v.toString(16).padStart(2, "0");
}

/** Extract the id from a url(#id) reference, or null. */
export function parseUrlRef(value: string): string | null {
  const m = /^url\(\s*['"]?\s*#([^)'"\s]+)\s*['"]?\s*\)/i.exec(value.trim());
  return m ? m[1] : null;
}

/**
 * Normalize a CSS color into a `#rrggbb` hex string plus alpha when possible.
 * Falls back to returning the original token (named colors, hsl(), etc.) so it
 * still round-trips through the SVG DOM.
 */
export function normalizeColor(input: string): { color: string; alpha: number } {
  const value = input.trim();
  // #rgb / #rgba / #rrggbb / #rrggbbaa
  const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (hex) {
    const h = hex[1];
    if (h.length === 3) {
      return { color: `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`, alpha: 1 };
    }
    if (h.length === 4) {
      const a = parseInt(h[3] + h[3], 16) / 255;
      return { color: `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`, alpha: clamp01(a) };
    }
    if (h.length === 6) return { color: `#${h.toLowerCase()}`, alpha: 1 };
    if (h.length === 8) {
      const a = parseInt(h.slice(6, 8), 16) / 255;
      return { color: `#${h.slice(0, 6).toLowerCase()}`, alpha: clamp01(a) };
    }
  }
  // rgb()/rgba()
  const rgb = /^rgba?\(\s*([^)]+)\)$/i.exec(value);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length >= 3) {
      const channel = (tok: string) =>
        tok.endsWith("%") ? (parseFloat(tok) / 100) * 255 : parseFloat(tok);
      const r = channel(parts[0]);
      const g = channel(parts[1]);
      const b = channel(parts[2]);
      let a = 1;
      if (parts.length >= 4) {
        a = parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
      }
      return { color: `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`, alpha: clamp01(a) };
    }
  }
  // Named colors, hsl(), currentColor, etc. — keep verbatim.
  return { color: value, alpha: 1 };
}

/**
 * Parse a paint value ("none", "#fff", "rgb(..)", "url(#id)") into a
 * PaintReference. `refId` is set (pre-remap) for url() references so the caller
 * can map it onto a freshly-minted PaintId.
 */
export function parsePaint(rawValue: string): ParsedPaint {
  const value = rawValue.trim();
  if (!value || NAMED_TRANSPARENT.has(value.toLowerCase())) {
    return { paint: null, alpha: value.toLowerCase() === "transparent" ? 0 : 1 };
  }
  const refId = parseUrlRef(value);
  if (refId) {
    return { paint: { kind: "definition", value: refId, opacity: 1 }, alpha: 1, refId };
  }
  const { color, alpha } = normalizeColor(value);
  return { paint: { kind: "solid", value: color, opacity: alpha }, alpha };
}

/** Serialize a PaintReference back to an SVG paint string. */
export function paintToSvgValue(paint: PaintReference | null): string {
  if (!paint) return "none";
  if (paint.kind === "solid") return paint.value;
  return `url(#${paint.value})`;
}
