import { test, expect, type Page } from "@playwright/test";
import { calculateObservedImpact } from "../../lib/impact";
import { MODELS } from "../../lib/config";
import { SESSION_KEY } from "../../lib/session";
import type { Activity, DashboardState, ModelUsage, Tier } from "../../lib/types";

let counter = 0;
function activity(tier: Tier, status: Activity["status"] = "completed", models?: ModelUsage[]): Activity {
  const id = `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;
  const createdAt = new Date().toISOString();
  const routing = { tier, reason: tier === "heavy" ? "The complex architecture requires deeper analysis." : "A short explanation fits a smaller model.", model: MODELS[tier].id, modelName: MODELS[tier].name, classifierModel: "gemini-2.5-flash-lite", classifierFallback: false, baselineModel: MODELS.heavy.id };
  if (status !== "completed") return { id, createdAt, routing, status, ...(status === "failed" ? { error: "The run was cancelled in the terminal. No usage is included in savings." } : {}) };
  const used = models ?? [{ model: MODELS[tier].id, inputTokens: 1000, outputTokens: 1000, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 }];
  const classifier = { inputTokens: 200, outputTokens: 40 };
  const generation = { inputTokens: 1000, outputTokens: 1000 };
  return { id, createdAt, routing, status, result: {
    id, createdAt, completedAt: createdAt, routing, durationMs: 4200,
    usage: { classifier, generation, total: { inputTokens: 1200, outputTokens: 1040 }, models: used },
    impact: calculateObservedImpact(used, classifier),
    modelMismatch: used.some((model) => model.model !== MODELS[tier].id),
  } };
}

async function serve(page: Page, state: () => DashboardState) {
  await page.route("**/api/session", (route) => route.fulfill({ json: state() }));
}

test("shows setup, counts each completed run once across polls, and resets", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const activities: Activity[] = [];
  await serve(page, () => ({ configured: true, activities: [...activities] }));
  await page.goto("/");
  await expect(page.getByText("Dashboard connected")).toBeVisible();
  await expect(page.getByText("Gemini classifier ready")).toBeVisible();
  await expect(page.getByText(/npm run ask --/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your runs will grow here." })).toBeVisible();
  await expect(page.getByText("0 completed runs")).toBeVisible();

  activities.unshift(activity("light"));
  await expect(page.getByTestId("savings-percent")).toHaveText("74.4%");
  await expect(page.getByRole("button", { name: /Claude Haiku 4.5/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: "1,200 / 1,040", exact: true })).toBeVisible();
  await expect(page.getByText("1 completed run", { exact: false })).toBeVisible();
  await page.waitForTimeout(4_500); // Several more polls return the same run.
  await expect(page.getByText("1 completed run", { exact: false })).toBeVisible();

  const stored = await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY);
  expect(stored).toContain('"requests":1');
  expect(stored).not.toContain("leaves");
  await page.reload();
  await expect(page.getByText("1 completed run", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Reset session totals" }).click();
  await expect(page.getByText("0 completed runs")).toBeVisible();
  await page.waitForTimeout(2_500);
  await expect(page.getByText("0 completed runs")).toBeVisible();
  activities.unshift(activity("medium"));
  await expect(page.getByText("1 completed run", { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});

test("shows extra cost for heavy routing without claiming savings", async ({ page }) => {
  await serve(page, () => ({ configured: true, activities: [activity("heavy")] }));
  await page.goto("/");
  await expect(page.getByText("more estimated impact than always using Opus")).toBeVisible();
  await expect(page.getByText("extra emissions", { exact: true })).toBeVisible();
  await expect(page.getByTestId("savings-percent")).toHaveText("0.6%");
});

test("shows running and failed runs without counting them", async ({ page }) => {
  const running = activity("medium", "routed");
  const failed = activity("light", "failed");
  await serve(page, () => ({ configured: true, activities: [running, failed] }));
  await page.goto("/");
  await expect(page.getByText("Running", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Not completed/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "cancelled in the terminal" })).toBeVisible();
  await expect(page.getByText("0 completed runs")).toBeVisible();
});

test("discloses when Claude Code used models other than the selection", async ({ page }) => {
  const models = [
    { model: "claude-haiku-4-5", inputTokens: 500, outputTokens: 800, cacheReadInputTokens: 20_000, cacheCreationInputTokens: 3_000 },
    { model: "claude-sonnet-5", inputTokens: 500, outputTokens: 200, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
  ];
  await serve(page, () => ({ configured: true, activities: [activity("light", "completed", models)] }));
  await page.goto("/");
  await expect(page.getByText(/Claude Code reported claude-haiku-4-5, claude-sonnet-5/)).toBeVisible();
  await expect(page.getByRole("cell", { name: "20,000" })).toBeVisible();
});

test("tells the user when the server or classifier is not ready", async ({ page }) => {
  await serve(page, () => ({ configured: false, activities: [] }));
  await page.goto("/");
  await expect(page.getByText(/Add GEMINI_API_KEY/)).toBeVisible();
  await page.unroute("**/api/session");
  await page.route("**/api/session", (route) => route.abort());
  await expect(page.getByText("Can’t reach the local server")).toBeVisible();
});

test("works on mobile, explains the assumptions, and does not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await serve(page, () => ({ configured: true, activities: [activity("medium")] }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Claude Sonnet 5/ })).toBeVisible();
  await page.getByRole("button", { name: "The methodology" }).click();
  await expect(page.getByRole("heading", { name: "Tokens in. Estimates out." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/mobile-dashboard.png", fullPage: true });
});

test("storage failures keep the dashboard usable and disclose non-persistence", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException("Storage blocked", "QuotaExceededError"); };
  });
  await serve(page, () => ({ configured: true, activities: [activity("light")] }));
  await page.goto("/");
  await expect(page.getByText(/Browser storage is unavailable/)).toBeVisible();
  await expect(page.getByText("1 completed run", { exact: false })).toBeVisible();
});

test("real HTTP endpoints validate input, need only Gemini, and stay local", async ({ request }) => {
  const missing = await request.post("/api/route", { data: { prompt: "Hello" } });
  expect(missing.status()).toBe(503);
  expect((await missing.json()).error.message).toContain("GEMINI_API_KEY");
  const invalid = await request.post("/api/route", { data: { prompt: " " } });
  expect((await invalid.json()).error.code).toBe("INVALID_PROMPT");
  const crossOrigin = await request.post("/api/route", { data: { prompt: "Hello" }, headers: { Origin: "http://evil.example" } });
  expect(crossOrigin.status()).toBe(403);
  const session = await request.get("/api/session");
  expect(await session.json()).toEqual({ configured: false, activities: [] });
  expect((await request.post("/api/usage", { data: { id: "00000000-0000-0000-0000-000000000000", status: "failed" } })).status()).toBe(404);
});
