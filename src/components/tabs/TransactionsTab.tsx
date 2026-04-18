"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTransactions, type TxRow } from "@/hooks/useTransactions";

interface Props {
  userId: string;
}

const DIRECTION_LABELS: Record<string, string> = {
  buy: "Buy",
  sell: "Sell",
  dividend: "Dividend",
  interest: "Interest",
  deposit: "Deposit",
  withdrawal: "Withdrawal",
};

const DIRECTION_COLORS: Record<string, string> = {
  buy: "bg-green-100 text-green-800",
  sell: "bg-red-100 text-red-800",
  dividend: "bg-blue-100 text-blue-800",
  interest: "bg-amber-100 text-amber-800",
  deposit: "bg-teal-100 text-teal-800",
  withdrawal: "bg-orange-100 text-orange-800",
};

function fmtEur(n: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function exportCsv(rows: TxRow[]) {
  const headers = ["Date", "Name", "ISIN", "Direction", "Shares", "Price (€)", "Amount (€)", "P&L (€)", "Approx"];
  const lines = rows.map((r) => [
    r.date,
    `"${r.name}"`,
    r.isin ?? "",
    r.direction,
    r.shares ?? "",
    r.price_eur ?? "",
    r.amount_eur,
    r.realizedPnL ?? "",
    r.approx ? "yes" : "",
  ].join(","));
  const csv = [headers.join(","), ...lines].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "transactions.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function TransactionsTab({ userId }: Props) {
  const { transactions, loading } = useTransactions(userId);
  const [search, setSearch] = useState("");
  const [dirFilter, setDirFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const directions = useMemo(() => {
    const set = new Set(transactions.map((t) => t.direction));
    return ["all", ...Array.from(set).sort()];
  }, [transactions]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return transactions.filter((t) => {
      if (dirFilter !== "all" && t.direction !== dirFilter) return false;
      if (dateFrom && t.date < dateFrom) return false;
      if (dateTo && t.date > dateTo) return false;
      if (q && !t.name.toLowerCase().includes(q) && !(t.isin ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [transactions, search, dirFilter, dateFrom, dateTo]);

  if (loading) return <p className="text-muted-foreground text-sm">Loading transactions…</p>;

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <p className="text-lg font-medium">No transactions yet</p>
        <p className="text-muted-foreground text-sm">Upload a transaction PDF to get started.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search name or ISIN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border px-3 py-1.5 text-sm bg-background w-48"
        />
        <select
          value={dirFilter}
          onChange={(e) => setDirFilter(e.target.value)}
          className="rounded-md border px-3 py-1.5 text-sm bg-background"
        >
          {directions.map((d) => (
            <option key={d} value={d}>
              {d === "all" ? "All types" : DIRECTION_LABELS[d] ?? d}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-md border px-3 py-1.5 text-sm bg-background"
        />
        <span className="text-muted-foreground text-sm">→</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-md border px-3 py-1.5 text-sm bg-background"
        />
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} rows</span>
        <button
          onClick={() => exportCsv(filtered)}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
        >
          ↓ CSV
        </button>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Transactions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="px-3 py-2 text-left font-medium sm:px-4">Date</th>
                  <th className="px-3 py-2 text-left font-medium sm:px-4">Name</th>
                  <th className="px-3 py-2 text-left font-medium sm:px-4">Type</th>
                  <th className="hidden px-3 py-2 text-right font-medium sm:table-cell sm:px-4">Shares</th>
                  <th className="hidden px-3 py-2 text-right font-medium sm:table-cell sm:px-4">Price</th>
                  <th className="px-3 py-2 text-right font-medium sm:px-4">Amount</th>
                  <th className="hidden px-3 py-2 text-right font-medium md:table-cell sm:px-4">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground tabular-nums sm:px-4">
                      {fmtDate(t.date)}
                    </td>
                    <td className="px-3 py-2 sm:px-4 max-w-[160px] sm:max-w-none">
                      <div className="font-medium truncate">{t.name}</div>
                      {t.isin && <div className="text-xs text-muted-foreground">{t.isin}</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 sm:px-4">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${DIRECTION_COLORS[t.direction] ?? "bg-muted text-muted-foreground"}`}>
                        {DIRECTION_LABELS[t.direction] ?? t.direction}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground sm:table-cell sm:px-4">
                      {t.shares != null
                        ? (t.approx ? "~" : "") + t.shares.toLocaleString("de-DE", { maximumFractionDigits: 6 })
                        : "—"}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground sm:table-cell sm:px-4">
                      {t.price_eur != null ? fmtEur(t.price_eur) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums sm:px-4">
                      {t.approx && <span className="text-muted-foreground mr-0.5">~</span>}
                      {fmtEur(t.amount_eur)}
                    </td>
                    <td className={`hidden whitespace-nowrap px-3 py-2 text-right tabular-nums md:table-cell sm:px-4 ${t.realizedPnL == null ? "text-muted-foreground" : t.realizedPnL >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {t.realizedPnL == null
                        ? "—"
                        : (t.realizedPnL >= 0 ? "+" : "") + fmtEur(t.realizedPnL)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
