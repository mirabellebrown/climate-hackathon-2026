import { FACTORS } from "@/lib/factors";
import { isValidEsgRecord } from "./adapt";
import type { EsgRequestRecord } from "./types";

export const ESG_SESSION_KEY = `greenroute-esg-records-${FACTORS.version}`;
const EVENT = "greenroute-esg-change";
const MAX_RECORDS = 200;

function readRaw(): EsgRequestRecord[] {
  try {
    const raw = window.localStorage.getItem(ESG_SESSION_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as { version?: string; records?: unknown };
    if (data.version !== FACTORS.version || !Array.isArray(data.records)) return [];
    return data.records.filter(isValidEsgRecord);
  } catch {
    return [];
  }
}

function writeRaw(records: EsgRequestRecord[]) {
  const trimmed = records.slice(-MAX_RECORDS);
  try {
    window.localStorage.setItem(ESG_SESSION_KEY, JSON.stringify({ version: FACTORS.version, records: trimmed }));
  } catch {
    /* quota */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function listClientEsgRecords(): EsgRequestRecord[] {
  return readRaw();
}

export function appendClientEsgRecord(record: EsgRequestRecord): void {
  const existing = readRaw();
  if (existing.some((r) => r.id === record.id)) return;
  writeRaw([...existing, record]);
}

export function subscribeClientEsg(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === ESG_SESSION_KEY || event.key === null) callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, callback);
  };
}

/** Push local records to the server Map so APIs and multi-tab managers see them. */
export async function syncClientEsgToServer(): Promise<number> {
  const records = readRaw();
  if (!records.length) return 0;
  const response = await fetch("/api/v1/esg/records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records }),
  });
  if (!response.ok) return 0;
  const data = (await response.json()) as { added?: number };
  return data.added ?? 0;
}
