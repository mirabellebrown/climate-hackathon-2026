import { test, expect, type Page } from "@playwright/test";
import { calculateImpact, compareUsage } from "../../lib/impact";
import { MODELS, TEAM_BUDGET_USD } from "../../lib/config";
import { CONVERSATION_KEY } from "../../lib/conversation";
import { SESSION_KEY } from "../../lib/session";
import type { RouteResult, Tier } from "../../lib/types";

function fixture(tier: Tier): RouteResult {
  const generation = { inputTokens: 1000, outputTokens: 1000 };
  const classifier = { inputTokens: 200, outputTokens: 40 };
  return {
    answer: "Leaves change color when **chlorophyll breaks down**, revealing yellow and orange pigments.\n\n- Less daylight slows chlorophyll production.\n- Cooler weather helps autumn colors emerge.",
    routing: { tier, reason: tier === "heavy" ? "The complex architecture requires deeper analysis." : "A short explanation fits a smaller model.", model: MODELS[tier].id, modelName: MODELS[tier].name, classifierModel: MODELS.light.id, classifierFallback: false, baselineModel: MODELS.heavy.id },
    usage: compareUsage(generation, classifier),
    impact: calculateImpact(tier, generation, classifier), truncated: false,
  };
}

async function submit(page: Page, prompt = "Explain why leaves change color.") {
  await page.getByRole("textbox", { name: "Your prompt" }).fill(prompt);
  await page.getByRole("button", { name: "Send" }).click();
}

