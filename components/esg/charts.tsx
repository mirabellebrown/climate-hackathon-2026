"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

// Hand-built SVG charts following the dataviz method: one y-axis per chart, thin marks with
// 4px rounded data-ends, 2px surface gaps/rings, recessive solid hairline grid, a hover +
// keyboard layer on every chart, and a table-view twin in every card.

export function fmt(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e6) return new Intl.NumberFormat("en-US", { notation: "compact", maximumSignificantDigits: digits }).format(value);
  // Plain decimals, not scientific notation, down to a millionth; managers read "0.000425" more easily.
  if (abs < 1e-6) return value.toExponential(2);
  if (abs < 0.001) return Number(value.toPrecision(digits)).toString();
  return new Intl.NumberFormat("en-US", { maximumSignificantDigits: digits }).format(value);
}

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

export function niceMax(max: number): number {
  if (!(max > 0)) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}
const ticks = (max: number, n = 4) => Array.from({ length: n + 1 }, (_, i) => max * i / n);

type TipRow = { key?: "line" | "box"; color?: string; value: string; label: string };
interface Tip { x: number; y: number; title: string; rows: TipRow[]; note?: string }

function Tooltip({ tip, width }: { tip: Tip | null; width: number }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x + 12, 0), Math.max(0, width - 220));
  return <div className="esg-tooltip" style={{ left, top: Math.max(0, tip.y - 10) }} role="status">
    <div className="esg-tooltip-title">{tip.title}</div>
    {tip.rows.map((row, i) => <div className="esg-tooltip-row" key={i}>
      {row.key === "box" ? <i className="esg-key-box" style={{ background: row.color }} /> : row.key === "line" ? <i className="esg-key" style={{ background: row.color }} /> : <i />}
      <strong>{row.value}</strong><span>{row.label}</span>
    </div>)}
    {tip.note && <div className="esg-tooltip-note">{tip.note}</div>}
  </div>;
}

export interface TableData { columns: string[]; rows: (string | number)[][]; numeric?: boolean[] }

export function ChartCard({ id, title, subtitle, actions, table, legend, children, footnote }: { id?: string; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; table: TableData; legend?: ReactNode; children: ReactNode; footnote?: ReactNode }) {
  const [showTable, setShowTable] = useState(false);
  return <section className="esg-card" aria-labelledby={id}>
    <div className="esg-card-head">
      <div><h3 id={id}>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>
      <div className="esg-card-actions">{actions}<button className="esg-button" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>{showTable ? "Show chart" : "Show table"}</button></div>
    </div>
    {legend}
    {showTable ? <DataTable data={table} /> : children}
    {footnote && <p className="esg-footnote">{footnote}</p>}
  </section>;
}

export function DataTable({ data, caption }: { data: TableData; caption?: string }) {
  return <div className="esg-table-wrap"><table className="esg-table">
    {caption && <caption className="sr-only">{caption}</caption>}
    <thead><tr>{data.columns.map((c, i) => <th key={c} className={data.numeric?.[i] ? "num" : undefined} scope="col">{c}</th>)}</tr></thead>
    <tbody>{data.rows.map((row, r) => <tr key={r}>{row.map((cell, i) => i === 0 ? <th key={i} scope="row">{cell}</th> : <td key={i} className={data.numeric?.[i] ? "num" : undefined}>{typeof cell === "number" ? fmt(cell, 4) : cell}</td>)}</tr>)}</tbody>
  </table></div>;
}

export function Legend({ items }: { items: { label: string; color: string; shape?: "line" | "box"; weight?: number }[] }) {
  return <div className="esg-legend">{items.map((item) => <span key={item.label}>
    {item.shape === "box" ? <i className="esg-key-box" style={{ background: item.color }} /> : <i className="esg-key" style={{ background: item.color, height: item.weight ?? 2 }} />}{item.label}
  </span>)}</div>;
}

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });

