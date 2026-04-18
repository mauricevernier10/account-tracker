"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

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

export default function AllocationChart({ data }: Props) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const slices = data.map((d, i) => ({
    ...d,
    color: COLORS[i % COLORS.length],
    pct: (d.value / total) * 100,
  }));

  return (
    <div className="flex items-center gap-4" style={{ height: 260 }}>
      <div className="flex-1 min-w-0">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={slices}
              cx="50%"
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
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-col gap-1 text-xs shrink-0 max-w-[55%] overflow-y-auto max-h-full">
        {slices.map((s) => (
          <li key={s.name} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className="truncate text-muted-foreground">{s.name}</span>
            <span className="ml-auto tabular-nums font-medium shrink-0">
              {s.pct.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
