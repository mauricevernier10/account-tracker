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

function fmtEur(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return sign + "€" + new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(Math.abs(n));
}

function fmtEurAbs(n: number) {
  return "€" + new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n);
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as DecompositionDataPoint;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-xs space-y-1 max-w-[230px]">
      <p className="font-semibold text-sm mb-1">{d.label}</p>
      <div className="space-y-0.5">
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Portfolio value</span>
          <span className="font-medium tabular-nums">{fmtEurAbs(d.value)}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Net invested</span>
          <span className={`font-medium tabular-nums ${d.netInvested >= 0 ? "text-blue-600" : "text-red-500"}`}>
            {fmtEur(d.netInvested)}
          </span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-muted-foreground">Price effect</span>
          <span className={`font-medium tabular-nums ${d.priceEffect >= 0 ? "text-green-600" : "text-red-500"}`}>
            {fmtEur(d.priceEffect)}
          </span>
        </div>
      </div>
      {!!d.topContributors?.length && (
        <div className="border-t pt-1.5 mt-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Top price contributors</p>
          {d.topContributors.map((c, i) => (
            <div key={i} className="flex justify-between gap-3">
              <span className="text-muted-foreground truncate">{c.name}</span>
              <span className={`font-medium tabular-nums shrink-0 ${c.effect >= 0 ? "text-green-600" : "text-red-500"}`}>
                {fmtEur(c.effect)}
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
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
          formatter={(value) =>
            value === "priceEffect" ? "Price effect" : value === "netInvested" ? "Net invested" : "Total value"
          }
        />
        <ReferenceLine yAxisId="right" y={0} stroke="#d1d5db" />

        <Bar yAxisId="right" dataKey="priceEffect" name="priceEffect" stackId="change">
          {data.map((d, i) => (
            <Cell key={i} fill={d.priceEffect >= 0 ? "#22c55e" : "#ef4444"} />
          ))}
        </Bar>
        <Bar yAxisId="right" dataKey="netInvested" name="netInvested" stackId="change">
          {data.map((d, i) => (
            <Cell key={i} fill={d.netInvested >= 0 ? "#3b82f6" : "#ef4444"} />
          ))}
        </Bar>

        <Line
          yAxisId="left"
          type="monotone"
          dataKey="value"
          name="value"
          stroke="#111827"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={(dotProps: any) => {
            const { cx, cy, index } = dotProps;
            const isLast = index === data.length - 1;
            return (
              <g key={index}>
                <circle cx={cx} cy={cy} r={isLast ? 4 : 2.5} fill="#111827" />
                {isLast && (
                  <text
                    x={cx - 8}
                    y={cy - 8}
                    textAnchor="end"
                    fontSize={10}
                    fill="#111827"
                    fontWeight={600}
                  >
                    {fmtEurAbs(dotProps.payload.value)}
                  </text>
                )}
              </g>
            );
          }}
          activeDot={{ r: 4, fill: "#111827" }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
