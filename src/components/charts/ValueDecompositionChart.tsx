"use client";

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
const C_ACCENT = "#2563EB";       // net invested positive
const C_AMBER = "#D97706";        // net invested negative (= net outflow)
const C_POSITIVE = "#16A34A";     // price effect positive
const C_NEGATIVE = "#DC2626";     // price effect negative

function fmtSigned(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return sign + new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(Math.abs(n)) + " €";
}

function fmtAbs(n: number) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n) + " €";
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

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const d = entry.payload as DecompositionDataPoint;
  const key = entry.dataKey as "value" | "netInvested" | "priceEffect";

  if (key === "value") {
    return (
      <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-xs">
        <p className="font-semibold text-sm mb-0.5">{d.label}</p>
        <p>
          <span className="text-muted-foreground">Total value: </span>
          <span className="font-semibold tabular-nums">{fmtAbs(d.value)}</span>
        </p>
      </div>
    );
  }

  if (key === "priceEffect") {
    if (d.priceContributors === null) {
      return (
        <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-xs">
          <p className="font-semibold">No prior period</p>
        </div>
      );
    }
    const color = d.priceEffect >= 0 ? C_POSITIVE : C_NEGATIVE;
    return (
      <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-xs space-y-1 max-w-[240px]">
        <p className="font-semibold" style={{ color }}>
          Price effect: {fmtSigned(d.priceEffect)}
        </p>
        <ContributorList items={d.priceContributors} posColor={C_POSITIVE} negColor={C_NEGATIVE} />
      </div>
    );
  }

  // netInvested
  const color = d.netInvested >= 0 ? C_ACCENT : C_AMBER;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-xs space-y-1 max-w-[240px]">
      <p className="font-semibold" style={{ color }}>
        Net invested: {fmtSigned(d.netInvested)}
      </p>
      <ContributorList items={d.investContributors} posColor={C_ACCENT} negColor={C_AMBER} />
    </div>
  );
}

export default function ValueDecompositionChart({ data, selectedDate }: Props) {
  const tickInterval = Math.max(0, Math.ceil(data.length / 12) - 1);

  // Streamlit: yaxis range = [0, max(values) * 1.3]
  const leftMax = Math.max(...data.map((d) => d.value));
  const leftDomain: [number, number] = [0, leftMax * 1.3];

  const rightMax = Math.max(
    ...data.map((d) => (d.netInvested > 0 ? d.netInvested : 0) + (d.priceEffect > 0 ? d.priceEffect : 0)),
    0,
  );
  const rightMin = Math.min(
    ...data.map((d) => (d.netInvested < 0 ? d.netInvested : 0) + (d.priceEffect < 0 ? d.priceEffect : 0)),
    0,
  );
  const rightPad = (rightMax - rightMin) * 0.18 || 500;

  const selectedLabel = data.find((d) => d.date === selectedDate)?.label;

  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart data={data} margin={{ top: 16, right: 64, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={C_BORDER} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: C_MUTED }}
          axisLine={false}
          tickLine={false}
          interval={tickInterval}
          angle={-35}
          textAnchor="end"
          height={48}
        />
        <YAxis
          yAxisId="left"
          tickFormatter={(v) => "€" + (v / 1000).toFixed(0) + "k"}
          tick={{ fontSize: 10, fill: C_MUTED }}
          axisLine={false}
          tickLine={false}
          width={52}
          domain={leftDomain}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={(v) => (v === 0 ? "0" : (v > 0 ? "+" : "−") + "€" + Math.abs(v / 1000).toFixed(0) + "k")}
          tick={{ fontSize: 10, fill: C_MUTED }}
          axisLine={false}
          tickLine={false}
          width={52}
          domain={[rightMin - rightPad, rightMax + rightPad]}
        />
        <Tooltip content={<CustomTooltip />} shared={false} cursor={{ fill: "rgba(15,23,42,0.04)" }} />
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

        <Bar yAxisId="right" dataKey="priceEffect" name="priceEffect" stackId="change" fill={C_POSITIVE}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.priceEffect >= 0 ? C_POSITIVE : C_NEGATIVE} />
          ))}
        </Bar>
        <Bar yAxisId="right" dataKey="netInvested" name="netInvested" stackId="change" fill={C_ACCENT}>
          {data.map((d, i) => (
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
            const isLast = index === data.length - 1;
            return (
              <g key={index}>
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
          activeDot={{ r: 4, fill: C_TEXT }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