// ── Line chart with crosshair ────────────────────────────────────────────────
export interface LineSeries { id: string; label: string; color: string; values: (number | null)[]; weight?: number }

export function LineChart({ months, series, unit, annotations = [], height = 260, label }: { months: string[]; series: LineSeries[]; unit: string; annotations?: { index: number; label: string }[]; height?: number; label: string }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const direct = series.length <= 4 && width > 480;
  const m = { l: 46, r: direct ? 118 : 14, t: 18, b: 26 };
  const w = Math.max(0, width - m.l - m.r), h = height - m.t - m.b;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null))));
  const x = (i: number) => m.l + (months.length <= 1 ? w / 2 : i * w / (months.length - 1));
  const y = (v: number) => m.t + h - v / max * h;
  const every = Math.ceil(months.length / Math.max(1, Math.floor(w / 64)));
  const path = (values: (number | null)[]) => values.reduce((d, v, i) => v === null ? d : `${d}${d && values[i - 1] !== null && i > 0 ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`, "");
  const pick = (event: PointerEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    setActive(Math.max(0, Math.min(months.length - 1, Math.round(months.length <= 1 ? 0 : px / w * (months.length - 1)))));
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === "ArrowRight") setActive((a) => Math.min(months.length - 1, (a ?? -1) + 1));
    if (event.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? months.length) - 1));
  };
  const tip: Tip | null = active === null ? null : {
    x: x(active), y: m.t, title: monthLabel(months[active]),
    rows: series.map((s) => ({ key: "line", color: s.color, value: `${fmt(s.values[active])} ${unit}`, label: s.label })),
    note: annotations.find((a) => a.index === active)?.label,
  };
  const ends = series.map((s) => { const i = s.values.findLastIndex((v) => v !== null); return i < 0 ? null : { s, i, v: s.values[i]! }; }).filter((e): e is { s: LineSeries; i: number; v: number } => !!e);
  // Nudge colliding end labels apart only slightly; converging lines rely on legend + tooltip.
  const placed = [...ends].sort((a, b) => y(a.v) - y(b.v)).map((e) => ({ ...e, ly: y(e.v) }));
  for (let i = 1; i < placed.length; i++) if (placed[i].ly - placed[i - 1].ly < 13) placed[i].ly = placed[i - 1].ly + 13;
  return <div className="esg-chart" ref={ref}>
    {width > 0 && <svg width={width} height={height} role="img" aria-label={label}>
      {ticks(max).map((t) => <g key={t}><line className="grid" x1={m.l} x2={m.l + w} y1={y(t)} y2={y(t)} /><text x={m.l - 6} y={y(t) + 4} textAnchor="end">{fmt(t)}</text></g>)}
      <line className="axis" x1={m.l} x2={m.l + w} y1={m.t + h} y2={m.t + h} />
      {months.map((mo, i) => i % every === 0 && <text key={mo} x={x(i)} y={height - 8} textAnchor="middle">{monthLabel(mo)}</text>)}
      {annotations.map((a) => <g key={a.index}><line x1={x(a.index)} x2={x(a.index)} y1={m.t} y2={m.t + h} stroke="var(--esg-axis)" strokeWidth={1} /><text x={x(a.index) + 4} y={m.t + 10} className="esg-label">{a.label}</text></g>)}
      {series.map((s) => <path key={s.id} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={s.weight ?? 2} strokeLinejoin="round" strokeLinecap="round" />)}
      {ends.map((e) => <circle key={e.s.id} cx={x(e.i)} cy={y(e.v)} r={4} fill={e.s.color} stroke="var(--esg-surface)" strokeWidth={2} />)}
      {direct && placed.map((e) => <text key={e.s.id} x={m.l + w + 8} y={e.ly + 4} className="esg-label">{e.s.label} {fmt(e.v)}</text>)}
      {active !== null && <g pointerEvents="none"><line x1={x(active)} x2={x(active)} y1={m.t} y2={m.t + h} stroke="var(--esg-ink-2)" strokeWidth={1} />
        {series.map((s) => s.values[active] !== null && <circle key={s.id} cx={x(active)} cy={y(s.values[active]!)} r={4} fill={s.color} stroke="var(--esg-surface)" strokeWidth={2} />)}</g>}
      <rect x={m.l} y={m.t} width={w} height={h} fill="transparent" tabIndex={0} aria-label={`${label}. Use left and right arrow keys to read values.`}
        onPointerMove={pick} onPointerLeave={() => setActive(null)} onFocus={() => setActive((a) => a ?? months.length - 1)} onBlur={() => setActive(null)} onKeyDown={key} />
    </svg>}
    <Tooltip tip={tip} width={width} />
  </div>;
}

