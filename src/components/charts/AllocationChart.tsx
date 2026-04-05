"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface Slice {
  name: string;
  value: number;
  color: string;
}

interface Props {
  data: Slice[];
}

const COLORS = [
  "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#ca8a04",
  "#16a34a", "#0891b2", "#9333ea", "#e11d48", "#65a30d",
];

function fmtEur(n: number) {
  return "€" + new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n);
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-sm">
      <p className="font-medium">{d.name}</p>
      <p style={{ color: d.payload.color }}>{fmtEur(d.value)}</p>
      <p className="text-muted-foreground">{d.payload.pct?.toFixed(1)}%</p>
    </div>
  );
}

function CustomLegend({ payload }: any) {
  return (
    <ul className="flex flex-col gap-1 text-xs mt-2">
      {payload?.slice(0, 8).map((entry: any) => (
        <li key={entry.value} className="flex items-center gap-1.5 truncate">
          <span
            className="inline-block h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="truncate text-muted-foreground">{entry.value}</span>
          <span className="ml-auto tabular-nums font-medium shrink-0">
            {entry.payload.pct?.toFixed(1)}%
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function AllocationChart({ data }: Props) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const slices = data.map((d, i) => ({
    ...d,
    color: COLORS[i % COLORS.length],
    pct: (d.value / total) * 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={slices}
          cx="40%"
          cy="50%"
          innerRadius={65}
          outerRadius={100}
          dataKey="value"
          strokeWidth={2}
          stroke="hsl(var(--background))"
        >
          {slices.map((s, i) => (
            <Cell key={i} fill={s.color} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          content={<CustomLegend />}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
