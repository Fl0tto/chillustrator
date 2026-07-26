/**
 * Build SVG `<filter>` markup for a node's non-destructive drop-shadow effects
 * (feature wave 3, item 5). Emits a markup string so the React renderer (via
 * dangerouslySetInnerHTML, as already used for unknown nodes) and the string
 * serializer share one implementation and stay pixel-identical.
 *
 * Pure — no DOM/React/model mutation.
 */
import type { ShadowEffect, SvgNode } from "@/model/types";

/** Deterministic filter id derived from the node id (stable across renders). */
export function filterId(nodeId: string): string {
  return `fx-${nodeId}`;
}

/** Enabled effects of a node, or []. */
export function activeEffects(node: SvgNode): ShadowEffect[] {
  return (node.effects ?? []).filter((e) => e.enabled);
}

export function hasEffects(node: SvgNode): boolean {
  return activeEffects(node).length > 0;
}

function fmt(n: number): string {
  const v = Number(n.toFixed(4));
  return Object.is(v, -0) ? "0" : String(v);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Primitive chain for one outer shadow, yielding a named result. */
function outerChain(e: ShadowEffect, i: number): { markup: string; result: string } {
  const b = Math.max(0, e.blur);
  const spread = Math.max(0, e.spread ?? 0);
  const src = spread > 0 ? `spread${i}` : "SourceAlpha";
  const parts: string[] = [];
  if (spread > 0) {
    parts.push(`<feMorphology in="SourceAlpha" operator="dilate" radius="${fmt(spread)}" result="spread${i}"/>`);
  }
  parts.push(`<feGaussianBlur in="${src}" stdDeviation="${fmt(b)}" result="blur${i}"/>`);
  parts.push(`<feOffset in="blur${i}" dx="${fmt(e.dx)}" dy="${fmt(e.dy)}" result="off${i}"/>`);
  parts.push(`<feFlood flood-color="${esc(e.color)}" flood-opacity="${fmt(e.opacity)}" result="color${i}"/>`);
  parts.push(`<feComposite in="color${i}" in2="off${i}" operator="in" result="outer${i}"/>`);
  return { markup: parts.join(""), result: `outer${i}` };
}

/** Primitive chain for one inner shadow, yielding a named result. */
function innerChain(e: ShadowEffect, i: number): { markup: string; result: string } {
  const b = Math.max(0, e.blur);
  const spread = Math.max(0, e.spread ?? 0);
  const parts: string[] = [];
  parts.push(`<feOffset in="SourceAlpha" dx="${fmt(e.dx)}" dy="${fmt(e.dy)}" result="ioff${i}"/>`);
  if (spread > 0) {
    parts.push(`<feMorphology in="ioff${i}" operator="erode" radius="${fmt(spread)}" result="ierode${i}"/>`);
  }
  const offRef = spread > 0 ? `ierode${i}` : `ioff${i}`;
  // Region inside the shape but outside the offset alpha = the inner shadow band.
  parts.push(`<feComposite in="SourceAlpha" in2="${offRef}" operator="out" result="ihole${i}"/>`);
  parts.push(`<feGaussianBlur in="ihole${i}" stdDeviation="${fmt(b)}" result="iblur${i}"/>`);
  parts.push(`<feComposite in="iblur${i}" in2="SourceAlpha" operator="in" result="iclip${i}"/>`);
  parts.push(`<feFlood flood-color="${esc(e.color)}" flood-opacity="${fmt(e.opacity)}" result="icolor${i}"/>`);
  parts.push(`<feComposite in="icolor${i}" in2="iclip${i}" operator="in" result="inner${i}"/>`);
  return { markup: parts.join(""), result: `inner${i}` };
}

/**
 * Full `<filter>…</filter>` markup for a node, or null when it has no enabled
 * effects. Outer shadows render behind the source; inner shadows on top.
 */
export function buildFilterMarkup(node: SvgNode): string | null {
  const effects = activeEffects(node);
  if (effects.length === 0) return null;

  const chains: string[] = [];
  const below: string[] = []; // outer shadow results (painted behind source)
  const above: string[] = []; // inner shadow results (painted over source)

  effects.forEach((e, i) => {
    if (e.kind === "outer") {
      const c = outerChain(e, i);
      chains.push(c.markup);
      below.push(c.result);
    } else {
      const c = innerChain(e, i);
      chains.push(c.markup);
      above.push(c.result);
    }
  });

  const mergeNodes = [
    ...below.map((r) => `<feMergeNode in="${r}"/>`),
    `<feMergeNode in="SourceGraphic"/>`,
    ...above.map((r) => `<feMergeNode in="${r}"/>`),
  ].join("");

  // Generous region so outer shadows are not clipped.
  return (
    `<filter id="${filterId(node.id)}" x="-50%" y="-50%" width="200%" height="200%" ` +
    `filterUnits="objectBoundingBox" color-interpolation-filters="sRGB">` +
    chains.join("") +
    `<feMerge>${mergeNodes}</feMerge>` +
    `</filter>`
  );
}
