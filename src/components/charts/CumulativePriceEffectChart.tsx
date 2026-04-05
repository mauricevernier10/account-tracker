"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface DataPoint {
  label: string;
  cumPriceEffect: number;
  cumInvested: number;
}

interface Props {
  data: DataPoint[];
}

function fmtEur(n: number) {
  const sign = n >= 0 ? "+" : "";
  return sign + "€" + new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n);
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const pe = payload.find((p: any) => p.dataKey === "cumPriceEffect");
  const inv = payload.find((p: any) => p.dataKey === "cumInvested");
  return (
    <div className="rounded-lg border bg-white px-3 py-2 shadow-md text-xs space-y-1">
      <p className="font-semibold text-sm">{label}</p>
      {pe && (
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-blue-600" />
          <span className="text-gray-600">Price Effect:</span>
          <span className={`font-medium tabular-nums ${pe.value >= 0 ? "text-green-600" : "text-red-500"}`}>
            {fmtEur(pe.value)}
          </span>
        </div>
      )}
      {inv && (
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-blue-200" />
          <span className="text-gray-600">Net Invested:</span>
          <span className="font-medium tabular-nums text-gray-800">{fmtEur(inv.value)}</span>
        </div>
      )}
    </div>
  );
}

export default function CumulativePriceEffectChart({ data }: Props) {
  const values = data.map((d) => d.cumPriceEffect);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const padding = (max - min) * 0.15 || 100;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="peGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#6b7280" }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v) => (v >= 0 ? "+" : "") + "€" + (v / 1000).toFixed(0) + "k"}
          tick={{ fontSize: 11, fill: "#6b7280" }}
          axisLine={false}
          tickLine={false}
          width={58}
          domain={[min - padding, max + padding]}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="#e5e7eb" />
        <Area
          type="monotone"
          dataKey="cumPriceEffect"
          name="Cumulative Price Effect"
          stroke="#2563eb"
          strokeWidth={2}
          fill="url(#peGradient)"
          dot={false}
          activeDot={{ r: 4, fill: "#2563eb" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
