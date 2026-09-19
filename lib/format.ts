export function number(value: number): string {
  if (value === 0) return "0";
  if (Math.abs(value) < 0.001) return value.toExponential(2);
  return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 }).format(value);
}

export function percent(value: number | null): string {
  if (value === null) return "—";
  if (value !== 0 && Math.abs(value) < 0.1) return "<0.1%";
  return `${Math.abs(value).toFixed(1).replace(/\.0$/, "")}%`;
}

export function tokens(value: number) { return value.toLocaleString("en-US"); }

export function money(usd: number): string {
  if (usd === 0) return "$0";
  const sign = usd < 0 ? "-" : "";
  const abs = Math.abs(usd);
  if (abs < 0.000001) return `${sign}$${abs.toExponential(2)}`;
  if (abs < 0.01) return `${sign}$${abs.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`;
  if (abs < 1) return `${sign}$${abs.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}`;
  return `${sign}${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(abs)}`;
}
