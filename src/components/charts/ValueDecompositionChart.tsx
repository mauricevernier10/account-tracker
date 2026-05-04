"use client";

import { useState, useRef, type CSSProperties } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  Cell,
} from "recharts";

interface Contributor {
  name: string;
  effect: number;
}

export interface DecompositionDataPoint {
  date: string;
  label: string;
  value: number;
  netInvested: number;
  priceEffect: number;
  // null = "No prior period" (first statement, no price-effect breakdown)
  priceContributors: Contributor[] | null;
  investContributors: Contributor[];
}

interface Props {
  data: DecompositionDataPoint[];
  selectedDate?: string | null;
}

// Streamlit reference palette (constants.py)
const C_TEXT = "#111827";
const C_MUTED = "#6B7280";
const C_BORDER = "#E5E7EB";
const C_ACCENT = "#2563EB";   // net invested positive
const C_AMBER = "#D97706";    // net invested negative
const C_POSITIVE = "#16A34A"; // price effect positive
const C_NEGATIVE = "#DC2626"; // price effect negative

function fmtSigned(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return sign + new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(Math.abs(n)) + " €";
}

function fmtAbs(n: number) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n) + " €";
}

type HoverKind = "price" | "invest" | "value";
interface Hover {
  kind: HoverKind;
  index: number;
  x: number;
  y: number;
}

function ContributorList({ items, posColor, negColor }: { items: Contributor[]; posColor: string; negColor: string }) {
  return (
    <>
      {items.map((c, i) => (
        <div key={i} className="flex justify-between gap-4">
          <span className="text-muted-foreground truncate">{c.name}</span>
          <span
            className="font-medium tabular-nums shrink-0"
            style={{ color: c.effect >= 0 ? posColor : negColor }}
          >
            {fmtSigned(c.effect)}
          </span>
        </div>
      ))}
    </>
  );
}

function HoverCard({ hover, data }: { hover: Hover; data: DecompositionDataPoint[] }) {
  const d = data[hover.index];
  if (!d) return null;

  let body: React.ReactNode;
  if (hover.kind === "value") {
    body = (
      <>
        <p className="font-semibold text-sm mb-0.5">{d.label}</p>
        <p>
          <span className="text-muted-foreground">Total value: </span>
          <span className="font-semibold tabular-nums">{fmtAbs(d.value)}</span>
        </p>
      </>
    );
  } else if (hover.kind === "price") {
    if (d.priceContributors === null) {
      body = <p className="font-semibold">No prior period</p>;
    } else {
      const color = d.priceEffect >= 0 ? C_POSITIVE : C_NEGATIVE;
      body = (
        <>
          <p className="font-semibold" style={{ color }}>
            Price effect: {fmtSigned(d.priceEffect)}
          </p>
          <ContributorList items={d.priceContributors} posColor={C_POSITIVE} negColor={C_NEGATIVE} />
        </>
      );
    }
  } else {
    const color = d.netInvested >= 0 ? C_ACCENT : C_AMBER;
    body = (
      <>
        <p className="font-semibold" style={{ color }}>
          Net invested: {fmtSigned(d.netInvested)}
        </p>
        <ContributorList items={d.investContributors} posColor={C_ACCENT} negColor={C_AMBER} />
      </>
    );
  }

  // Position with offset so the cursor doesn't sit on top of the card
  const style: CSSProperties = {
    position: "absolute",
    left: hover.x + 12,
    top: hover.y + 12,
    pointerEvents: "none",
    zIndex: 30,
  };

  return (
    <div style={style} className="rounded-lg border bg-background px-3 py-2 shadow-md text-xs space-y-1 max-w-[260px]">
      {body}
    </div>
  );
}