// ── Scatter / bubble: cost vs carbon frontier ────────────────────────────────
export interface ScatterPoint { id: string; label: string; x: number; y: number; size: number; color: string; lowConfidence: boolean; detail: string[] }

export function Scatter({ points, iso, xUnit, yUnit, height = 340, label }: { points: ScatterPoint[]; iso: number[]; xUnit: string; yUnit: string; height?: number; label: string }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<string | null>(null);
  const m = { l: 56, r: 24, t: 16, b: 40 };
  const w = Math.max(0, width - m.l - m.r), h = height - m.t - m.b;
  const xmax = niceMax(Math.max(0, ...points.map((p) => p.x)) * 1.1), ymax = niceMax(Math.max(0, ...points.map((p) => p.y)) * 1.1);
  const sx = (v: number) => m.l + v / xmax * w, sy = (v: number) => m.t + h - v / ymax * h;
  const maxSize = Math.max(1, ...points.map((p) => p.size));
  const radius = (size: number) => 5 + Math.sqrt(size / maxSize) * 17;
  const point = points.find((p) => p.id === active);
  const tip: Tip | null = point ? { x: sx(point.x), y: sy(point.y), title: point.label, rows: point.detail.map((d) => ({ value: d, label: "" })), note: point.lowConfidence ? "Low confidence: proprietary architecture, estimate may be off by 2x to 5x." : undefined } : null;
  // Draw larger bubbles first so small ones stay on top and hoverable.
  const ordered = [...points].sort((a, b) => b.size - a.size);
  // Direct-label selectively: biggest volumes first, skipping any label that would collide.
  // Unlabeled points stay identified through the tooltip, the legend and the table view.
  const labels: { id: string; text: string; x: number; y: number }[] = [];
  const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
  for (const p of ordered) {
    const text = p.label, half = text.length * 3.3, lx = Math.min(Math.max(sx(p.x), m.l + half), m.l + w - half), ly = sy(p.y) + radius(p.size) + 13;
    const box = { x0: lx - half, x1: lx + half, y0: ly - 11, y1: ly + 3 };
    const hitsBubble = points.some((q) => q.id !== p.id && Math.abs(sx(q.x) - lx) < half + radius(q.size) && Math.abs(sy(q.y) - (ly - 4)) < radius(q.size) + 6);
    if (!hitsBubble && !boxes.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) { boxes.push(box); labels.push({ id: p.id, text, x: lx, y: ly }); }
  }
  return <div className="esg-chart" ref={ref}>
    {width > 0 && <svg width={width} height={height} role="img" aria-label={label}>
      <defs><clipPath id="esg-plot"><rect x={m.l} y={m.t} width={w} height={h} /></clipPath></defs>
      {ticks(ymax).map((t) => <g key={`y${t}`}><line className="grid" x1={m.l} x2={m.l + w} y1={sy(t)} y2={sy(t)} /><text x={m.l - 6} y={sy(t) + 4} textAnchor="end">{fmt(t)}</text></g>)}
      {ticks(xmax).map((t) => <text key={`x${t}`} x={sx(t)} y={m.t + h + 16} textAnchor="middle">{fmt(t)}</text>)}
      <line className="axis" x1={m.l} x2={m.l + w} y1={m.t + h} y2={m.t + h} />
      <text x={m.l + w} y={height - 4} textAnchor="end">{xUnit}</text>
      <text x={m.l} y={m.t - 4} textAnchor="start">{yUnit}</text>
      <g clipPath="url(#esg-plot)">
        {iso.map((c) => { const xEnd = Math.min(xmax, ymax / c); return <line key={c} x1={sx(0)} y1={sy(0)} x2={sx(xEnd)} y2={sy(c * xEnd)} stroke="var(--esg-grid)" strokeWidth={1.5} />; })}
      </g>
      {iso.map((c) => {
        const xEnd = Math.min(xmax, ymax / c); const lx = Math.min(sx(xEnd), m.l + w) - 4, ly = Math.max(sy(c * xEnd), m.t) + 12;
        const text = `${fmt(c)} g/$`, box = { x0: lx - text.length * 6.2, x1: lx, y0: ly - 11, y1: ly + 3 };
        // Iso-line labels give way to model labels and bubbles; the lines stay visible.
        const blocked = boxes.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)
          || points.some((p) => Math.hypot(sx(p.x) - (box.x0 + box.x1) / 2, sy(p.y) - ly + 4) < radius(p.size) + 14);
        return blocked ? null : <text key={`l${c}`} x={lx} y={ly} textAnchor="end">{text}</text>;
      })}
      <text x={m.l + w - 4} y={m.t + 12} textAnchor="end" className="esg-label-strong">Lower-left: cheaper and cleaner ↙</text>
      {ordered.map((p) => { const r = radius(p.size); return <g key={p.id}>
        <circle className="esg-mark" cx={sx(p.x)} cy={sy(p.y)} r={r} fill={p.color} fillOpacity={0.85} stroke={p.lowConfidence ? "var(--esg-warning)" : "var(--esg-surface)"} strokeWidth={2} />
        {p.lowConfidence && <text x={sx(p.x) + r * 0.72} y={sy(p.y) - r * 0.72} fontSize={12} className="esg-label-strong" aria-hidden="true">⚠</text>}
      </g>; })}
      {labels.map((l) => <text key={`t${l.id}`} x={l.x} y={l.y} textAnchor="middle" className="esg-label">{l.text}</text>)}
      {ordered.map((p) => <circle key={`h${p.id}`} cx={sx(p.x)} cy={sy(p.y)} r={Math.max(12, radius(p.size) + 2)} fill="transparent" tabIndex={0}
        aria-label={`${p.label}: ${p.detail.join(", ")}${p.lowConfidence ? ", low confidence" : ""}`}
        onPointerEnter={() => setActive(p.id)} onPointerLeave={() => setActive(null)} onFocus={() => setActive(p.id)} onBlur={() => setActive(null)} />)}
    </svg>}
    <Tooltip tip={tip} width={width} />
  </div>;
}

