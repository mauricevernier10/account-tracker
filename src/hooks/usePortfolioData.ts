"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface Holding {
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

export interface Transaction {
  date: string;
  isin: string | null;
  direction: string;
  amount_eur: number;
}

export interface PeriodData {
  date: string;
  label: string;
  value: number;
  positions: number;
  avgSize: number;
  // Per-period flows (transaction-based, matches Streamlit exactly)
  // priceEffect = value − prevValue − buys + sells
  // netInvested = buys − sells
  priceEffect: number;
  netInvested: number;
  // Cumulative from inception
  cumNetInvested: number;
  cumPriceEffect: number;
}

function monthLabel(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
  });
}

export function usePortfolioData(userId: string) {
  const supabase = createClient();
  const [periods, setPeriods] = useState<PeriodData[]>([]);
  const [holdingsByDate, setHoldingsByDate] = useState<Record<string, Holding[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: holdings }, { data: txns }] = await Promise.all([
        supabase
          .from("holdings")
          .select("*")
          .eq("user_id", userId)
          .order("statement_date", { ascending: true })
          .returns<Holding[]>(),
        supabase
          .from("transactions")
          .select("date, isin, direction, amount_eur")
          .eq("user_id", userId)
          .in("direction", ["buy", "sell"])
          .order("date", { ascending: true })
          .returns<Transaction[]>(),
      ]);

      if (!holdings) return;

      const allTxns = txns ?? [];

      // Group holdings by date
      const byDate: Record<string, Holding[]> = {};
      for (const h of holdings) {
        if (!byDate[h.statement_date]) byDate[h.statement_date] = [];
        byDate[h.statement_date].push(h);
      }
      const dates = Object.keys(byDate).sort();

      const result: PeriodData[] = [];
      let cumNetInvested = 0;
      let cumPriceEffect = 0;

      for (let i = 0; i < dates.length; i++) {
        const d = dates[i];
        const value = byDate[d].reduce((s, h) => s + h.market_value_eur, 0);

        // Transactions for this period: from strictly after previous statement
        // date up to and including current. Period 0 uses all tx up to dates[0].
        const dPrev = i > 0 ? dates[i - 1] : null;
        const periodTxns = allTxns.filter((tx) =>
          dPrev ? tx.date > dPrev && tx.date <= d : tx.date <= d
        );

        const buys  = periodTxns
          .filter((tx) => tx.direction === "buy")
          .reduce((s, tx) => s + Math.abs(tx.amount_eur), 0);
        const sells = periodTxns
          .filter((tx) => tx.direction === "sell")
          .reduce((s, tx) => s + Math.abs(tx.amount_eur), 0);

        const netInvested = buys - sells;
        const prevValue   = dPrev
          ? byDate[dPrev].reduce((s, h) => s + h.market_value_eur, 0)
          : netInvested; // period 0: priceEffect = value − netInvested
        const priceEffect = Math.round((value - prevValue - buys + sells) * 100) / 100;

        cumNetInvested += netInvested;
        cumPriceEffect += priceEffect;

        result.push({
          date: d,
          label: monthLabel(d),
          value,
          positions: byDate[d].length,
          avgSize: value / byDate[d].length,
          priceEffect,
          netInvested,
          cumNetInvested,
          cumPriceEffect,
        });
      }

      setPeriods(result);
      setHoldingsByDate(byDate);
      setLoading(false);
    }

    load();
  }, [userId]);

  return { periods, holdingsByDate, loading };
}
