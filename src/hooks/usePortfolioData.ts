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
  isin: string;
  direction: string;
  amount_eur: number;
}

export interface PeriodData {
  date: string;
  label: string;
  value: number;
  positions: number;
  avgSize: number;
  // KPI card values — transaction-based, matches Streamlit exactly
  // price_delta  = total_value - prev_total - buys + sells
  // net_invested = buys - sells  (for the period)
  priceDelta: number;
  netInvested: number;
  // Chart decomposition — share×price based (for value decomposition / cumulative charts)
  priceEffect: number;     // shares_prev × (price_curr − price_prev)
  investEffect: number;    // (shares_curr − shares_prev) × price_curr
  // Cumulative (chart-based)
  cumInvested: number;
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

      // Group by date
      const byDate: Record<string, Holding[]> = {};
      for (const h of holdings) {
        if (!byDate[h.statement_date]) byDate[h.statement_date] = [];
        byDate[h.statement_date].push(h);
      }
      const dates = Object.keys(byDate).sort();

      // Build lookup: date → isin → holding
      const holdingMap: Record<string, Record<string, Holding>> = {};
      for (const d of dates) {
        holdingMap[d] = {};
        for (const h of byDate[d]) holdingMap[d][h.isin] = h;
      }

      const result: PeriodData[] = [];
      let cumInvested = 0;
      let cumPriceEffect = 0;

      for (let i = 0; i < dates.length; i++) {
        const d = dates[i];
        const value = byDate[d].reduce((s, h) => s + h.market_value_eur, 0);

        if (i === 0) {
          cumInvested += value;
          result.push({
            date: d,
            label: monthLabel(d),
            value,
            positions: byDate[d].length,
            avgSize: value / byDate[d].length,
            priceDelta: 0,
            netInvested: value,
            priceEffect: 0,
            investEffect: value,
            cumInvested,
            cumPriceEffect,
          });
          continue;
        }

        const dPrev = dates[i - 1];
        const prevValue = byDate[dPrev].reduce((s, h) => s + h.market_value_eur, 0);
        const prev = holdingMap[dPrev];
        const curr = holdingMap[d];

        // ── Transaction-based KPI values (matches Streamlit exactly) ──────────
        const periodTxns = (txns ?? []).filter(
          (tx) => tx.date > dPrev && tx.date <= d
        );
        const buys  = periodTxns
          .filter((tx) => tx.direction === "buy")
          .reduce((s, tx) => s + Math.abs(tx.amount_eur), 0);
        const sells = periodTxns
          .filter((tx) => tx.direction === "sell")
          .reduce((s, tx) => s + Math.abs(tx.amount_eur), 0);

        const priceDelta  = Math.round((value - prevValue - buys + sells) * 100) / 100;
        const netInvested = Math.round((buys - sells) * 100) / 100;

        // ── Share×price decomposition for charts ──────────────────────────────
        const allIsins = new Set([...Object.keys(prev), ...Object.keys(curr)]);
        let priceEffect = 0;
        let investEffect = 0;
        for (const isin of allIsins) {
          const sharesPrev = prev[isin]?.shares ?? 0;
          const pricePrev  = prev[isin]?.price_eur ?? 0;
          const sharesCurr = curr[isin]?.shares ?? 0;
          const priceCurr  = curr[isin]?.price_eur ?? pricePrev;
          priceEffect  += sharesPrev * (priceCurr - pricePrev);
          investEffect += (sharesCurr - sharesPrev) * priceCurr;
        }
        priceEffect  = Math.round(priceEffect * 100) / 100;
        investEffect = Math.round(investEffect * 100) / 100;

        cumInvested    += netInvested;
        cumPriceEffect += priceDelta;

        result.push({
          date: d,
          label: monthLabel(d),
          value,
          positions: byDate[d].length,
          avgSize: value / byDate[d].length,
          priceDelta,
          netInvested,
          priceEffect,
          investEffect,
          cumInvested,
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
