"use client";

import { useMemo, useState } from "react";
import type { EfficiencyFrontierPoint } from "@/lib/esg/types";

const PROVIDER_COLORS: Record<string, string> = {
  google_genai: "#284d35",
  openai: "#1d1d1f",
  anthropic: "#3d6b4a",
  default: "#7a7a7a",
};

function colorFor(provider: string) {
  return PROVIDER_COLORS[provider] ?? PROVIDER_COLORS.default!;
}

function shortModel(model: string) {
  return model.replace(/^gemini-/, "").replace(/-preview$/, "");
}

export function EfficiencyFrontierChart({ points }: { points: EfficiencyFrontierPoint[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const ready = points.filter((p) => p.usd_per_1m_output != null && p.gwp_per_1m_output != null);

  const layout = useMemo(() => {
    const pad = { l: 56, r: 24, t: 20, b: 48 };
    const W = 720;
    const H = 420;
    const xs = ready.map((p) => p.usd_per_1m_output!);
    const ys = ready.map((p) => p.gwp_per_1m_output!);
    const minX = Math.min(...xs, 0);
    const maxX = Math.max(...xs) * 1.15 || 1;
    const minY = Math.min(...ys, 0);
    const maxY = Math.max(...ys) * 1.15 || 1;
    const maxTokens = Math.max(...ready.map((p) => p.tokens_out), 1);
    const xScale = (v: number) => pad.l + ((v - minX) / (maxX - minX || 1)) * (W - pad.l - pad.r);
    const yScale = (v: number) => pad.t + (1 - (v - minY) / (maxY - minY || 1)) * (H - pad.t - pad.b);
    const rScale = (t: number) => 8 + Math.sqrt(t / maxTokens) * 28;

    // Iso-lines of constant CPD (gCO2e/$): y = cpd * x  (both per 1M tokens ⇒ same CPD)
    const cpds = ready.map((p) => p.cpd).filter((c): c is number => c != null && c > 0);
    const medianCpd = cpds.length
      ? [...cpds].sort((a, b) => a - b)[Math.floor(cpds.length / 2)]!
      : 1;
    const isoValues = [medianCpd * 0.5, medianCpd, medianCpd * 2].filter((v) => v > 0);

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    return { pad, W, H, minX, maxX, minY, maxY, xScale, yScale, rScale, isoValues, midX, midY };
  }, [ready]);

  if (!ready.length) {
    return <p className="dash-empty">Need at least one model with output tokens and cost.</p>;
  }

  const { pad, W, H, xScale, yScale, rScale, isoValues, maxX, maxY, midX, midY, minX, minY } = layout;
  const hovered = ready.find((p) => `${p.provider}|${p.model}` === hover);

  return (
    <div className="esg-frontier">
      <svg className="esg-frontier-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Efficiency frontier scatter of cost versus carbon intensity">
        {/* cheaper & cleaner quadrant tint */}
        <rect
          x={pad.l}
          y={yScale(midY)}
          width={xScale(midX) - pad.l}
          height={yScale(minY) - yScale(midY)}
          fill="rgba(40, 77, 53, 0.06)"
        />
        <text x={pad.l + 8} y={yScale(minY) - 10} className="esg-frontier-quad" fill="#284d35">
          Cheaper and cleaner
        </text>

        {/* Iso CPD curves: gwp_per_1m = cpd * usd_per_1m */}
        {isoValues.map((cpd) => {
          const x0 = Math.max(minX, 0.01);
          const x1 = maxX;
          const y0 = cpd * x0;
          const y1 = cpd * x1;
          if (y0 > maxY && y1 > maxY) return null;
          return (
            <line
              key={cpd}
              x1={xScale(x0)}
              y1={yScale(Math.min(y0, maxY))}
              x2={xScale(x1)}
              y2={yScale(Math.min(y1, maxY))}
              stroke="#e0e0e0"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
          );
        })}

        {/* Axes */}
        <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="#e0e0e0" />
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke="#e0e0e0" />
        <text x={(pad.l + W - pad.r) / 2} y={H - 12} textAnchor="middle" className="esg-frontier-axis">
          USD per 1M output tokens →
        </text>
        <text
          x={16}
          y={(pad.t + H - pad.b) / 2}
          textAnchor="middle"
          transform={`rotate(-90 16 ${(pad.t + H - pad.b) / 2})`}
          className="esg-frontier-axis"
        >
          gCO₂e per 1M output tokens →
        </text>

        {ready.map((p) => {
          const key = `${p.provider}|${p.model}`;
          const cx = xScale(p.usd_per_1m_output!);
          const cy = yScale(p.gwp_per_1m_output!);
          const r = rScale(p.tokens_out);
          return (
            <g
              key={key}
              onMouseEnter={() => setHover(key)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "pointer" }}
            >
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill={colorFor(p.provider)}
                fillOpacity={hover === key ? 0.85 : 0.55}
                stroke={hover === key ? "#1d1d1f" : "transparent"}
                strokeWidth={1.5}
              />
              {p.low_confidence && (
                <text x={cx + r * 0.55} y={cy - r * 0.55} className="esg-frontier-flag" aria-label="Lower confidence">
                  !
                </text>
              )}
              <text x={cx} y={cy + r + 14} textAnchor="middle" className="esg-frontier-label">
                {shortModel(p.model)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="esg-frontier-legend">
        <span><i style={{ background: colorFor("google_genai") }} />google_genai</span>
        <span className="muted">Bubble size = output token volume · dashed lines = constant gCO₂e per $</span>
      </div>

      {hovered && (
        <div className="esg-frontier-hover" role="status">
          <strong>{hovered.model}</strong>
          <span>{hovered.usd_per_1m_output!.toFixed(2)} USD / 1M out</span>
          <span>{hovered.gwp_per_1m_output!.toExponential(2)} gCO₂e / 1M out</span>
          <span>{hovered.tokens_out.toLocaleString()} output tokens</span>
          {hovered.low_confidence && <span className="warn">Lower confidence — proprietary architecture may be off by 2–5×</span>}
        </div>
      )}

      <div className="esg-table-wrap esg-frontier-table">
        <table className="esg-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>USD / 1M out</th>
              <th>gCO₂e / 1M out</th>
              <th>Volume</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {ready.map((p) => (
              <tr key={`${p.provider}|${p.model}`}>
                <td>{p.model}</td>
                <td>{p.usd_per_1m_output!.toFixed(2)}</td>
                <td>{p.gwp_per_1m_output!.toExponential(2)}</td>
                <td>{p.tokens_out.toLocaleString()}</td>
                <td>{p.low_confidence ? "Lower" : "Standard"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
