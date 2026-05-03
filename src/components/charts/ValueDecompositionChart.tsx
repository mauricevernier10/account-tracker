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
  label: string;
  value: number;
  netInvested: number;
  priceEffect: number;
  topContributors?: Contributor[];
}

interface Props {
  data: DecompositionDataPoint[];
}

const COLOR_NET_INVESTED = "#2563eb";
const COLOR_PRICE_EFFECT = "#16a34a";
const COLOR_NEGATIVE = "#dc2626";
const COLOR_LINE = "#0f172a";

function fmtSigned(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return sign + "€" + new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(Math.abs(n));
}

function fmtAbs(n: number) {
  return "€" + new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n);
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const d = entry.payload as DecompositionDataPoint;
  const key = entry.dataKey as "value" | "netInvested" | "priceEffect";

  if (key === "value") {
    return (
      <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-xs">
        <p className="font-semibold text-sm mb-1">{d.label}</p>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR_LINE }} />
          <span className="text-muted-foreground">Total value</span>
          <span className="font-medium tabular-nums ml-auto">{fmtAbs(d.value)}</span>
        </div>
      </div>
    );
  }

  if (key === "netInvested") {
    const color = d.netInvested >= 0 ? COLOR_NET_INVESTED : COLOR_NEGATIVE;
    return (
      <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-xs">
        <p className="font-semibold text-sm mb-1">{d.label}</p>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
          <span className="text-muted-foreground">Net invested</span>
          <span className="font-medium tabular-nums ml-auto" style={{ color }}>
            {fmtSigned(d.netInvested)}
          </span>
        </div>
      </div>
    );
  }

  // priceEffect
  const color = d.priceEffect >= 0 ? COLOR_PRICE_EFFECT : COLOR_NEGATIVE;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-xs space-y-1.5 max-w-[230px]">
      <p className="font-semibold text-sm">{d.label}</p>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="text-muted-foreground">Price effect</span>
        <span className="font-medium tabular-nums ml-auto" style={{ color }}>
          {fmtSigned(d.priceEffect)}
        </span>
      </div>
      {!!d.topContributors?.length && (
        <div className="border-t pt-1.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Top contributors</p>
          {d.topContributors.map((c, i) => (
            <div key={i} className="flex justify-between gap-3">
              <span className="text-muted-foreground truncate">{c.name}</span>
              <span
                className="font-medium tabular-nums shrink-0"
                style={{ color: c.effect >= 0 ? COLOR_PRICE_EFFECT : COLOR_NEGATIVE }}
              >
                {fmtSigned(c.effect)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ValueDecompositionChart({ data }: Props) {
  const tickInterval = Math.max(0, Math.ceil(data.length / 12) - 1);

  const leftMin = Math.min(...data.map((d) => d.value));
  const leftMax = Math.max(...data.map((d) => d.value));
  const leftPad = (leftMax - leftMin) * 0.12 || leftMax * 0.1;

  const rightMax = Math.max(
    ...data.map((d) => (d.netInvested > 0 ? d.netInvested : 0) + (d.priceEffect > 0 ? d.priceEffect : 0)),
    0,
  );
  const rightMin = Math.min(
    ...data.map((d) => (d.netInvested < 0 ? d.netInvested : 0) + (d.priceEffect < 0 ? d.priceEffect : 0)),
    0,
  );
  const rightPad = (rightMax - rightMin) * 0.18 || 500;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 16, right: 64, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "#6b7280" }}
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
          tick={{ fontSize: 10, fill: "#6b7280" }}
          axisLine={false}
          tickLine={false}
          width={52}
          domain={[leftMin - leftPad, leftMax + leftPad]}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={(v) => (v === 0 ? "0" : (v > 0 ? "+" : "−") + "€" + Math.abs(v / 1000).toFixed(0) + "k")}
          tick={{ fontSize: 10, fill: "#6b7280" }}
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
        <ReferenceLine yAxisId="right" y={0} stroke="#d1d5db" />

        <Bar
          yAxisId="right"
          dataKey="priceEffect"
          name="priceEffect"
          stackId="change"
          fill={COLOR_PRICE_EFFECT}
        >
          {data.map((d, i) => (
            <Cell key={i} fill={d.priceEffect >= 0 ? COLOR_PRICE_EFFECT : COLOR_NEGATIVE} />
          ))}
        </Bar>
        <Bar
          yAxisId="right"
          dataKey="netInvested"
          name="netInvested"
          stackId="change"
          fill={COLOR_NET_INVESTED}
        >
          {data.map((d, i) => (
            <Cell key={i} fill={d.netInvested >= 0 ? COLOR_NET_INVESTED : COLOR_NEGATIVE} />
          ))}
        </Bar>

        <Line
          yAxisId="left"
          type="monotone"
          dataKey="value"
          name="value"
          stroke={COLOR_LINE}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={(dotProps: any) => {
            const { cx, cy, index } = dotProps;
            const isLast = index === data.length - 1;
            return (
              <g key={index}>
                <circle cx={cx} cy={cy} r={isLast ? 4 : 2.5} fill={COLOR_LINE} />
                {isLast && (
                  <text
                    x={cx - 8}
                    y={cy - 8}
                    textAnchor="end"
                    fontSize={10}
                    fill={COLOR_LINE}
                    fontWeight={600}
                  >
                    {fmtAbs(dotProps.payload.value)}
                  </text>
                )}
              </g>
            );
          }}
          activeDot={{ r: 4, fill: COLOR_LINE }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
