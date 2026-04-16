"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePortfolioData } from "@/hooks/usePortfolioData";
import PortfolioValueChart from "@/components/charts/PortfolioValueChart";
import AllocationChart from "@/components/charts/AllocationChart";
import ValueDecompositionChart from "@/components/charts/ValueDecompositionChart";
import CumulativePriceEffectChart from "@/components/charts/CumulativePriceEffectChart";
import MetricLineChart from "@/components/charts/MetricLineChart";

interface Props {
  userId: string;
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

export default function OverviewTab({ userId }: Props) {
  const { periods, holdingsByDate, loading } = usePortfolioData(userId);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const dates = periods.map((p) => p.date);
  const effectiveDate = selectedDate ?? dates[dates.length - 1] ?? null;
  const selectedIdx = effectiveDate ? dates.indexOf(effectiveDate) : -1;

  const currentPeriod = selectedIdx >= 0 ? periods[selectedIdx] : null;
  const prevPeriod = selectedIdx > 0 ? periods[selectedIdx - 1] : null;
  const currentHoldings = effectiveDate ? (holdingsByDate[effectiveDate] ?? []) : [];

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

  const chartData = periods.map((p) => ({
    date: p.date,
    label: p.label,
    value: p.value,
  }));

  const allocationData = currentHoldings.map((h) => ({
    name: h.ticker ?? h.name,
    value: h.market_value_eur,
    color: "",
  }));

  const positionsData = periods.map((p) => ({ label: p.label, value: p.positions }));
  const avgSizeData = periods.map((p) => ({ label: p.label, value: p.avgSize }));

  return (
    <div className="flex flex-col gap-6">
      {/* Statement selector */}
      <div className="flex items-center gap-3">
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
            <CardTitle className="text-sm font-medium">Portfolio Value</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {chartData.length > 1 && effectiveDate ? (
              <PortfolioValueChart data={chartData} selectedDate={effectiveDate} />
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
          <CardTitle className="text-sm font-medium">Value Decomposition — Price Effect vs Net Invested</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ValueDecompositionChart data={periods} />
        </CardContent>
      </Card>

      {/* Cumulative price effect */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Cumulative Price Effect</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <CumulativePriceEffectChart data={periods} />
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs">
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-right font-medium">Value</th>
                <th className="px-4 py-2 text-right font-medium">Weight</th>
                <th className="px-4 py-2 text-right font-medium">Shares</th>
                <th className="px-4 py-2 text-right font-medium">Price</th>
              </tr>
            </thead>
            <tbody>
              {currentHoldings
                .sort((a, b) => b.market_value_eur - a.market_value_eur)
                .map((h) => (
                  <tr key={h.isin} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <div className="font-medium">{h.name}</div>
                      <div className="text-xs text-muted-foreground">{h.ticker ?? h.isin}</div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(h.market_value_eur)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {currentPeriod ? ((h.market_value_eur / currentPeriod.value) * 100).toFixed(1) + "%" : "—"}
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
    </div>
  );
}
