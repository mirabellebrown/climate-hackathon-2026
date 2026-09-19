import { test, expect, type Page } from "@playwright/test";
import { calculateObservedImpact } from "../../lib/impact";
import { MODELS } from "../../lib/config";
import { SESSION_KEY } from "../../lib/session";
import type { ChatReply, DashboardState, RouteResult, Tier } from "../../lib/types";

const SESSION = "11111111-2222-3333-4444-555555555555";
let counter = 0;
function result(tier: Tier): RouteResult {
  const id = `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;
  const createdAt = new Date().toISOString();
  const routing = { tier, reason: tier === "heavy" ? "The complex architecture requires deeper analysis." : "A short explanation fits a smaller model.", model: MODELS[tier].id, modelName: MODELS[tier].name, classifierModel: "gemini-3.1-flash-lite", classifierFallback: false, baselineModel: MODELS.heavy.id };
  const models = [{ model: MODELS[tier].id, inputTokens: 1000, outputTokens: 1000, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 }];
  const classifier = { inputTokens: 200, outputTokens: 40 };
  return { id, createdAt, completedAt: createdAt, routing, durationMs: 4200, modelMismatch: false,
    usage: { classifier, generation: { inputTokens: 1000, outputTokens: 1000 }, total: { inputTokens: 1200, outputTokens: 1040 }, models },
    impact: calculateObservedImpact(models, classifier) };
}
const ANSWER = "Leaves change color when **chlorophyll breaks down**.\n\n- Less daylight slows chlorophyll production.\n- Cooler weather helps autumn colors emerge.";
function reply(tier: Tier, answer = ANSWER): ChatReply { return { answer, sessionId: SESSION, result: result(tier) }; }

// The session endpoint echoes chat results, like the real server, to prove totals are deduplicated.
async function mock(page: Page, respond: (body: { prompt: string; sessionId?: string }) => ChatReply | { status: number; json: unknown } | Promise<ChatReply>) {
  const seen: RouteResult[] = [];
  const bodies: { prompt: string; sessionId?: string }[] = [];
  await page.route("**/api/session", (route) => route.fulfill({ json: { configured: true, activities: seen.map((r) => ({ id: r.id, createdAt: r.createdAt, routing: r.routing, status: "completed", result: r })) } satisfies DashboardState }));
  await page.route("**/api/chat", async (route) => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    const out = await respond(body);
    if ("status" in out) return route.fulfill({ status: out.status, json: out.json });
    seen.push(out.result);
    return route.fulfill({ json: out });
  });
  return bodies;
}

const model = (page: Page) => page.locator(".message-assistant .routing-result strong").last();
const saving = (page: Page) => page.getByTestId("efficiency-savings");
const sessionLine = (page: Page) => page.getByTestId("session-line");

async function send(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Your message" }).fill(text);
  await page.getByRole("textbox", { name: "Your message" }).press("Enter");
}

test("chats, continues the conversation, shows impact, and counts each run once", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const bodies = await mock(page, (body) => reply(body.sessionId ? "medium" : "light"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What’s on your mind?" })).toBeVisible();
  await expect(sessionLine(page)).toHaveText("Your savings add up here as you chat");
  await page.getByRole("button", { name: "Explain something" }).click();
  await expect(page.getByRole("textbox", { name: "Your message" })).toHaveValue(/leaves/);
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.locator(".user-bubble")).toContainText("leaves change color");
  await expect(page.locator(".answer-markdown strong")).toHaveText("chlorophyll breaks down");
  await expect(model(page)).toHaveText("Claude Haiku 4.5");
  await expect(saving(page)).toHaveText("74.4% less energy than Opus");
  await expect(sessionLine(page)).toContainText("1 answer ·");
  expect(bodies[0]).not.toHaveProperty("sessionId");

  await send(page, "And in code?");
  await expect(model(page)).toHaveText("Claude Sonnet 5");
  expect(bodies[1]).toEqual({ prompt: "And in code?", sessionId: SESSION });
  await expect(saving(page)).toHaveText("49.4% less energy than Opus");
  await page.waitForTimeout(5_500); // A poll returns both runs again.
  await expect(sessionLine(page)).toContainText("2 answers ·");

  // Each reply keeps its own impact line.
  await expect(page.locator(".turn-impact").first()).toContainText("74.4% less energy than Opus");

  const stored = await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY);
  expect(stored).not.toContain("leaves");
  expect(stored).not.toContain("chlorophyll");

  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(page.getByRole("heading", { name: "What’s on your mind?" })).toBeVisible();
  await send(page, "Fresh start");
  await expect(page.locator(".user-bubble")).toHaveText("Fresh start");
  expect(bodies[2]).not.toHaveProperty("sessionId");
  expect(errors).toEqual([]);
});

test("shows extra cost for heavy routing without claiming savings", async ({ page }) => {
  await mock(page, () => reply("heavy"));
  await page.goto("/");
  await send(page, "Design a complex global architecture.");
  await expect(model(page)).toHaveText("Claude Opus 5");
  await expect(saving(page)).toHaveText("0.6% more energy than Opus");
  await expect(page.locator(".turn-impact")).toContainText("more energy than Opus");
});

test("shows a failure, allows retry, and does not count the failure", async ({ page }) => {
  let attempts = 0;
  await mock(page, () => ++attempts === 1
    ? { status: 502, json: { error: { code: "CLAUDE_CODE_ERROR", stage: "generation", message: "Claude Code isn't signed in. Run `claude` in a terminal and use /login, then try again." } } }
    : reply("light"));
  await page.goto("/");
  await send(page, "Explain why leaves change color.");
  await expect(page.getByRole("alert").filter({ hasText: "isn't signed in" })).toBeVisible();
  await expect(sessionLine(page)).toHaveText("Your savings add up here as you chat");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(model(page)).toHaveText("Claude Haiku 4.5");
  await expect(page.locator(".user-bubble")).toHaveCount(1);
  await expect(sessionLine(page)).toContainText("1 answer ·");
});

test("locks input while waiting and supports Shift+Enter for new lines", async ({ page }) => {
  let release: () => void = () => {};
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  let requests = 0;
  await mock(page, async () => { requests += 1; await waiting; return reply("light"); });
  await page.goto("/");
  const box = page.getByRole("textbox", { name: "Your message" });
  await box.fill("Line one");
  await box.press("Shift+Enter");
  await box.pressSequentially("Line two");
  await expect(box).toHaveValue("Line one\nLine two");
  await box.press("Enter");
  await expect(page.getByRole("button", { name: "Thinking…" })).toBeDisabled();
  await expect(box).toBeDisabled();
  await expect(page.getByText("Choosing a model and asking Claude Code…")).toBeVisible();
  release();
  await expect(model(page)).toHaveText("Claude Haiku 4.5");
  expect(requests).toBe(1);
});

test("renders Markdown safely", async ({ page }) => {
  await mock(page, () => reply("light", "Some code:\n\n```ts\nconst message = 'hello';\n```\n\n<script>alert('unsafe')</script>"));
  await page.goto("/");
  await send(page, "Show code");
  await expect(page.locator(".answer-markdown pre")).toContainText("const message");
  await expect(page.locator(".answer-markdown script")).toHaveCount(0);
});

test("works on mobile and does not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, () => reply("medium"));
  await page.goto("/");
  await send(page, "Hello");
  await expect(model(page)).toHaveText("Claude Sonnet 5");
  await expect(page.getByRole("link", { name: "Impact", exact: true })).toHaveAttribute("href", "/reports/esg");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/mobile-chat.png", fullPage: true });
});

test("storage failures keep the chat usable", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException("Storage blocked", "QuotaExceededError"); };
  });
  await mock(page, () => reply("light"));
  await page.goto("/");
  await send(page, "Hello");
  await expect(model(page)).toHaveText("Claude Haiku 4.5");
  await expect(sessionLine(page)).toContainText("1 answer ·");
});

test("real HTTP endpoints validate input, need only Gemini, and stay local", async ({ request }) => {
  for (const path of ["/api/route", "/api/chat"]) {
    const missing = await request.post(path, { data: { prompt: "Hello" } });
    expect(missing.status()).toBe(503);
    expect((await missing.json()).error.message).toContain("GEMINI_API_KEY");
    expect((await (await request.post(path, { data: { prompt: " " } })).json()).error.code).toBe("INVALID_PROMPT");
    expect((await request.post(path, { data: { prompt: "Hello" }, headers: { Origin: "http://evil.example" } })).status()).toBe(403);
  }
  expect((await request.post("/api/chat", { data: { prompt: "Hello", sessionId: "bad" } })).status()).toBe(400);
  expect(await (await request.get("/api/session")).json()).toEqual({ configured: false, activities: [] });
});
