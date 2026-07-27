/**
 * End-to-end vertical slice for the feature wave: smart snapping, fill alpha,
 * custom path creation, path editing, export, undo and redo.
 *
 * Uses the dev-only `window.__editorStore` hook to make canvas coordinates
 * deterministic (zoom 1 / pan 0 ⇒ root units == host pixels).
 */
import { test, expect, type Page } from "@playwright/test";

interface NodeLike {
  id: string;
  type: string;
  d?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  transform: { e: number; f: number };
  style: { fill: { opacity: number } };
}

declare global {
  interface Window {
    __editorStore: {
      getState: () => {
        tool: string;
        pathEdit: { nodeId: string; selected: number[] } | null;
        document: { nodes: Record<string, NodeLike> };
        newDocument: (w: number, h: number) => void;
        setViewport: (v: { zoom: number; panX: number; panY: number }) => void;
        clearSelection: () => void;
        setSelection: (ids: string[]) => void;
        setPreferences: (p: Record<string, unknown>) => void;
      };
    };
  }
}

async function resetViewport(page: Page) {
  await page.evaluate(() => {
    const s = window.__editorStore.getState();
    s.newDocument(800, 600);
    s.setViewport({ zoom: 1, panX: 0, panY: 0 });
    s.clearSelection();
    s.setPreferences({ snapAlignment: true });
  });
}

async function hostOrigin(page: Page) {
  const box = await page.locator(".chill-canvas-host").boundingBox();
  if (!box) throw new Error("canvas host not found");
  return box;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".chill-canvas-host");
  await resetViewport(page);
});

test("smart guides · fill alpha · pen create · path edit · export · undo/redo", async ({ page }) => {
  const host = await hostOrigin(page);
  const at = (x: number, y: number) => ({ x: host.x + x, y: host.y + y });

  // --- Snapping menu: toggling Alignment updates the button's enabled state ---
  const snapToggle = page.getByTestId("toggle-snapping");
  await expect(snapToggle).toHaveAttribute("aria-pressed", "true");
  await snapToggle.click(); // open popover
  const alignCheckbox = page.getByRole("checkbox", { name: "Alignment guides" });
  await alignCheckbox.uncheck();
  await expect(snapToggle).toHaveAttribute("aria-pressed", "false");
  await alignCheckbox.check();
  await expect(snapToggle).toHaveAttribute("aria-pressed", "true");
  await snapToggle.click(); // close popover

  // --- Custom path creation with the Pen tool --------------------------------
  await page.getByRole("button", { name: "Pen (P)" }).click();
  for (const [x, y] of [
    [150, 150],
    [350, 150],
    [350, 320],
  ] as const) {
    const p = at(x, y);
    await page.mouse.click(p.x, p.y);
  }
  await page.keyboard.press("Enter");

  const firstPath = await page.evaluate(() => {
    const p = Object.values(window.__editorStore.getState().document.nodes).find(
      (n: NodeLike) => n.type === "path",
    ) as NodeLike;
    return p ? { id: p.id as string, d: p.d as string } : null;
  });
  expect(firstPath).not.toBeNull();
  expect(firstPath!.d).toMatch(/^M/);
  // Finishing the Pen switches to the node editor.
  expect(await page.evaluate(() => window.__editorStore.getState().tool)).toBe("node");

  // --- Path editing: drag the first anchor -----------------------------------
  const anchor = page.locator('[data-pen-anchor="0"]');
  await expect(anchor).toBeVisible();
  const abox = await anchor.boundingBox();
  if (!abox) throw new Error("anchor not found");
  await page.mouse.move(abox.x + abox.width / 2, abox.y + abox.height / 2);
  await page.mouse.down();
  await page.mouse.move(abox.x + 40, abox.y + 30, { steps: 6 });
  await page.mouse.up();

  const editedD = await page.evaluate((id) => {
    return (window.__editorStore.getState().document.nodes[id] as NodeLike).d as string;
  }, firstPath!.id);
  expect(editedD).not.toBe(firstPath!.d);

  // --- Fill alpha (independent fill-opacity) ---------------------------------
  await page.getByRole("button", { name: "Select (V)" }).click();
  await page.evaluate((id) => window.__editorStore.getState().setSelection([id]), firstPath!.id);

  const fillAlpha = page.locator('.field-row:has(label:text-is("Fill α")) input[type="number"]');
  await fillAlpha.fill("30");
  await fillAlpha.blur();

  const fillOpacity = await page.evaluate((id) => {
    return (window.__editorStore.getState().document.nodes[id] as NodeLike).style.fill.opacity as number;
  }, firstPath!.id);
  expect(fillOpacity).toBeCloseTo(0.3, 2);

  // --- Export: source contains fill-opacity, no guide labels -----------------
  await page.getByRole("button", { name: "View SVG source" }).click();
  const source = await page.locator(".chill-source-text").inputValue();
  expect(source).toContain("<path");
  expect(source).toContain('fill-opacity="0.3"');
  expect(source).not.toContain("Center");
  await page.getByRole("button", { name: "Close" }).click();

  // --- Undo / redo -----------------------------------------------------------
  const opacityOf = () =>
    page.evaluate(
      (id) => (window.__editorStore.getState().document.nodes[id] as NodeLike).style.fill.opacity as number,
      firstPath!.id,
    );
  await page.getByRole("button", { name: "Undo (Ctrl+Z)" }).click();
  expect(await opacityOf()).toBeCloseTo(1, 2);
  await page.getByRole("button", { name: "Redo (Ctrl+Shift+Z)" }).click();
  expect(await opacityOf()).toBeCloseTo(0.3, 2);
});

