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
} from "recharts";

interface DataPoint {
  label: string;
  value: number;
  netInvested: number;
  priceEffect: number;
}

interface Props {
  data: DataPoint[];
}

function fmtEur(n: number) {
  return "€" + new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n);
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-white px-3 py-2 shadow-md text-xs space-y-1">
      <p className="font-semibold text-sm">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-medium tabular-nums" style={{ color: p.color }}>
            {fmtEur(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ValueDecompositionChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "#6b7280" }}
          axisLine={false}
          tickLine={false}
          interval={0}
          angle={-35}
          textAnchor="end"
          height={48}
        />
        <YAxis
          tickFormatter={(v) => "€" + (v / 1000).toFixed(0) + "k"}
          tick={{ fontSize: 11, fill: "#6b7280" }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="#e5e7eb" />
        <Bar dataKey="netInvested" name="Net Invested" stackId="a" fill="#93c5fd" radius={[0, 0, 0, 0]} />
        <Bar dataKey="priceEffect" name="Price Effect" stackId="a" fill="#2563eb" radius={[3, 3, 0, 0]} />
        <Line
          type="monotone"
          dataKey="value"
          name="Total Value"
          stroke="#1d4ed8"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
