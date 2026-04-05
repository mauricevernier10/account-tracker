"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface DataPoint {
  date: string;
  label: string;
  value: number;
}

interface Props {
  data: DataPoint[];
  selectedDate: string;
}

function fmtEur(n: number) {
  return "€" + new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n);
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-sm">
      <p className="font-medium">{d.label}</p>
      <p className="text-primary font-semibold">{fmtEur(d.value)}</p>
    </div>
  );
}

function CustomDot(props: any) {
  const { cx, cy, payload, selectedDate } = props;
  const isSelected = payload?.date === selectedDate;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={isSelected ? 5 : 3}
      fill={isSelected ? "#2563eb" : "#ffffff"}
      stroke="#2563eb"
      strokeWidth={2}
    />
  );
}

export default function PortfolioValueChart({ data, selectedDate }: Props) {
  const min = Math.min(...data.map((d) => d.value));
  const max = Math.max(...data.map((d) => d.value));
  const padding = (max - min) * 0.1 || max * 0.1;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v) => "€" + (v / 1000).toFixed(0) + "k"}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          width={52}
          domain={[min - padding, max + padding]}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine
          x={data.find((d) => d.date === selectedDate)?.label}
          stroke="#2563eb"
          strokeDasharray="4 2"
          strokeOpacity={0.5}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#2563eb"
          strokeWidth={2}
          dot={<CustomDot selectedDate={selectedDate} />}
          activeDot={{ r: 5, fill: "#2563eb" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
