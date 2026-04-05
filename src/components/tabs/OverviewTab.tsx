"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PortfolioValueChart from "@/components/charts/PortfolioValueChart";
import AllocationChart from "@/components/charts/AllocationChart";

interface Holding {
  id: string;
  user_id: string;
  statement_date: string;
  isin: string;
  name: string;
  ticker: string | null;
  shares: number;
  price_eur: number;
  market_value_eur: number;
  depot: string | null;
  created_at: string;
}

interface Props {
  userId: string;
}

interface StatementSummary {
  date: string;
  totalValue: number;
  holdings: Holding[];
}

function fmt(n: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(n: number) {
  return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
}

function monthLabel(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
  });
}

export default function OverviewTab({ userId }: Props) {
  const supabase = createClient();
  const [statements, setStatements] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [summary, setSummary] = useState<StatementSummary | null>(null);
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [allTotals, setAllTotals] = useState<{ date: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);

  // Load all holdings once — derive statements + totals from it
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("holdings")
        .select("statement_date, market_value_eur")
        .eq("user_id", userId)
        .order("statement_date", { ascending: true })
        .returns<{ statement_date: string; market_value_eur: number }[]>();

      if (!data) return;

      // Aggregate totals per date
      const totalsMap: Record<string, number> = {};
      for (const r of data) {
        totalsMap[r.statement_date] = (totalsMap[r.statement_date] ?? 0) + r.market_value_eur;
      }
      const dates = Object.keys(totalsMap).sort();
      const totals = dates.map((d) => ({ date: d, value: totalsMap[d] }));

      setStatements(dates);
      setAllTotals(totals);
      if (dates.length > 0) setSelectedDate(dates[dates.length - 1]);
    }
    load();
  }, [userId]);

  // Load full holdings for selected date
  useEffect(() => {
    if (!selectedDate) return;
    setLoading(true);

    async function load() {
      const { data } = await supabase
        .from("holdings")
        .select("*")
        .eq("user_id", userId)
        .eq("statement_date", selectedDate!)
        .order("market_value_eur", { ascending: false })
        .returns<Holding[]>();

      if (!data) return;
      const total = data.reduce((s, r) => s + r.market_value_eur, 0);
      setSummary({ date: selectedDate!, totalValue: total, holdings: data });
      setLoading(false);
    }
    load();

    // Previous statement delta
    const idx = statements.indexOf(selectedDate);
    if (idx > 0) {
      const prevDate = statements[idx - 1];
      async function loadPrev() {
        const { data } = await supabase
          .from("holdings")
          .select("market_value_eur")
          .eq("user_id", userId)
          .eq("statement_date", prevDate)
          .returns<{ market_value_eur: number }[]>();
        if (data) setPrevValue(data.reduce((s, r) => s + r.market_value_eur, 0));
      }
      loadPrev();
    } else {
      setPrevValue(null);
    }
  }, [selectedDate, statements, userId]);

  if (loading && !summary) {
    return <p className="text-muted-foreground text-sm">Loading portfolio data…</p>;
  }

  if (!summary && statements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <p className="text-lg font-medium">No data yet</p>
        <p className="text-muted-foreground text-sm">Upload a portfolio PDF to get started.</p>
      </div>
    );
  }

  const delta = prevValue != null && summary ? summary.totalValue - prevValue : null;
  const deltaPct = delta != null && prevValue ? (delta / prevValue) * 100 : null;

  const chartData = allTotals.map((t) => ({
    date: t.date,
    label: monthLabel(t.date),
    value: t.value,
  }));

  const allocationData = summary?.holdings.map((h) => ({
    name: h.ticker ?? h.name,
    value: h.market_value_eur,
    color: "",
  })) ?? [];

  return (
    <div className="flex flex-col gap-6">
      {/* Statement selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-muted-foreground">Statement</label>
        <select
          value={selectedDate ?? ""}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="rounded-md border px-3 py-1.5 text-sm bg-background"
        >
          {[...statements].reverse().map((d) => (
            <option key={d} value={d}>
              {new Date(d).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
            </option>
          ))}
        </select>
      </div>

      {/* KPI cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Portfolio Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{fmt(summary.totalValue)}</p>
              {delta != null && deltaPct != null && (
                <p className={`text-sm mt-0.5 ${delta >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {fmt(delta)} ({fmtPct(deltaPct)})
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Positions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{summary.holdings.length}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Portfolio value over time */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Portfolio Value</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {chartData.length > 1 && selectedDate ? (
              <PortfolioValueChart data={chartData} selectedDate={selectedDate} />
            ) : (
              <p className="text-xs text-muted-foreground py-8 text-center">
                Upload more statements to see the chart
              </p>
            )}
          </CardContent>
        </Card>

        {/* Allocation donut */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Allocation</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {allocationData.length > 0 ? (
              <AllocationChart data={allocationData} />
            ) : (
              <p className="text-xs text-muted-foreground py-8 text-center">No data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Holdings table */}
      {summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Holdings</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="px-4 py-2 text-left font-medium">Name</th>
                  <th className="px-4 py-2 text-right font-medium">Value (€)</th>
                  <th className="px-4 py-2 text-right font-medium">Weight</th>
                  <th className="px-4 py-2 text-right font-medium">Shares</th>
                  <th className="px-4 py-2 text-right font-medium">Price (€)</th>
                </tr>
              </thead>
              <tbody>
                {summary.holdings.map((h) => (
                  <tr key={h.isin} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <div className="font-medium">{h.name}</div>
                      <div className="text-xs text-muted-foreground">{h.ticker ?? h.isin}</div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(h.market_value_eur)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {((h.market_value_eur / summary.totalValue) * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {h.shares.toLocaleString("de-DE", { maximumFractionDigits: 4 })}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {fmt(h.price_eur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
