import "server-only";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sampleRecords } from "./sample";
import { classify, parseOverride, parseRecord } from "./validate";
import type { EsgRecord, EsgSettings, RevenueEntry, SupplierOverride } from "./types";

// Append-only local storage. Records are immutable once written; rollups are always
// recomputed from them, so a factor change never rewrites a published figure.
const dir = () => process.env.CANOPY_ESG_DIR || join(process.cwd(), ".canopy", "esg");
const file = (name: string) => join(dir(), name);
const DEFAULT_SETTINGS: EsgSettings = { fiscal_year_start_month: 1, revenue: [], overrides: [] };

let sampleCache: EsgRecord[] | null = null;

export interface Dataset { records: EsgRecord[]; sample: boolean }

export function loadDataset(): Dataset {
  const path = file("records.jsonl");
  if (!existsSync(path)) return { records: sampleCache ??= sampleRecords(), sample: true };
  const records = readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as EsgRecord);
  return { records, sample: false };
}

export function loadSettings(): EsgSettings {
  const path = file("settings.json");
  if (!existsSync(path)) return { ...DEFAULT_SETTINGS, revenue: [], overrides: [] };
  return { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(path, "utf8")) };
}

function saveSettings(settings: EsgSettings, action: string, detail: unknown) {
  mkdirSync(dir(), { recursive: true });
  writeFileSync(file("settings.json"), JSON.stringify(settings, null, 2));
  appendFileSync(file("audit.jsonl"), JSON.stringify({ at: new Date().toISOString(), action, detail }) + "\n");
}

export function ingest(inputs: unknown[]): { accepted: number; duplicates: number } {
  const settings = loadSettings();
  const parsed = inputs.map((input, index) => classify(parseRecord(input, `records[${index}]`), settings.overrides));
  const existing = new Set(existsSync(file("records.jsonl")) ? loadDataset().records.map((record) => record.request_id) : []);
  const fresh = parsed.filter((record) => !existing.has(record.request_id) && existing.add(record.request_id));
  mkdirSync(dir(), { recursive: true });
  if (fresh.length) appendFileSync(file("records.jsonl"), fresh.map((record) => JSON.stringify(record)).join("\n") + "\n");
  else if (!existsSync(file("records.jsonl"))) writeFileSync(file("records.jsonl"), "");
  return { accepted: fresh.length, duplicates: parsed.length - fresh.length };
}

export function setRevenue(entry: Omit<RevenueEntry, "entered_at">): RevenueEntry {
  const settings = loadSettings();
  const saved = { ...entry, entered_at: new Date().toISOString() };
  const previous = settings.revenue.find((item) => item.period === entry.period) ?? null;
  settings.revenue = [...settings.revenue.filter((item) => item.period !== entry.period), saved];
  saveSettings(settings, "revenue.set", { entry: saved, previous });
  return saved;
}

export function addOverride(input: unknown): SupplierOverride {
  const settings = loadSettings();
  const override: SupplierOverride = { ...parseOverride(input), id: randomUUID(), registered_at: new Date().toISOString() };
  settings.overrides = [...settings.overrides, override];
  saveSettings(settings, "supplier_override.add", override);
  return override;
}

export function resetSampleCache() { sampleCache = null; }
