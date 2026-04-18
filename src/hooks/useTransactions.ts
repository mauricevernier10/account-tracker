"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { computeFifo } from "@/lib/fifo";

export interface TxRow {
  id?: string;
  date: string;
  isin: string | null;
  name: string;
  direction: string;
  shares: number | null;
  price_eur: number | null;
  amount_eur: number;
  approx: boolean;
  tx_type: string | null;
  // FIFO-derived, only set for sells
  realizedPnL: number | null;
  costBasis: number | null;
}

export function useTransactions(userId: string) {
  const supabase = createClient();
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("transactions")
        .select("date, isin, name, direction, shares, price_eur, amount_eur, approx, tx_type")
        .eq("user_id", userId)
        .order("date", { ascending: false })
        .returns<Omit<TxRow, "realizedPnL" | "costBasis">[]>();

      if (!data) { setLoading(false); return; }

      // Build FIFO per ISIN from buy/sell (ascending order for correct lot matching)
      const buySells = [...data]
        .filter((t) => (t.direction === "buy" || t.direction === "sell") && t.isin && t.shares != null && t.shares > 0)
        .sort((a, b) => a.date.localeCompare(b.date));

      const txsByIsin = new Map<string, typeof buySells>();
      for (const tx of buySells) {
        if (!tx.isin) continue;
        if (!txsByIsin.has(tx.isin)) txsByIsin.set(tx.isin, []);
        txsByIsin.get(tx.isin)!.push(tx);
      }

      const fifoByIsin = new Map<string, ReturnType<typeof computeFifo>>();
      for (const [isin, txs] of txsByIsin) {
        fifoByIsin.set(isin, computeFifo(txs.map((t) => ({
          date: t.date,
          direction: t.direction as "buy" | "sell",
          qty: t.shares!,
          amount: Math.abs(t.amount_eur),
        }))));
      }

      // Assign FIFO P&L to sell rows (sequential match within each ISIN)
      const sellCounters = new Map<string, number>();
      const rows: TxRow[] = data.map((tx) => {
        if (tx.direction !== "sell" || !tx.isin) return { ...tx, realizedPnL: null, costBasis: null };
        const fifo = fifoByIsin.get(tx.isin);
        if (!fifo) return { ...tx, realizedPnL: null, costBasis: null };
        const idx = sellCounters.get(tx.isin) ?? 0;
        sellCounters.set(tx.isin, idx + 1);
        // Counters run in date-desc order (data is desc), so reverse index
        const event = fifo.realizedEvents[fifo.realizedEvents.length - 1 - idx];
        return {
          ...tx,
          realizedPnL: event?.pnl ?? null,
          costBasis: event?.costBasis ?? null,
        };
      });

      setTransactions(rows);
      setLoading(false);
    }
    load();
  }, [userId]);

  return { transactions, loading };
}
