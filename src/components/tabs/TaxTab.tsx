"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTransactions } from "@/hooks/useTransactions";

interface Props {
  userId: string;
}

const TAX_RATE = 0.26375; // 25% KapESt + 5.5% Soli

function fmtEur(n: number, showSign = false) {
  const s = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
  if (showSign) return (n >= 0 ? "+" : "−") + s;
  return n < 0 ? "−" + s : s;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${color ?? ""}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function TaxTab({ userId }: Props) {
  const { transactions, loading } = useTransactions(userId);
  const [fsa, setFsa] = useState(1000);

  const years = useMemo(() => {
    const set = new Set(transactions.map((t) => t.date.slice(0, 4)));
    return Array.from(set).sort().reverse();
  }, [transactions]);

  const [year, setYear] = useState<string>(() => {
    const y = new Date().getFullYear().toString();
    return y;
  });

  const effectiveYear = years.includes(year) ? year : (years[0] ?? year);

  const {
    sells, dividends, interest,
    realizedGains, realizedLosses, netSells,
    totalDividends, totalInterest,
    grossTaxable, fsaUsed, netTaxable, estimatedTax,
    events,
  } = useMemo(() => {
    const yearTxns = transactions.filter((t) => t.date.startsWith(effectiveYear));

    const sells = yearTxns.filter((t) => t.direction === "sell");
    const dividends = yearTxns.filter((t) => t.direction === "dividend");
    const interest = yearTxns.filter((t) => t.direction === "interest");

    const realizedGains = sells
      .filter((t) => (t.realizedPnL ?? 0) > 0)
      .reduce((s, t) => s + (t.realizedPnL ?? 0), 0);
    const realizedLosses = sells
      .filter((t) => (t.realizedPnL ?? 0) < 0)
      .reduce((s, t) => s + (t.realizedPnL ?? 0), 0);
    const netSells = realizedGains + realizedLosses;

    const totalDividends = dividends.reduce((s, t) => s + t.amount_eur, 0);
    const totalInterest = interest.reduce((s, t) => s + t.amount_eur, 0);

    // Losses from sells can offset dividend/interest income within the same year
    const grossTaxable = Math.max(0, netSells + totalDividends + totalInterest);
    const fsaUsed = Math.min(grossTaxable, Math.max(0, fsa));
    const netTaxable = Math.max(0, grossTaxable - fsaUsed);
    const estimatedTax = netTaxable * TAX_RATE;

    // All taxable events sorted ascending
    const events = [
      ...sells.filter((t) => t.realizedPnL != null).map((t) => ({
        date: t.date,
        type: "sell" as const,
        name: t.name,
        isin: t.isin,
        shares: t.shares,
        proceeds: t.amount_eur,
        costBasis: t.costBasis,
        pnl: t.realizedPnL!,
      })),
      ...dividends.map((t) => ({
        date: t.date,
        type: "dividend" as const,
        name: t.name,
        isin: t.isin,
        shares: null,
        proceeds: t.amount_eur,
        costBasis: null,
        pnl: t.amount_eur,
      })),
      ...interest.map((t) => ({
        date: t.date,
        type: "interest" as const,
        name: t.name,
        isin: t.isin,
        shares: null,
        proceeds: t.amount_eur,
        costBasis: null,
        pnl: t.amount_eur,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    return {
      sells, dividends, interest,
      realizedGains, realizedLosses, netSells,
      totalDividends, totalInterest,
      grossTaxable, fsaUsed, netTaxable, estimatedTax,
      events,
    };
  }, [transactions, effectiveYear, fsa]);

  if (loading) return <p className="text-muted-foreground text-sm">Loading…</p>;

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <p className="text-lg font-medium">No transaction data</p>
        <p className="text-muted-foreground text-sm">Upload a transaction PDF to get started.</p>
      </div>
    );
  }

  const fsaPct = fsa > 0 ? Math.min(100, (fsaUsed / fsa) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Tax year</label>
          <select
            value={effectiveYear}
            onChange={(e) => setYear(e.target.value)}
            className="rounded-md border px-3 py-1.5 text-sm bg-background"
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Freistellungsauftrag</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
            <input
              type="number"
              min={0}
              step={100}
              value={fsa}
              onChange={(e) => setFsa(Math.max(0, Number(e.target.value)))}
              className="rounded-md border pl-7 pr-3 py-1.5 text-sm bg-background w-28"
            />
          </div>
        </div>
      </div>

      {/* Income breakdown */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Income breakdown</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            label="Realized gains"
            value={fmtEur(realizedGains)}
            sub={`${sells.filter((t) => (t.realizedPnL ?? 0) > 0).length} sell events`}
            color="text-green-600"
          />
          <KpiCard
            label="Realized losses"
            value={fmtEur(realizedLosses)}
            sub={`${sells.filter((t) => (t.realizedPnL ?? 0) < 0).length} sell events`}
            color={realizedLosses < 0 ? "text-red-500" : undefined}
          />
          <KpiCard
            label="Dividends"
            value={fmtEur(totalDividends)}
            sub={`${dividends.length} payments`}
          />
          <KpiCard
            label="Interest"
            value={fmtEur(totalInterest)}
            sub={`${interest.length} payments`}
          />
        </div>
      </div>

      {/* Tax summary */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Tax summary</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard
            label="Gross taxable"
            value={fmtEur(grossTaxable)}
            sub="After loss netting"
          />
          <KpiCard
            label="Net taxable"
            value={fmtEur(netTaxable)}
            sub={`After €${fsa.toLocaleString("de-DE")} FSA`}
          />
          <KpiCard
            label="Estimated tax"
            value={fmtEur(estimatedTax)}
            sub="26.375% (KapESt + Soli)"
            color={estimatedTax > 0 ? "text-red-500" : undefined}
          />
        </div>

        {/* FSA progress bar */}
        <div className="mt-3 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Freistellungsauftrag usage
            </p>
            <p className="text-sm font-medium tabular-nums">
              {fmtEur(fsaUsed)}
              <span className="text-muted-foreground font-normal"> / {fmtEur(fsa)}</span>
            </p>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${fsaPct >= 100 ? "bg-red-500" : fsaPct >= 80 ? "bg-amber-500" : "bg-green-500"}`}
              style={{ width: `${fsaPct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {fsaPct >= 100
              ? `Fully used — €${Math.max(0, grossTaxable - fsa).toLocaleString("de-DE", { maximumFractionDigits: 0 })} above allowance`
              : `€${Math.max(0, fsa - fsaUsed).toLocaleString("de-DE", { maximumFractionDigits: 0 })} remaining`}
          </p>
        </div>
      </div>

      {/* Taxable events table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Taxable events — {effectiveYear}
            <span className="font-normal text-muted-foreground ml-2">({events.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground px-4 py-6 text-center">
              No taxable events in {effectiveYear}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="px-3 py-2 text-left font-medium sm:px-4">Date</th>
                    <th className="px-3 py-2 text-left font-medium sm:px-4">Name</th>
                    <th className="px-3 py-2 text-left font-medium sm:px-4">Type</th>
                    <th className="hidden px-3 py-2 text-right font-medium sm:table-cell sm:px-4">Proceeds</th>
                    <th className="hidden px-3 py-2 text-right font-medium sm:table-cell sm:px-4">Cost Basis</th>
                    <th className="px-3 py-2 text-right font-medium sm:px-4">P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground tabular-nums sm:px-4">
                        {fmtDate(e.date)}
                      </td>
                      <td className="px-3 py-2 sm:px-4 max-w-[140px] sm:max-w-none">
                        <div className="font-medium truncate">{e.name}</div>
                        {e.isin && <div className="text-xs text-muted-foreground">{e.isin}</div>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 sm:px-4">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          e.type === "sell" ? "bg-red-100 text-red-800"
                          : e.type === "dividend" ? "bg-blue-100 text-blue-800"
                          : "bg-amber-100 text-amber-800"
                        }`}>
                          {e.type === "sell" ? "Sell" : e.type === "dividend" ? "Dividend" : "Interest"}
                        </span>
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground sm:table-cell sm:px-4">
                        {fmtEur(e.proceeds)}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground sm:table-cell sm:px-4">
                        {e.costBasis != null ? fmtEur(e.costBasis) : "—"}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums font-medium sm:px-4 ${e.pnl >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {fmtEur(e.pnl, true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30">
                    <td colSpan={3} className="px-3 py-2 text-xs font-medium text-muted-foreground sm:px-4">
                      Total
                    </td>
                    <td className="hidden px-3 py-2 text-right text-xs tabular-nums font-medium sm:table-cell sm:px-4">
                      {fmtEur(events.reduce((s, e) => s + e.proceeds, 0))}
                    </td>
                    <td className="hidden px-3 py-2 text-right text-xs tabular-nums text-muted-foreground sm:table-cell sm:px-4">
                      {fmtEur(events.filter((e) => e.costBasis != null).reduce((s, e) => s + (e.costBasis ?? 0), 0))}
                    </td>
                    <td className={`px-3 py-2 text-right text-xs tabular-nums font-medium sm:px-4 ${grossTaxable >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {fmtEur(events.reduce((s, e) => s + e.pnl, 0), true)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Estimates only. Assumes 26.375% flat rate (25% KapESt + 5.5% Soli). Does not account for
        ETF Teilfreistellung, Kirchensteuer, foreign withholding credits, or loss carryforwards.
      </p>
    </div>
  );
}