export default function ValueDecompositionChart({ data, selectedDate }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  // Streamlit: yaxis range = [0, max(values) * 1.3]
  const leftMax = Math.max(...data.map((d) => d.value));
  const leftDomain: [number, number] = [0, leftMax * 1.3];

  // Precompute ranged bar values [y0, y1] for each period.
  // When pe < 0 and ni > 0: sign-separated (green above axis, red below).
  // All other cases: cumulative from 0 (stacked in the same direction).
  const chartData = data.map((d) => {
    const pe = d.priceEffect;
    const ni = d.netInvested;
    const signSeparated = pe < 0 && ni > 0;
    return {
      ...d,
      priceBarRange: signSeparated ? ([pe, 0] as [number, number]) : ([0, pe] as [number, number]),
      investBarRange: signSeparated ? ([0, ni] as [number, number]) : ([pe, pe + ni] as [number, number]),
    };
  });

  // Domain must cover all bar endpoints across both layouts.
  const stackBounds = data.flatMap((d) => {
    const pe = d.priceEffect;
    const ni = d.netInvested;
    return pe < 0 && ni > 0 ? [0, pe, ni] : [0, pe, pe + ni];
  });
  const rightMax = Math.max(...stackBounds, 0);
  const rightMin = Math.min(...stackBounds, 0);
  const rightPad = (rightMax - rightMin) * 0.18 || 500;

  const selectedLabel = data.find((d) => d.date === selectedDate)?.label;

  function setHoverFromEvent(kind: HoverKind, index: number, ev: { clientX: number; clientY: number }) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ kind, index, x: ev.clientX - rect.left, y: ev.clientY - rect.top });
  }

  return (
    <div ref={containerRef} className="relative" onMouseLeave={() => setHover(null)}>
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={chartData} margin={{ top: 16, right: 72, left: 24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C_BORDER} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: C_MUTED }}
            axisLine={false}
            tickLine={false}
            interval={0}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis
            yAxisId="left"
            tickFormatter={(v) => "€" + (v / 1000).toFixed(0) + "k"}
            tick={{ fontSize: 10, fill: C_MUTED }}
            axisLine={false}
            tickLine={false}
            width={60}
            domain={leftDomain}
            label={{
              value: "Total value (€)",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 10, fill: C_MUTED, textAnchor: "middle" },
              offset: 0,
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v) => (v === 0 ? "0" : (v > 0 ? "+" : "−") + "€" + Math.abs(v / 1000).toFixed(0) + "k")}
            tick={{ fontSize: 10, fill: C_MUTED }}
            axisLine={false}
            tickLine={false}
            width={64}
            domain={[rightMin - rightPad, rightMax + rightPad]}
            label={{
              value: "Period change (€)",
              angle: 90,
              position: "insideRight",
              style: { fontSize: 10, fill: C_MUTED, textAnchor: "middle" },
              offset: 0,
            }}
          />
          {/* Disable Recharts' own tooltip; we render our own absolute card. */}
          <Tooltip content={() => null} cursor={false} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
            formatter={(value) =>
              value === "priceEffect" ? "Price effect" : value === "netInvested" ? "Net invested" : "Total value"
            }
          />
          <ReferenceLine yAxisId="right" y={0} stroke={C_BORDER} />
          {selectedLabel && (
            <ReferenceLine
              yAxisId="left"
              x={selectedLabel}
              stroke={C_MUTED}
              strokeDasharray="4 3"
              strokeOpacity={0.6}
            />
          )}

          <Bar
            yAxisId="right"
            dataKey="priceBarRange"
            name="priceEffect"
            fill={C_POSITIVE}
            onMouseEnter={(_p: any, idx: number, ev: any) => setHoverFromEvent("price", idx, ev)}
            onMouseMove={(_p: any, idx: number, ev: any) => setHoverFromEvent("price", idx, ev)}
            onMouseLeave={() => setHover(null)}
          >
            {chartData.map((d, i) => (
              <Cell key={i} fill={d.priceEffect >= 0 ? C_POSITIVE : C_NEGATIVE} />
            ))}
          </Bar>
          <Bar
            yAxisId="right"
            dataKey="investBarRange"
            name="netInvested"
            fill={C_ACCENT}
            onMouseEnter={(_p: any, idx: number, ev: any) => setHoverFromEvent("invest", idx, ev)}
            onMouseMove={(_p: any, idx: number, ev: any) => setHoverFromEvent("invest", idx, ev)}
            onMouseLeave={() => setHover(null)}
          >
            {chartData.map((d, i) => (
              <Cell key={i} fill={d.netInvested >= 0 ? C_ACCENT : C_AMBER} />
            ))}
          </Bar>

          <Line
            yAxisId="left"
            type="linear"
            dataKey="value"
            name="value"
            stroke={C_TEXT}
            strokeWidth={1.5}
            strokeDasharray="3 3"
            dot={(dotProps: any) => {
              const { cx, cy, index } = dotProps;
              const isLast = index === chartData.length - 1;
              return (
                <g
                  key={index}
                  onMouseEnter={(ev) => setHoverFromEvent("value", index, ev)}
                  onMouseMove={(ev) => setHoverFromEvent("value", index, ev)}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: "pointer" }}
                >
                  {/* Larger transparent hit-area for easier hover */}
                  <circle cx={cx} cy={cy} r={8} fill="transparent" />
                  <circle cx={cx} cy={cy} r={isLast ? 4 : 2.5} fill={C_TEXT} />
                  {isLast && (
                    <text
                      x={cx + 6}
                      y={cy + 3}
                      textAnchor="start"
                      fontSize={10}
                      fill={C_TEXT}
                      fontWeight={600}
                    >
                      {fmtAbs(dotProps.payload.value)}
                    </text>
                  )}
                </g>
              );
            }}
            activeDot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      {hover && <HoverCard hover={hover} data={data} />}
    </div>
  );
}
