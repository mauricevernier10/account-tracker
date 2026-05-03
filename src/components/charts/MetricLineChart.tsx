"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DataPoint {
  label: string;
  value: number;
}

interface Props {
  data: DataPoint[];
  formatter?: (v: number) => string;
  color?: string;
}

function CustomTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-white px-3 py-2 shadow-md text-xs">
      <p className="font-semibold text-sm">{label}</p>
      <p className="font-medium tabular-nums mt-0.5" style={{ color: payload[0].color }}>
        {formatter ? formatter(payload[0].value) : payload[0].value}
      </p>
    </div>
  );
}

export default function MetricLineChart({ data, formatter, color = "#2563eb" }: Props) {
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min) * 0.15 || max * 0.1;
  const tickInterval = Math.max(0, Math.ceil(data.length / 12) - 1);

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
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
          tickFormatter={formatter}
          tick={{ fontSize: 10, fill: "#6b7280" }}
          axisLine={false}
          tickLine={false}
          width={48}
          domain={[min - padding, max + padding]}
        />
        <Tooltip content={<CustomTooltip formatter={formatter} />} />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: color }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