test("corner tool rounds the corner you grab — including the first one", async ({ page }) => {
  const host = await hostOrigin(page);
  const at = (x: number, y: number) => ({ x: host.x + x, y: host.y + y });

  // A rectangle spanning (100,100)–(300,260) in root units.
  await page.getByRole("button", { name: "Rectangle (R)" }).click();
  await page.mouse.move(at(100, 100).x, at(100, 100).y);
  await page.mouse.down();
  await page.mouse.move(at(300, 260).x, at(300, 260).y, { steps: 8 });
  await page.mouse.up();

  await page.getByRole("button", { name: "Round corners (C)" }).click();

  const pathD = () =>
    page.evaluate(() => {
      const p = Object.values(window.__editorStore.getState().document.nodes).find(
        (n: NodeLike) => n.type === "path",
      ) as NodeLike | undefined;
      return p?.d ?? null;
    });

  // Drag the TOP-LEFT corner (anchor 0 — the case that used to skew) inward.
  await page.mouse.move(at(100, 100).x, at(100, 100).y);
  await page.mouse.down();
  await page.mouse.move(at(130, 130).x, at(130, 130).y, { steps: 8 });
  await page.mouse.up();

  const rounded = await pathD();
  expect(rounded).not.toBeNull();
  expect(rounded).toContain("C"); // a fillet was emitted
  expect(await page.evaluate(() => window.__editorStore.getState().tool)).toBe("corner");

  // Every emitted point stays inside the original rect: a skewed edge would
  // have pulled the top edge down off (100,100)→(300,100).
  const pts = [...rounded!.matchAll(/(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)/g)].map((m) => ({
    x: parseFloat(m[1]),
    y: parseFloat(m[2]),
  }));
  for (const p of pts) {
    expect(p.x).toBeGreaterThanOrEqual(99.9);
    expect(p.y).toBeGreaterThanOrEqual(99.9);
    expect(p.x).toBeLessThanOrEqual(300.1);
    expect(p.y).toBeLessThanOrEqual(260.1);
  }
  // The grabbed corner is gone; the other three are untouched.
  const has = (x: number, y: number) => pts.some((p) => Math.abs(p.x - x) < 0.5 && Math.abs(p.y - y) < 0.5);
  expect(has(100, 100)).toBe(false);
  expect(has(300, 100)).toBe(true);
  expect(has(300, 260)).toBe(true);
  expect(has(100, 260)).toBe(true);

  // Only that corner is selected, and the overlay marks it as such.
  const selected = await page.evaluate(() => window.__editorStore.getState().pathEdit?.selected ?? []);
  expect(selected).toEqual([0]);
  await expect(page.locator("[data-pen-radius]")).toHaveCount(1);
  await expect(page.locator('[data-pen-radius="0"]')).toBeVisible();

  // Now the SECOND corner: grabbing it moves the selection and rounds it too.
  await page.mouse.move(at(300, 100).x, at(300, 100).y);
  await page.mouse.down();
  await page.mouse.move(at(275, 125).x, at(275, 125).y, { steps: 8 });
  await page.mouse.up();

  const twice = await pathD();
  expect((twice!.match(/C/g) ?? []).length).toBe(2);
  expect(await page.evaluate(() => window.__editorStore.getState().pathEdit?.selected ?? [])).toEqual([1]);
  await expect(page.locator('[data-pen-radius="1"]')).toBeVisible();
});

test("moving a shape snaps its center to the artboard center", async ({ page }) => {
  const host = await hostOrigin(page);
  const at = (x: number, y: number) => ({ x: host.x + x, y: host.y + y });

  // Create a rectangle via the tool (center starts at 160,160).
  await page.getByRole("button", { name: "Rectangle (R)" }).click();
  const c0 = at(100, 100);
  const c1 = at(220, 220);
  await page.mouse.move(c0.x, c0.y);
  await page.mouse.down();
  await page.mouse.move(c1.x, c1.y, { steps: 8 });
  await page.mouse.up();

  const id = await page.evaluate(() => {
    const rect = Object.values(window.__editorStore.getState().document.nodes).find(
      (n: NodeLike) => n.type === "rect",
    ) as NodeLike;
    window.__editorStore.getState().setSelection([rect.id]);
    return rect.id as string;
  });

  // Drag the rect so its center lands just shy of the artboard centre (400,300).
  const start = at(160, 160);
  const end = at(398, 301); // 2px/1px off centre — inside the snap threshold
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();

  const center = await page.evaluate((nodeId) => {
    const n = window.__editorStore.getState().document.nodes[nodeId] as NodeLike;
    return { x: n.x + n.transform.e + n.width / 2, y: n.y + n.transform.f + n.height / 2 };
  }, id);
  expect(Math.abs(center.x - 400)).toBeLessThanOrEqual(1.5);
  expect(Math.abs(center.y - 300)).toBeLessThanOrEqual(1.5);
});
