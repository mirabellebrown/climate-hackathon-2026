import { test, expect, type Page } from "@playwright/test";
import { calculateImpact } from "../../lib/impact";
import { MODELS } from "../../lib/config";
import { SESSION_KEY } from "../../lib/session";
import type { RouteResult, Tier } from "../../lib/types";

function fixture(tier: Tier): RouteResult {
  const generation = { inputTokens: 1000, outputTokens: 1000 };
  const classifier = { inputTokens: 200, outputTokens: 40 };
  return {
    answer: "Leaves change color when **chlorophyll breaks down**, revealing yellow and orange pigments.\n\n- Less daylight slows chlorophyll production.\n- Cooler weather helps autumn colors emerge.",
    routing: { tier, reason: tier === "heavy" ? "The complex architecture requires deeper analysis." : "A short explanation fits a smaller model.", model: MODELS[tier].id, modelName: MODELS[tier].name, classifierModel: "gemini-2.5-flash-lite", classifierFallback: false, baselineModel: MODELS.heavy.id },
    usage: { generation, classifier, total: { inputTokens: 1200, outputTokens: 1040 } },
    impact: calculateImpact(tier, generation, classifier), truncated: false,
  };
}

async function submit(page: Page, prompt = "Explain why leaves change color.") {
  await page.getByRole("textbox", { name: "Your prompt" }).fill(prompt);
  await page.getByRole("button", { name: "Find my model" }).click();
}

test("starts empty, routes an example, persists numeric totals, and resets", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/route", (route) => route.fulfill({ json: fixture("light") }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Find my model" })).toBeDisabled();
  await expect(page.getByText("0 completed requests")).toBeVisible();
  await page.getByRole("button", { name: "Explain something" }).click();
  await expect(page.getByRole("textbox", { name: "Your prompt" })).toHaveValue(/leaves/);
  await page.getByRole("button", { name: "Find my model" }).click();
  await expect(page.getByText("Claude Haiku 4.5", { exact: true })).toBeVisible();
  await expect(page.getByTestId("savings-percent")).toHaveText("74.4%");
  await expect(page.getByText("1 completed request", { exact: false })).toBeVisible();
  await expect(page.getByRole("cell", { name: "1,200 / 1,040", exact: true })).toBeVisible();
  await expect(page.locator(".answer-markdown strong")).toHaveText("chlorophyll breaks down");
  const stored = await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY);
  expect(stored).toContain('"requests":1');
  expect(stored).not.toContain("leaves");
  expect(stored).not.toContain("answer");
  await page.reload();
  await expect(page.getByText("1 completed request", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your answer will grow here." })).toBeVisible();
  await page.getByRole("button", { name: "Reset session totals" }).click();
  await expect(page.getByText("0 completed requests")).toBeVisible();
  expect(errors).toEqual([]);
});

test("shows extra cost for heavy routing without claiming savings", async ({ page }) => {
  await page.route("**/api/route", (route) => route.fulfill({ json: fixture("heavy") }));
  await page.goto("/");
  await submit(page, "Design a complex global architecture.");
  await expect(page.getByText("Claude Opus 5", { exact: true })).toBeVisible();
  await expect(page.getByText("more estimated impact than always using Opus")).toBeVisible();
  await expect(page.getByText("extra emissions", { exact: true })).toBeVisible();
  await expect(page.getByTestId("savings-percent")).toHaveText("0.6%");
});

test("displays failure, preserves prompt, and allows retry without counting failure", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/route", (route) => {
    attempts += 1;
    return attempts === 1
      ? route.fulfill({ status: 429, json: { error: { code: "RATE_LIMITED", stage: "classification", message: "Gemini is rate-limited. Try again later." } } })
      : route.fulfill({ json: fixture("medium") });
  });
  await page.goto("/");
  await submit(page);
  await expect(page.getByRole("alert").filter({ hasText: "Gemini is rate-limited" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Your prompt" })).toHaveValue("Explain why leaves change color.");
  await expect(page.getByText("0 completed requests")).toBeVisible();
  await page.getByRole("button", { name: "Find my model" }).click();
  await expect(page.getByText("Claude Sonnet 5", { exact: true })).toBeVisible();
  await expect(page.getByText("1 completed request", { exact: false })).toBeVisible();
});

test("locks submission while waiting and supports keyboard submission", async ({ page }) => {
  let release: () => void = () => {};
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  let requests = 0;
  await page.route("**/api/route", async (route) => { requests += 1; await waiting; await route.fulfill({ json: fixture("light") }); });
  await page.goto("/");
  await page.getByRole("textbox", { name: "Your prompt" }).fill("Hello!");
  await page.getByRole("textbox", { name: "Your prompt" }).press("Control+Enter");
  await expect(page.getByRole("button", { name: "Thinking…" })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Your prompt" })).toBeDisabled();
  await expect(page.getByText("A little thought goes into this.")).toBeVisible();
  release();
  await expect(page.getByText("Claude Haiku 4.5", { exact: true })).toBeVisible();
  expect(requests).toBe(1);
});

test("works on mobile, explains the assumptions, and does not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/route", (route) => route.fulfill({ json: fixture("medium") }));
  await page.goto("/");
  await submit(page);
  await expect(page.getByText("Claude Sonnet 5", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "The methodology" }).click();
  await expect(page.getByRole("heading", { name: "Tokens in. Estimates out." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/mobile-result.png", fullPage: true });
});

test("storage failures keep the answer usable and disclose non-persistence", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException("Storage blocked", "QuotaExceededError"); };
  });
  await page.route("**/api/route", (route) => route.fulfill({ json: fixture("light") }));
  await page.goto("/");
  await submit(page);
  await expect(page.getByText("Claude Haiku 4.5", { exact: true })).toBeVisible();
  await expect(page.getByText(/Browser storage is unavailable/)).toBeVisible();
  await expect(page.getByText("1 completed request", { exact: false })).toBeVisible();
});

test("renders markdown safely and makes truncation visible", async ({ page }) => {
  const result = fixture("light");
  result.answer = "Some code:\n\n```ts\nconst message = 'hello';\n```\n\n<script>alert('unsafe')</script>";
  result.truncated = true;
  await page.route("**/api/route", (route) => route.fulfill({ json: result }));
  await page.goto("/");
  await submit(page);
  await expect(page.locator(".answer-markdown pre")).toContainText("const message");
  await expect(page.locator(".answer-markdown script")).toHaveCount(0);
  await expect(page.getByText(/This answer reached the output limit/)).toBeVisible();
});

test("real HTTP endpoint validates input and reports absent server keys", async ({ request }) => {
  const missing = await request.post("/api/route", { data: { prompt: "Hello" } });
  expect(missing.status()).toBe(503);
  expect((await missing.json()).error.code).toBe("MISSING_API_KEYS");
  const invalid = await request.post("/api/route", { data: { prompt: " " } });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).error.code).toBe("INVALID_PROMPT");
});