// ── Horizontal bars ──────────────────────────────────────────────────────────
export function HBars({ rows, unit, label }: { rows: { key: string; label: string; value: number; color: string; detail: string[] }[]; unit: string; label: string }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<string | null>(null);
  const band = 30, thick = 18, labelW = Math.min(170, Math.max(90, width * 0.3));
  const m = { l: labelW, r: 70, t: 6, b: 22 };
  const height = m.t + rows.length * band + m.b;
  const w = Math.max(0, width - m.l - m.r);
  const max = niceMax(Math.max(0, ...rows.map((r) => r.value)));
  const sx = (v: number) => v / max * w;
  const row = rows.find((r) => r.key === active);
  const index = rows.findIndex((r) => r.key === active);
  const tip: Tip | null = row ? { x: m.l + sx(row.value), y: m.t + index * band, title: row.label, rows: [{ key: "box", color: row.color, value: `${fmt(row.value)} ${unit}`, label: "" }, ...row.detail.map((d) => ({ value: d, label: "" }))] } : null;
  const bar = (x0: number, y0: number, len: number) => { const r = Math.min(4, len); return `M${x0},${y0}H${x0 + len - r}Q${x0 + len},${y0} ${x0 + len},${y0 + r}V${y0 + thick - r}Q${x0 + len},${y0 + thick} ${x0 + len - r},${y0 + thick}H${x0}Z`; };
  return <div className="esg-chart" ref={ref}>
    {width > 0 && <svg width={width} height={height} role="img" aria-label={label}>
      {ticks(max, 4).map((t) => <g key={t}><line className="grid" x1={m.l + sx(t)} x2={m.l + sx(t)} y1={m.t} y2={height - m.b} /><text x={m.l + sx(t)} y={height - 6} textAnchor="middle">{fmt(t)}</text></g>)}
      <line className="axis" x1={m.l} x2={m.l} y1={m.t} y2={height - m.b} />
      {rows.map((r, i) => { const y0 = m.t + i * band + (band - thick) / 2; const len = Math.max(0, sx(r.value)); return <g key={r.key}>
        <text x={m.l - 8} y={y0 + thick / 2 + 4} textAnchor="end" className="esg-label">{r.label.length > 22 ? `${r.label.slice(0, 21)}…` : r.label}</text>
        <path className="esg-mark" d={bar(m.l, y0, Math.max(len, 1))} fill={r.color} />
        {i < 5 && <text x={m.l + len + 6} y={y0 + thick / 2 + 4} className="esg-label">{fmt(r.value)}</text>}
        <rect x={0} y={m.t + i * band} width={width} height={band} fill="transparent" tabIndex={0} aria-label={`${r.label}: ${fmt(r.value)} ${unit}`}
          onPointerEnter={() => setActive(r.key)} onPointerLeave={() => setActive(null)} onFocus={() => setActive(r.key)} onBlur={() => setActive(null)} />
      </g>; })}
    </svg>}
    <Tooltip tip={tip} width={width} />
  </div>;
}

