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
  Legend,
} from "recharts";

interface DataPoint {
  date: string;
  label: string;
  value: number;
  benchmark?: number;
}

interface Props {
  data: DataPoint[];
  selectedDate: string;
  benchmarkLabel?: string;
}

function fmtEur(n: number) {
  return "€" + new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n);
}

function CustomTooltip({ active, payload, benchmarkLabel }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const portfolioEntry = payload.find((p: any) => p.dataKey === "value");
  const benchmarkEntry = payload.find((p: any) => p.dataKey === "benchmark");
  const diff =
    portfolioEntry?.value != null && benchmarkEntry?.value != null
      ? portfolioEntry.value - benchmarkEntry.value
      : null;

  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-sm space-y-0.5">
      <p className="font-medium mb-1">{d.label}</p>
      <p style={{ color: "#2563eb" }}>Portfolio: {fmtEur(d.value)}</p>
      {benchmarkEntry?.value != null && (
        <>
          <p style={{ color: "#9ca3af" }}>
            {benchmarkLabel ?? "Benchmark"}: {fmtEur(benchmarkEntry.value)}
          </p>
          {diff != null && (
            <p className={`text-xs font-medium pt-0.5 ${diff >= 0 ? "text-green-600" : "text-red-500"}`}>
              {diff >= 0 ? "+" : ""}{fmtEur(diff)} vs benchmark
            </p>
          )}
        </>
      )}
    </div>
  );
}

function CustomDot(props: any) {
  const { cx, cy, payload, selectedDate } = props;
  if (payload?.date !== selectedDate) return null;
  return <circle cx={cx} cy={cy} r={5} fill="#2563eb" stroke="#2563eb" strokeWidth={2} />;
}

export default function PortfolioValueChart({ data, selectedDate, benchmarkLabel }: Props) {
  const allValues = data.flatMap((d) =>
    [d.value, d.benchmark].filter((v): v is number => v != null)
  );
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const padding = (max - min) * 0.1 || max * 0.1;
  const hasBenchmark = data.some((d) => d.benchmark != null);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          interval={0}
          angle={-35}
          textAnchor="end"
          height={48}
        />
        <YAxis
          tickFormatter={(v) => "€" + (v / 1000).toFixed(0) + "k"}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          width={52}
          domain={[min - padding, max + padding]}
        />
        <Tooltip content={<CustomTooltip benchmarkLabel={benchmarkLabel} />} />
        {hasBenchmark && (
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
            formatter={(value) => (value === "value" ? "Portfolio" : (benchmarkLabel ?? "Benchmark"))}
          />
        )}
        <ReferenceLine
          x={data.find((d) => d.date === selectedDate)?.label}
          stroke="#2563eb"
          strokeDasharray="4 2"
          strokeOpacity={0.4}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#2563eb"
          strokeWidth={2}
          dot={<CustomDot selectedDate={selectedDate} />}
          activeDot={{ r: 5, fill: "#2563eb" }}
        />
        {hasBenchmark && (
          <Line
            type="monotone"
            dataKey="benchmark"
            stroke="#9ca3af"
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 4, fill: "#9ca3af" }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