async function openDashboard(page: Page) {
  await page.getByRole("link", { name: "Impact", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByTestId("lifetime-hero")).toBeVisible();
}

test("starts empty, routes an example, persists numeric totals, and resets", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/route", (route) => route.fulfill({ json: fixture("light") }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "What’s on your mind?" })).toBeVisible();
  await expect(page.getByTestId("efficiency-strip")).toBeVisible();
  await expect(page.getByTestId("savings-gauge")).toBeVisible();
  await expect(page.getByTestId("savings-gauge")).toContainText("Savings");
  await expect(page.getByTestId("session-savings-emojis")).toBeVisible();
  await openDashboard(page);
  await expect(page.getByTestId("lifetime-hero")).toContainText("Team chats");
  await expect(page.getByTestId("lifetime-money")).toContainText("—");
  await expect(page.getByTestId("token-usage-overview")).toBeVisible();
  await expect(page.getByTestId("lifetime-stats")).toBeVisible();
  await expect(page.getByTestId("team-year-simulator")).toBeVisible();
  await expect(page.getByTestId("budget-tracking")).toBeVisible();
  await expect(page.getByTestId("budget-allocated")).toContainText(`$${TEAM_BUDGET_USD}`);
  await expect(page.getByTestId("top-use-cases")).toBeVisible();
  await expect(page.getByTestId("environmental-impact")).toBeVisible();
  await expect(page.getByTestId("cost-usage-chart")).toContainText("Send team prompts");
  // Chart sits under the page title; Money/CO₂/Water sit under the chart.
  const titleY = (await page.getByRole("heading", { name: "What your team has saved." }).boundingBox())!.y;
  const chartY = (await page.getByTestId("cost-usage-chart").boundingBox())!.y;
  const moneyY = (await page.getByTestId("lifetime-money").boundingBox())!.y;
  expect(titleY).toBeLessThan(chartY);
  expect(chartY).toBeLessThan(moneyY);
  await page.getByRole("link", { name: "Back to team chat" }).click();
  await expect(page).toHaveURL("/");
  await page.getByRole("button", { name: "Explain something" }).click();
  await expect(page.getByRole("textbox", { name: "Your prompt" })).toHaveValue(/leaves/);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".routing-result")).toContainText("Gemini Flash Lite");
  await expect(page.locator(".user-bubble")).toContainText("leaves");
  await expect(page.locator(".answer-markdown strong")).toHaveText("chlorophyll breaks down");
  await expect(page.getByTestId("efficiency-strip")).toContainText("Gemini Flash Lite");
  await expect(page.getByTestId("efficiency-strip")).toContainText("cheaper than Pro");
  await expect(page.getByTestId("efficiency-cost")).toHaveText("$0.00296");
  await expect(page.getByTestId("savings-gauge")).toBeVisible();
  await expect(page.getByTestId("savings-gauge-fill")).toHaveAttribute("data-fill", /^(100|[1-9]?\d)$/);
  await expect(page.getByTestId("savings-gauge-caption")).not.toContainText("vs Always Pro");
  await expect(page.getByTestId("savings-bottles")).toBeVisible();
  await expect(page.getByTestId("savings-trees")).toBeVisible();
  await page.getByRole("textbox", { name: "Your prompt" }).fill("Second turn, still independent.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".user-bubble")).toHaveCount(2);
  await page.getByRole("link", { name: "See impact" }).last().click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByTestId("lifetime-money")).not.toContainText("—");
  await expect(page.getByTestId("lifetime-co2")).not.toContainText("—");
  await expect(page.getByTestId("lifetime-water")).not.toContainText("—");
  await expect(page.getByTestId("team-spend-total")).toBeVisible();
  await expect(page.getByTestId("pro-spend-total")).toBeVisible();
  await expect(page.getByTestId("cost-savings-total")).toBeVisible();
  await expect(page.getByTestId("cost-savings-meta")).toContainText("saved vs Always Pro");
  await expect(page.getByTestId("token-usage-overview")).toContainText("Cost vs Always Pro");
  await expect(page.getByTestId("token-usage-overview")).toContainText("classifier and router");
  await expect(page.getByTestId("cost-usage-chart")).toBeVisible();
  await expect(page.getByTestId("cost-usage-summary")).toContainText("Always Pro");
  await expect(page.getByTestId("cost-usage-summary")).toContainText("Team");
  await expect(page.getByTestId("token-secondary-detail")).toContainText("Tokens (secondary)");
  await expect(page.getByTestId("token-secondary-detail")).toContainText("answer");
  await expect(page.getByTestId("budget-spent")).not.toHaveText("$0");
  await expect(page.getByTestId("budget-spent")).toContainText("$");
  await expect(page.getByTestId("use-case-quick")).toBeVisible();
  await expect(page.getByTestId("env-carbon")).toBeVisible();
  await expect(page.getByTestId("lifetime-hero")).toContainText("2 team requests");
  const stored = await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY);
  expect(stored).toContain('"requests":2');
  expect(stored).toContain("leaves");
  expect(stored).toContain(MODELS.light.id);
  expect(stored).not.toContain("chlorophyll");
  expect(stored).not.toContain("answer");
  const chatStored = await page.evaluate((key) => localStorage.getItem(key), CONVERSATION_KEY);
  expect(chatStored).toContain("chlorophyll");
  await page.goto("/");
  await expect(page.locator(".user-bubble")).toHaveCount(2);
  await expect(page.getByTestId("efficiency-strip")).toContainText("Gemini Flash Lite");
  await openDashboard(page);
  await expect(page.getByTestId("lifetime-hero")).toContainText("2 team requests");
  await page.getByRole("button", { name: "Reset session totals" }).click();
  await expect(page.getByTestId("lifetime-hero")).toContainText("Team chats");
  await expect(page.getByTestId("lifetime-money")).toContainText("—");
  await page.getByRole("link", { name: "Back to team chat" }).click();
  await expect(page.getByRole("heading", { name: "What’s on your mind?" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("shows extra cost for heavy routing without claiming savings", async ({ page }) => {
  await page.route("**/api/route", (route) => route.fulfill({ json: fixture("heavy") }));
  await page.goto("/");
  await submit(page, "Design a complex global architecture.");
  await expect(page.locator(".routing-result")).toContainText("Gemini Pro");
  await expect(page.getByTestId("efficiency-strip")).toContainText("more expensive than Pro");
  await page.getByRole("link", { name: "See impact" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByTestId("lifetime-money")).toContainText("extra API cost");
  await expect(page.getByTestId("use-case-systems")).toBeVisible();
  await expect(page.getByTestId("env-carbon")).toContainText("extra");
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
  await openDashboard(page);
  await expect(page.getByTestId("lifetime-hero")).toContainText("Team chats");
  await page.getByRole("link", { name: "Back to team chat" }).click();
  await expect(page.getByRole("textbox", { name: "Your prompt" })).toHaveValue("Explain why leaves change color.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".routing-result strong")).toHaveText("Gemini Flash");
  await openDashboard(page);
  await expect(page.getByTestId("lifetime-hero")).toContainText("1 team request");
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
  await expect(page.getByTestId("efficiency-strip")).toContainText("Choosing a lighter Gemini");
  release();
  await expect(page.locator(".routing-result")).toContainText("Gemini Flash Lite");
  expect(requests).toBe(1);
});

test("works on mobile, explains the assumptions, and does not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/route", (route) => route.fulfill({ json: fixture("medium") }));
  await page.goto("/");
  await submit(page);
  await expect(page.locator(".routing-result strong")).toHaveText("Gemini Flash");
  await openDashboard(page);
  await expect(page.getByTestId("token-usage-overview")).toBeVisible();
  await page.locator("#methodology summary").click();
  await expect(page.getByRole("heading", { name: "Tokens in. Cost and estimates out." })).toBeVisible();
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
  await expect(page.locator(".routing-result")).toContainText("Gemini Flash Lite");
  await openDashboard(page);
  await expect(page.getByText(/Browser storage is unavailable/)).toBeVisible();
  await expect(page.getByTestId("lifetime-hero")).toContainText("1 team request");
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
