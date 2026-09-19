import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const exclusions = JSON.parse(readFileSync(new URL("../../lib/esg/exclusions.json", import.meta.url), "utf8")) as { exclusions: { id: string; title: string }[] };

// The sample dataset is always present when no records have been ingested, so these tests
// exercise the real API end to end (no mocks).

async function open(page: Page) {
  await page.goto("/reports/esg");
  await expect(page.getByRole("heading", { name: "AI Environmental Reporting" })).toBeVisible();
  await expect(page.getByText("Total AI emissions")).toBeVisible();
}

test("headline totals are never shown without the exclusions, tier and classification in view", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  await expect(page.getByText("Sample data.")).toBeVisible();
  const strip = page.getByLabel("What these figures do not include");
  for (const ex of exclusions.exclusions) await expect(strip).toContainText(ex.title);
  await expect(strip).toContainText("Scope 3 Category 1 (Purchased Goods and Services), location-based");
  await expect(strip).toContainText("Data tier: Average-data");
  // The strip is visible in the same first screen as the KPI tiles, without expanding anything.
  const box = await strip.boundingBox();
  expect(box!.y + box!.height).toBeLessThan(900 + 200);
  // The full boundary panel is rendered, not collapsed.
  for (const ex of exclusions.exclusions) await expect(page.locator("#boundaries").getByRole("heading", { name: ex.title })).toBeVisible();
  await expect(page.getByText("prompts average 8.")).toBeVisible();
});

test("every chart has a table view, a hover layer, legends where needed, and a single y-axis", async ({ page }) => {
  await open(page);
  const cards = page.locator("section.esg-card");
  const count = await cards.count();
  expect(count).toBeGreaterThanOrEqual(6);
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    await expect(card.getByRole("button", { name: "Show table" })).toBeVisible();
    // No dual axis: each plot draws at most one set of y tick labels (all on one side).
    const svgs = card.locator("svg[role=img]");
    for (let j = 0; j < await svgs.count(); j++) {
      const sides = await svgs.nth(j).evaluate((svg) => {
        const anchors = [...svg.querySelectorAll("text[text-anchor=end]")].map((t) => Math.round(Number(t.getAttribute("x"))));
        return new Set(anchors.filter((x) => x < 80)).size;
      });
      expect(sides).toBeLessThanOrEqual(1);
    }
  }
  // Multi-series charts carry a legend.
  const card = (id: string) => page.locator("section.esg-card", { has: page.locator(`#${id}`) });
  await expect(card("trend-title").locator(".esg-legend")).toContainText("Weighted average");
  // Hover layer: the trend crosshair tooltip lists every series.
  const plot = page.getByLabel(/Carbon intensity by provider over time\. Use left/);
  await plot.hover();
  await expect(page.locator(".esg-tooltip").first()).toContainText("Weighted average");
  // Keyboard reaches the same values.
  await plot.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".esg-tooltip").first()).toContainText("g/1k tok");
  // Table twin.
  const frontierCard = card("frontier-title");
  await frontierCard.getByRole("button", { name: "Show table" }).click();
  await expect(frontierCard.getByRole("columnheader", { name: "gCO2e per 1M output tokens" })).toBeVisible();
  await expect(frontierCard.getByText("Low confidence (may be off by 2x to 5x)")).toBeVisible();
});

test("explains ISO terms in plain language without leaving the page", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "What is Carbon intensity of the model (ISO 11.5.2)?" }).first().hover();
  await expect(page.getByRole("tooltip")).toContainText("each 1,000 words of output costs the planet");
  await page.mouse.move(0, 0);
  for (const term of ["ADPe", "PE", "WUE", "PUE", "WCF", "SCI"]) {
    await page.getByRole("button", { name: new RegExp(`^What is ${term}:`) }).focus();
    await expect(page.getByRole("tooltip").filter({ hasText: `${term}:` })).toBeVisible();
  }
});

test("filters rescope everything and the crosswalk names every target standard", async ({ page }) => {
  await open(page);
  await page.getByRole("combobox", { name: "Scope", exact: true }).selectOption("support");
  await expect(page.getByText(/prompts average/)).toHaveCount(0);
  await page.getByRole("combobox", { name: "Period", exact: true }).selectOption("FY2026");
  await expect(page.getByText("No baseline data").first()).toBeVisible();
  const crosswalk = page.locator("#crosswalk");
  for (const id of ["ESRS E1-6", "ESRS E3-3", "GRI 302-2", "GRI 305-3", "GRI 305-4", "GRI 303-3", "IFRS S2 para 29", "SASB TC-SI-110a.1", "SASB TC-SI-130a.1"]) await expect(crosswalk).toContainText(id);
  await crosswalk.getByRole("button", { name: "GRI" }).click();
  await expect(crosswalk.getByText("Boundary check:").first()).toBeVisible();
});

test("exports a disclosure pack", async ({ page }) => {
  await open(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Disclosure pack (CSV)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^ai-environmental-report-.*\.csv$/);
});

for (const [name, width] of [["narrow", 390], ["medium", 820], ["wide", 1440]] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test(`renders without horizontal overflow · ${name} · ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await page.screenshot({ path: `test-results/esg-${name}-${scheme}.png`, fullPage: true });
    });
  }
}
