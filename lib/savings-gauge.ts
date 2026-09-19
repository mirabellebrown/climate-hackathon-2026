/** 0–100 fill from session API cost savings % vs Always Gemini Pro. */
export function savingsGaugePercent(savedPercent: number | null, requests: number): number {
  if (requests <= 0 || savedPercent === null) return 0;
  return Math.min(100, Math.max(0, savedPercent));
}
