"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePortfolioData } from "@/hooks/usePortfolioData";
import PortfolioValueChart from "@/components/charts/PortfolioValueChart";
import AllocationChart from "@/components/charts/AllocationChart";
import ValueDecompositionChart, { type DecompositionDataPoint } from "@/components/charts/ValueDecompositionChart";
import CumulativePriceEffectChart from "@/components/charts/CumulativePriceEffectChart";
import MetricLineChart from "@/components/charts/MetricLineChart";
import {
  BENCHMARKS,
  computeCashflowBenchmark,
  type BenchmarkTicker,
} from "@/lib/benchmark";

type Timeframe = "6M" | "1Y" | "2Y" | "All";
const TIMEFRAMES: Timeframe[] = ["6M", "1Y", "2Y", "All"];

interface Props {
  userId: string;
  refreshKey?: number;
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

export default function OverviewTab({ userId, refreshKey }: Props) {
  const { periods, holdingsByDate, fifoByIsin, loading } = usePortfolioData(userId, refreshKey);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("1Y");
  const [benchmarkTicker, setBenchmarkTicker] = useState<BenchmarkTicker | "">("");
  const [benchmarkPrices, setBenchmarkPrices] = useState<{ date: string; close: number }[]>([]);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);

  useEffect(() => {
    if (!benchmarkTicker || !periods.length) { setBenchmarkPrices([]); return; }
    const from = periods[0].date;
    const to = periods[periods.length - 1].date;
    setBenchmarkLoading(true);
    fetch(`/api/benchmark?ticker=${benchmarkTicker}&from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => setBenchmarkPrices(d.prices ?? []))
      .catch(() => setBenchmarkPrices([]))
      .finally(() => setBenchmarkLoading(false));
  }, [benchmarkTicker, periods.length, periods[0]?.date]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cashflow matching uses all periods so historical investments are accounted for.
  const benchmarkValues = useMemo(
    () => computeCashflowBenchmark(periods, benchmarkPrices),
    [periods, benchmarkPrices],
  );
  const benchmarkByDate = useMemo(
    () => new Map(benchmarkValues.map((b) => [b.date, b.value])),
    [benchmarkValues],
  );

  const dates = periods.map((p) => p.date);
  const inRange = selectedDate != null && dates.includes(selectedDate);
  const effectiveDate = inRange ? selectedDate : dates[dates.length - 1] ?? null;
  const selectedIdx = effectiveDate ? dates.indexOf(effectiveDate) : -1;

  // Charts show only the selected timeframe window, anchored to the selected statement date.
  const visiblePeriods = useMemo(() => {
    if (timeframe === "All" || !effectiveDate) return periods;
    const months = timeframe === "6M" ? 6 : timeframe === "1Y" ? 12 : 24;
    const cutoff = new Date(effectiveDate);
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return periods.filter((p) => p.date <= effectiveDate && p.date >= cutoffStr);
  }, [periods, timeframe, effectiveDate]);

  const currentPeriod = selectedIdx >= 0 ? periods[selectedIdx] : null;
  const prevPeriod = selectedIdx > 0 ? periods[selectedIdx - 1] : null;
  const currentHoldings = effectiveDate ? (holdingsByDate[effectiveDate] ?? []) : [];

  const decompositionData: DecompositionDataPoint[] = useMemo(() => {
    return visiblePeriods.map((p) => {
      const pIdx = periods.findIndex((x) => x.date === p.date);
      const prev = pIdx > 0 ? periods[pIdx - 1] : null;
      let topContributors: { name: string; effect: number }[] = [];
      if (prev) {
        const currHoldings = holdingsByDate[p.date] ?? [];
        const prevByIsin = new Map((holdingsByDate[prev.date] ?? []).map((h) => [h.isin, h]));
        topContributors = currHoldings
          .flatMap((curr) => {
            const prevH = prevByIsin.get(curr.isin);
            if (!prevH) return [];
            return [{ name: curr.ticker ?? curr.name, effect: prevH.shares * (curr.price_eur - prevH.price_eur) }];
          })
          .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))
          .slice(0, 5);
      }
      return { label: p.label, value: p.value, netInvested: p.netInvested, priceEffect: p.priceEffect, topContributors };
    });
  }, [visiblePeriods, periods, holdingsByDate]);

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading portfolio data…</p>;
  }

  if (periods.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <p className="text-lg font-medium">No data yet</p>
        <p className="text-muted-foreground text-sm">Upload a portfolio PDF to get started.</p>
      </div>
    );
  }

  const delta = currentPeriod && prevPeriod ? currentPeriod.value - prevPeriod.value : null;
  const deltaPct = delta != null && prevPeriod ? (delta / prevPeriod.value) * 100 : null;

  const chartData = visiblePeriods.map((p) => ({
    date: p.date,
    label: p.label,
    value: p.value,
    benchmark: benchmarkByDate.get(p.date),
  }));

  const activeBenchmarkLabel = BENCHMARKS.find((b) => b.ticker === benchmarkTicker)?.label;

  const allocationData = currentHoldings
    .map((h) => ({
      name: h.ticker ?? h.name,
      value: h.market_value_eur,
      color: "",
    }))
    .sort((a, b) => b.value - a.value);

  const positionsData = visiblePeriods.map((p) => ({ label: p.label, value: p.positions }));
  const avgSizeData = visiblePeriods.map((p) => ({ label: p.label, value: p.avgSize }));

  return (
    <div className="flex flex-col gap-6">
      {/* Controls row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Statement</label>
          <select
            value={effectiveDate ?? ""}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-md border px-3 py-1.5 text-sm bg-background"
          >
            {[...dates].reverse().map((d) => (
              <option key={d} value={d}>
                {new Date(d).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-0.5 rounded-md border p-0.5">
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                timeframe === t
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      {currentPeriod && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {/* Total Value */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Value</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{fmt(currentPeriod.value)}</p>
              {prevPeriod && (() => {
                const d = currentPeriod.value - prevPeriod.value;
                const pct = (d / prevPeriod.value) * 100;
                return (
                  <p className={`text-sm mt-0.5 ${d >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {fmt(d)} ({fmtPct(pct)}) from last statement
                  </p>
                );
              })()}
            </CardContent>
          </Card>

