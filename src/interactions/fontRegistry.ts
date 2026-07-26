/**
 * Font registry (feature wave 3, item 3).
 *
 * - A curated list of open Google Fonts, loaded on demand from the Google Fonts
 *   CDN (runtime `<link>` injection).
 * - Session-only custom-font import via the FontFace API (paid/local fonts).
 *
 * Not persisted: imported fonts live for the session only. A tiny subscribe API
 * lets the inspector re-render when the available-family list changes.
 */

/** Curated open Google families offered in the dropdown. */
export const CURATED_FONTS: string[] = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Raleway",
  "Nunito",
  "Work Sans",
  "Source Sans 3",
  "Merriweather",
  "Playfair Display",
  "Lora",
  "PT Serif",
  "Roboto Slab",
  "Oswald",
  "Bebas Neue",
  "Anton",
  "Archivo",
  "Barlow",
  "Rubik",
  "Josefin Sans",
  "Dancing Script",
  "Pacifico",
  "Lobster",
  "Caveat",
  "Comfortaa",
  "Righteous",
  "Abril Fatface",
  "Fira Sans",
  "Space Grotesk",
  "DM Sans",
  "Quicksand",
  "Cormorant Garamond",
  "Titillium Web",
];

const loadedGoogle = new Set<string>();
const importedFamilies: string[] = [];
const listeners = new Set<() => void>();

// Cached snapshot so useSyncExternalStore sees a stable reference between changes.
let familiesCache: string[] = [...new Set(CURATED_FONTS)];

function recompute(): void {
  familiesCache = [...new Set([...importedFamilies, ...CURATED_FONTS])];
}

function notify(): void {
  recompute();
  for (const fn of listeners) fn();
}

/** Subscribe to available-family changes (e.g. after a custom import). */
export function subscribeFonts(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** All families offered in the dropdown (curated + imported), de-duplicated. */
export function availableFamilies(): string[] {
  return familiesCache;
}

/** True when `family` was imported this session (won't render outside it). */
export function isImportedFamily(family: string): boolean {
  return importedFamilies.includes(family);
}

/** Idempotently load a curated Google family via a stylesheet link. */
export function loadGoogleFont(family: string): void {
  if (typeof document === "undefined") return;
  if (loadedGoogle.has(family) || importedFamilies.includes(family)) return;
  loadedGoogle.add(family);
  const enc = family.trim().replace(/\s+/g, "+");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${enc}:ital,wght@0,300;0,400;0,500;0,700;1,400&display=swap`;
  link.setAttribute("data-chill-font", family);
  document.head.appendChild(link);
}

/**
 * Import a custom font file for this session. Returns the registered family name
 * (derived from the file name). The face is added to `document.fonts` so text
 * using this family renders immediately.
 */
export async function importCustomFont(file: File): Promise<string> {
  const family = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Custom font";
  const buffer = await file.arrayBuffer();
  const face = new FontFace(family, buffer);
  await face.load();
  // `document.fonts` is a FontFaceSet; add() is available in all target browsers.
  (document.fonts as unknown as { add: (f: FontFace) => void }).add(face);
  if (!importedFamilies.includes(family)) {
    importedFamilies.unshift(family);
    notify();
  }
  return family;
}
