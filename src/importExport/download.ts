/**
 * Browser download / clipboard helpers for exported SVG (EXP-001).
 *
 * DOM-dependent by nature; kept isolated so the rest of the pipeline stays
 * testable. No-ops safely under SSR / non-browser test environments.
 */

/** Trigger a file download of `text` as `filename` with the given MIME type. */
export function downloadText(text: string, filename: string, mime = "image/svg+xml"): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the click has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Copy text to the clipboard; resolves to true on success. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    if (typeof document === "undefined") return false;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Turn a document name into a safe .svg filename. */
export function svgFilename(name: string): string {
  const base = name.trim().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "logo";
  return base.toLowerCase().endsWith(".svg") ? base : `${base}.svg`;
}
