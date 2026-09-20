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
  await page.route("**/api/session", (route) => route.fulfill({ json: { configured: true, mode: "local" as const, serverKeys: { gemini: true, anthropic: false }, activities: seen.map((r) => ({ id: r.id, createdAt: r.createdAt, routing: r.routing, status: "completed", result: r })) } satisfies DashboardState }));
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
const gauge = (page: Page) => page.getByTestId("savings-gauge-caption");

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
  await expect(gauge(page)).toHaveText("vs always Opus");
  await page.getByRole("button", { name: "Explain something" }).click();
  await expect(page.getByRole("textbox", { name: "Your message" })).toHaveValue(/leaves/);
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.locator(".user-bubble")).toContainText("leaves change color");
  await expect(page.locator(".answer-markdown strong")).toHaveText("chlorophyll breaks down");
  await expect(model(page)).toHaveText("Claude Haiku 4.5");
  await expect(saving(page)).toHaveText("74.4% less energy than Opus");
  await expect(gauge(page)).toContainText("· 1 answer");
  expect(bodies[0]).not.toHaveProperty("sessionId");

  await send(page, "And in code?");
  await expect(model(page)).toHaveText("Claude Sonnet 5");
  expect(bodies[1]).toEqual({ prompt: "And in code?", sessionId: SESSION });
  await expect(saving(page)).toHaveText("49.4% less energy than Opus");
  await page.waitForTimeout(5_500); // A poll returns both runs again.
  await expect(gauge(page)).toContainText("· 2 answers");

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
  await expect(gauge(page)).toHaveText("vs always Opus");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(model(page)).toHaveText("Claude Haiku 4.5");
  await expect(page.locator(".user-bubble")).toHaveCount(1);
  await expect(gauge(page)).toContainText("· 1 answer");
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
  await expect(gauge(page)).toContainText("· 1 answer");
});

test("real HTTP endpoints validate input, need a key, and stay local", async ({ request }) => {
  for (const path of ["/api/route", "/api/chat"]) {
    expect((await (await request.post(path, { data: { prompt: " " } })).json()).error.code).toBe("INVALID_PROMPT");
    expect((await request.post(path, { data: { prompt: "Hello" }, headers: { Origin: "http://evil.example" } })).status()).toBe(403);
  }
  // The launcher's classify-only endpoint still needs a key; chat falls back to Claude Code.
  const missing = await request.post("/api/route", { data: { prompt: "Hello" } });
  expect(missing.status()).toBe(503);
  expect((await missing.json()).error.message).toMatch(/GEMINI_API_KEY or ANTHROPIC_API_KEY/);
  const noKey = await request.post("/api/chat", { data: { prompt: "Hello" } });
  expect(noKey.status()).toBe(200);
  expect((await noKey.json()).result.routing.classifierModel).toContain("claude");
  // A page this app was never paired with cannot preflight its way in.
  expect((await request.fetch("/api/chat", { method: "OPTIONS", headers: { Origin: "https://evil.example" } })).status()).toBe(403);
  expect((await request.post("/api/chat", { data: { prompt: "Hello", sessionId: "bad" } })).status()).toBe(400);
  const session = await (await request.get("/api/session")).json();
  expect(session).toMatchObject({ configured: false, mode: "local", serverKeys: { gemini: false, anthropic: false } });
  // The store keeps numbers from that run, never the conversation.
  expect(JSON.stringify(session.activities)).not.toContain("Hello");
});

test("loads demo data without calling a model, and fills the gauge and emoji strip", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/chat", (route) => { calls += 1; return route.abort(); });
  await page.route("**/api/session", (route) => route.fulfill({ json: { configured: true, mode: "local", serverKeys: { gemini: true, anthropic: false }, activities: [] } }));
  await page.goto("/");
  await expect(page.getByTestId("session-savings-emojis-empty")).toBeVisible();
  await page.getByTestId("load-demo-data").click();
  await expect(page.locator(".user-bubble")).toHaveCount(21);
  await expect(gauge(page)).toContainText("· 21 answers");
  await expect(page.getByTestId("savings-gauge-fill")).not.toHaveAttribute("data-fill", "0");
  await expect(page.getByTestId("savings-droplets")).toBeVisible();
  await expect(page.getByTestId("savings-trees")).toBeVisible();
  await expect(page.locator(".message-assistant strong", { hasText: "Claude Opus 5" }).first()).toBeVisible();
  // Loading again replaces rather than doubles the demo.
  await page.getByTestId("load-demo-data").click();
  await expect(page.locator(".user-bubble")).toHaveCount(21);
  await expect(gauge(page)).toContainText("· 21 answers");
  expect(calls).toBe(0);
});

test("tells an unconnected visitor how to get a copy of the app to pair with", async ({ page }) => {
  await page.route("**/api/session", (route) => route.fulfill({ json: { configured: false, mode: "hosted", serverKeys: { gemini: false, anthropic: false }, activities: [] } }));
  await page.goto("/");
  await page.getByTestId("open-keys").click();
  // A visitor on the deployed site has no copy of the app, so the panel hands them the commands.
  const commands = page.getByTestId("bridge-commands");
  await expect(commands).toContainText("git clone https://github.com/mirabellebrown/climate-hackathon-2026");
  await expect(commands).toContainText("npm install && npm run pair");
  await expect(page.getByTestId("copy-bridge-commands")).toBeVisible();
  // Claude Code is the prerequisite that otherwise fails only at the first prompt.
  await expect(page.locator(".bridge-setup")).toContainText("Claude Code installed and signed in");
  await expect(page.locator(".bridge-setup")).toContainText("Node 22 or newer");
});

test("hosted mode asks for a key, keeps the demo usable, and sends the key it is given", async ({ page }) => {
  await page.route("**/api/session", (route) => route.fulfill({ json: { configured: false, mode: "hosted", serverKeys: { gemini: false, anthropic: false }, activities: [] } }));
  const seen: (string | undefined)[] = [];
  await page.route("**/api/chat", (route) => {
    seen.push(route.request().headers()["x-anthropic-key"]);
    return route.fulfill({ json: reply("light") });
  });
  await page.goto("/");
  await expect(page.getByTestId("keys-needed")).toContainText("Gemini");
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  // The demo still works with no key at all.
  await page.getByTestId("load-demo-data").click();
  await expect(page.locator(".user-bubble")).toHaveCount(21);
  await expect(page.getByRole("button", { name: "New conversation" })).toBeVisible();

  await page.getByTestId("open-keys").click();
  await page.getByTestId("anthropic-key").fill("sk-ant-test-key-123");
  await page.getByTestId("save-keys").click();
  await expect(page.getByText("Saved in this browser.")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("keys-needed")).toHaveCount(0);

  await send(page, "Now answer this");
  await expect(model(page)).toHaveText("Claude Haiku 4.5");
  expect(seen).toEqual(["sk-ant-test-key-123"]);
  // The key is never echoed into the page.
  expect(await page.content()).not.toContain("sk-ant-test-key-123");
});