// ── Stacked columns (two segments) ───────────────────────────────────────────
export function StackedColumns({ months, lower, upper, unit, label, notes }: { months: string[]; lower: { label: string; color: string; values: number[] }; upper: { label: string; color: string; values: number[] }; unit: string; label: string; notes: string[] }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const height = 240, m = { l: 46, r: 10, t: 12, b: 26 };
  const w = Math.max(0, width - m.l - m.r), h = height - m.t - m.b;
  const max = niceMax(Math.max(0, ...months.map((_, i) => lower.values[i] + upper.values[i])));
  const slot = w / Math.max(1, months.length), thick = Math.min(24, slot * 0.6);
  const y = (v: number) => m.t + h - v / max * h;
  const tip: Tip | null = active === null ? null : { x: m.l + slot * active + slot / 2, y: y(lower.values[active] + upper.values[active]), title: monthLabel(months[active]),
    rows: [{ key: "box", color: upper.color, value: `${fmt(upper.values[active])} ${unit}`, label: upper.label }, { key: "box", color: lower.color, value: `${fmt(lower.values[active])} ${unit}`, label: lower.label }], note: notes[active] };
  return <div className="esg-chart" ref={ref}>
    {width > 0 && <svg width={width} height={height} role="img" aria-label={label}>
      {ticks(max).map((t) => <g key={t}><line className="grid" x1={m.l} x2={m.l + w} y1={y(t)} y2={y(t)} /><text x={m.l - 6} y={y(t) + 4} textAnchor="end">{fmt(t)}</text></g>)}
      {months.map((mo, i) => {
        const cx = m.l + slot * i + slot / 2, x0 = cx - thick / 2;
        const lowTop = y(lower.values[i]), top = y(lower.values[i] + upper.values[i]);
        const upperH = Math.max(0, lowTop - top - 2), r = Math.min(4, upperH);
        return <g key={mo}>
          <rect className="esg-mark" x={x0} y={lowTop} width={thick} height={Math.max(0, m.t + h - lowTop)} fill={lower.color} />
          {upperH > 0 && <path className="esg-mark" d={`M${x0},${lowTop - 2}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + thick - r}Q${x0 + thick},${top} ${x0 + thick},${top + r}V${lowTop - 2}Z`} fill={upper.color} />}
          <text x={cx} y={height - 8} textAnchor="middle">{monthLabel(mo)}</text>
          <rect x={m.l + slot * i} y={m.t} width={slot} height={h} fill="transparent" tabIndex={0} aria-label={`${monthLabel(mo)}: ${upper.label} ${fmt(upper.values[i])}, ${lower.label} ${fmt(lower.values[i])} ${unit}`}
            onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} />
        </g>;
      })}
      <line className="axis" x1={m.l} x2={m.l + w} y1={m.t + h} y2={m.t + h} />
    </svg>}
    <Tooltip tip={tip} width={width} />
  </div>;
}