          {/* Positions */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Positions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{currentPeriod.positions}</p>
              {prevPeriod && (() => {
                const d = currentPeriod.positions - prevPeriod.positions;
                return (
                  <p className={`text-sm mt-0.5 ${d > 0 ? "text-green-600" : d < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                    {d >= 0 ? "+" : ""}{d} from last statement
                  </p>
                );
              })()}
            </CardContent>
          </Card>

          {/* Price Delta — tx-based: total_value - prev_total - buys + sells */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Price Delta</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-semibold ${currentPeriod.priceEffect >= 0 ? "text-green-600" : "text-red-500"}`}>
                {currentPeriod.priceEffect >= 0 ? "+" : ""}{fmt(currentPeriod.priceEffect)}
              </p>
              {prevPeriod && (
                <p className={`text-sm mt-0.5 ${currentPeriod.priceEffect >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {fmtPct((currentPeriod.priceEffect / prevPeriod.value) * 100)} from last statement
                </p>
              )}
            </CardContent>
          </Card>

          {/* Net Invested — tx-based: buys - sells for this period */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Net Invested</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">
                {currentPeriod.netInvested >= 0 ? "+" : ""}{fmt(currentPeriod.netInvested)}
              </p>
              {prevPeriod && (
                <p className={`text-sm mt-0.5 ${currentPeriod.netInvested >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {fmtPct((currentPeriod.netInvested / prevPeriod.value) * 100)} from last statement
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Portfolio value + Allocation */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium">Portfolio Value</CardTitle>
              <div className="flex items-center gap-1.5">
                {benchmarkLoading && (
                  <span className="text-xs text-muted-foreground">Loading…</span>
                )}
                <select
                  value={benchmarkTicker}
                  onChange={(e) => setBenchmarkTicker(e.target.value as BenchmarkTicker | "")}
                  className="rounded border px-2 py-0.5 text-xs bg-background text-muted-foreground"
                >
                  <option value="">No benchmark</option>
                  {BENCHMARKS.map((b) => (
                    <option key={b.ticker} value={b.ticker}>{b.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {chartData.length > 1 && effectiveDate ? (
              <PortfolioValueChart
                data={chartData}
                selectedDate={effectiveDate}
                benchmarkLabel={activeBenchmarkLabel}
              />
            ) : (
              <p className="text-xs text-muted-foreground py-8 text-center">
                Upload more statements to see the chart
              </p>
            )}
          </CardContent>
        </Card>
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

      {/* Value decomposition */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Portfolio Value Change Decomposition</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ValueDecompositionChart data={decompositionData} />
        </CardContent>
      </Card>

      {/* Cumulative price effect */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Cumulative Price Effect</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <CumulativePriceEffectChart data={visiblePeriods} />
        </CardContent>
      </Card>

      {/* Positions + Avg size */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Positions</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <MetricLineChart
              data={positionsData}
              formatter={(v) => v.toFixed(0)}
              color="#7c3aed"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Position Size</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <MetricLineChart
              data={avgSizeData}
              formatter={(v) => "€" + (v / 1000).toFixed(1) + "k"}
              color="#7c3aed"
            />
          </CardContent>
        </Card>
      </div>

      {/* Holdings table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Holdings — {effectiveDate ? new Date(effectiveDate).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : ""}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="px-3 py-2 text-left font-medium sm:px-4">Name</th>
                  <th className="px-3 py-2 text-right font-medium sm:px-4">Value</th>
                  <th className="px-3 py-2 text-right font-medium sm:px-4">Weight</th>
                  <th className="hidden px-3 py-2 text-right font-medium sm:table-cell sm:px-4">Shares</th>
                  <th className="hidden px-3 py-2 text-right font-medium sm:table-cell sm:px-4">Price</th>
                  <th className="hidden px-3 py-2 text-right font-medium md:table-cell sm:px-4">Avg Cost</th>
                  <th className="hidden px-3 py-2 text-right font-medium md:table-cell sm:px-4">Unreal. P&amp;L</th>
                  <th className="hidden px-3 py-2 text-right font-medium md:table-cell sm:px-4">P&amp;L %</th>
                </tr>
              </thead>
              <tbody>
                {currentHoldings
                  .sort((a, b) => b.market_value_eur - a.market_value_eur)
                  .map((h) => {
                    const fifo = fifoByIsin.get(h.isin);
                    const unrealizedPnL = fifo ? h.market_value_eur - fifo.totalCostRemaining : null;
                    const unrealizedPct = fifo && fifo.totalCostRemaining > 0
                      ? (unrealizedPnL! / fifo.totalCostRemaining) * 100
                      : null;
                    return (
                      <tr key={h.isin} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-3 py-2 sm:px-4">
                          <div className="font-medium">{h.name}</div>
                          <div className="text-xs text-muted-foreground">{h.ticker ?? h.isin}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums sm:px-4">{fmt(h.market_value_eur)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground sm:px-4">
                          {currentPeriod ? ((h.market_value_eur / currentPeriod.value) * 100).toFixed(1) + "%" : "—"}
                        </td>
                        <td className="hidden whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground sm:table-cell sm:px-4">
                          {h.shares.toLocaleString("de-DE", { maximumFractionDigits: 4 })}
                        </td>
                        <td className="hidden whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground sm:table-cell sm:px-4">
                          {fmt(h.price_eur)}
                        </td>
                        <td className="hidden whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground md:table-cell sm:px-4">
                          {fifo ? fmt(fifo.avgCostPerShare) : "—"}
                        </td>
                        <td className={`hidden whitespace-nowrap px-3 py-2 text-right tabular-nums md:table-cell sm:px-4 ${unrealizedPnL == null ? "text-muted-foreground" : unrealizedPnL >= 0 ? "text-green-600" : "text-red-500"}`}>
                          {unrealizedPnL == null ? "—" : (unrealizedPnL >= 0 ? "+" : "") + fmt(unrealizedPnL)}
                        </td>
                        <td className={`hidden whitespace-nowrap px-3 py-2 text-right tabular-nums md:table-cell sm:px-4 ${unrealizedPct == null ? "text-muted-foreground" : unrealizedPct >= 0 ? "text-green-600" : "text-red-500"}`}>
                          {unrealizedPct == null ? "—" : (unrealizedPct >= 0 ? "+" : "") + unrealizedPct.toFixed(1) + "%"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