// ── Small multiple (single series, shared time axis) ─────────────────────────
export function SmallArea({ months, values, color, unit, label }: { months: string[]; values: (number | null)[]; color: string; unit: string; label: string }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const height = 150, m = { l: 44, r: 10, t: 10, b: 22 };
  const w = Math.max(0, width - m.l - m.r), h = height - m.t - m.b;
  const max = niceMax(Math.max(0, ...values.filter((v): v is number => v !== null)));
  const x = (i: number) => m.l + (months.length <= 1 ? w / 2 : i * w / (months.length - 1));
  const y = (v: number) => m.t + h - v / max * h;
  const pts = values.map((v, i) => v === null ? null : [x(i), y(v)] as const).filter((p): p is readonly [number, number] => !!p);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  const area = pts.length ? `${line}L${pts.at(-1)![0]},${m.t + h}L${pts[0][0]},${m.t + h}Z` : "";
  const every = Math.ceil(months.length / Math.max(1, Math.floor(w / 56)));
  const tip: Tip | null = active === null ? null : { x: x(active), y: m.t, title: monthLabel(months[active]), rows: [{ key: "line", color, value: `${fmt(values[active])} ${unit}`, label: "" }] };
  return <div className="esg-chart" ref={ref}>
    {width > 0 && <svg width={width} height={height} role="img" aria-label={label}>
      {ticks(max, 2).map((t) => <g key={t}><line className="grid" x1={m.l} x2={m.l + w} y1={y(t)} y2={y(t)} /><text x={m.l - 6} y={y(t) + 4} textAnchor="end">{fmt(t)}</text></g>)}
      <path d={area} fill={color} fillOpacity={0.1} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {months.map((mo, i) => i % every === 0 && <text key={mo} x={x(i)} y={height - 6} textAnchor="middle">{monthLabel(mo)}</text>)}
      <line className="axis" x1={m.l} x2={m.l + w} y1={m.t + h} y2={m.t + h} />
      {active !== null && values[active] !== null && <g pointerEvents="none"><line x1={x(active)} x2={x(active)} y1={m.t} y2={m.t + h} stroke="var(--esg-ink-2)" /><circle cx={x(active)} cy={y(values[active]!)} r={4} fill={color} stroke="var(--esg-surface)" strokeWidth={2} /></g>}
      <rect x={m.l} y={m.t} width={w} height={h} fill="transparent" tabIndex={0} aria-label={`${label}. Use arrow keys to read values.`}
        onPointerMove={(e) => { const px = e.clientX - e.currentTarget.getBoundingClientRect().left; setActive(Math.max(0, Math.min(months.length - 1, Math.round(months.length <= 1 ? 0 : px / w * (months.length - 1))))); }}
        onPointerLeave={() => setActive(null)} onFocus={() => setActive(months.length - 1)} onBlur={() => setActive(null)}
        onKeyDown={(e) => { if (e.key === "ArrowRight") setActive((a) => Math.min(months.length - 1, (a ?? -1) + 1)); if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? months.length) - 1)); }} />
    </svg>}
    <Tooltip tip={tip} width={width} />
  </div>;
}

// ── Variance waterfall ───────────────────────────────────────────────────────
export function Waterfall({ steps, unit, label }: { steps: { label: string; value: number; kind: "total" | "delta"; note: string }[]; unit: string; label: string }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const height = 260, m = { l: 50, r: 10, t: 22, b: 30 };
  const w = Math.max(0, width - m.l - m.r), h = height - m.t - m.b;
  const bars = steps.reduce<(typeof steps[number] & { from: number; to: number })[]>((acc, s) => {
    const running = acc.at(-1)?.to ?? 0;
    return [...acc, { ...s, from: s.kind === "total" ? 0 : running, to: s.kind === "total" ? s.value : running + s.value }];
  }, []);
  const max = niceMax(Math.max(0, ...bars.map((b) => Math.max(b.from, b.to))));
  const min = Math.min(0, ...bars.map((b) => Math.min(b.from, b.to)));
  const y = (v: number) => m.t + h - (v - min) / (max - min) * h;
  const slot = w / Math.max(1, bars.length), thick = Math.min(36, slot * 0.55);
  const color = (b: typeof bars[number]) => b.kind === "total" ? "var(--esg-total)" : b.value < 0 ? "var(--esg-down)" : "var(--esg-up)";
  const tip: Tip | null = active === null ? null : { x: m.l + slot * active + slot / 2, y: y(Math.max(bars[active].from, bars[active].to)), title: bars[active].label,
    rows: [{ key: "box", color: color(bars[active]), value: `${bars[active].kind === "delta" && bars[active].value > 0 ? "+" : ""}${fmt(bars[active].value)} ${unit}`, label: "" }], note: bars[active].note };
  return <div className="esg-chart" ref={ref}>
    {width > 0 && <svg width={width} height={height} role="img" aria-label={label}>
      {ticks(max).map((t) => <g key={t}><line className="grid" x1={m.l} x2={m.l + w} y1={y(t)} y2={y(t)} /><text x={m.l - 6} y={y(t) + 4} textAnchor="end">{fmt(t)}</text></g>)}
      <line className="axis" x1={m.l} x2={m.l + w} y1={y(0)} y2={y(0)} />
      {bars.map((b, i) => {
        const cx = m.l + slot * i + slot / 2, top = y(Math.max(b.from, b.to)), bottom = y(Math.min(b.from, b.to));
        const next = bars[i + 1];
        return <g key={b.label}>
          <rect className="esg-mark" x={cx - thick / 2} y={top} width={thick} height={Math.max(1, bottom - top)} rx={2} fill={color(b)} />
          {next && <line x1={cx + thick / 2} x2={cx + slot - thick / 2} y1={y(b.to)} y2={y(b.to)} stroke="var(--esg-axis)" strokeWidth={1} />}
          <text x={cx} y={top - 6} textAnchor="middle" className="esg-label">{b.kind === "delta" && b.value > 0 ? "+" : ""}{fmt(b.value)}</text>
          <text x={cx} y={height - 10} textAnchor="middle" className="esg-label">{b.label}</text>
          <rect x={m.l + slot * i} y={m.t} width={slot} height={h} fill="transparent" tabIndex={0} aria-label={`${b.label}: ${fmt(b.value)} ${unit}. ${b.note}`}
            onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} />
        </g>;
      })}
    </svg>}
    <Tooltip tip={tip} width={width} />
  </div>;
}

export function LowConfidenceKey() {
  return <span className="esg-status esg-status-warning"><AlertTriangle size={13} />Low confidence (may be off by 2x to 5x)</span>;
}
