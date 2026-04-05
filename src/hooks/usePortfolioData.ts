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
  direction: "buy" | "sell";
  amount_eur: number;
}

export interface PeriodData {
  date: string;
  label: string;
  value: number;
  positions: number;
  avgSize: number;
  // Per-period
  netInvested: number;      // (shares_curr - shares_prev) × price_curr  — share count changes
  priceEffect: number;      // shares_prev × (price_curr - price_prev)   — pure price movement
  // Cumulative
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
      const { data: holdings } = await supabase
        .from("holdings")
        .select("*")
        .eq("user_id", userId)
        .order("statement_date", { ascending: true })
        .returns<Holding[]>();

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
          // First statement: entire value is initial investment, price effect = 0
          cumInvested += value;
          result.push({
            date: d,
            label: monthLabel(d),
            value,
            positions: byDate[d].length,
            avgSize: value / byDate[d].length,
            netInvested: value,
            priceEffect: 0,
            cumInvested,
            cumPriceEffect,
          });
          continue;
        }

        const dPrev = dates[i - 1];
        const prev = holdingMap[dPrev];
        const curr = holdingMap[d];

        // Union of all ISINs in either statement
        const allIsins = new Set([...Object.keys(prev), ...Object.keys(curr)]);

        let periodPriceEffect = 0;
        let periodNetInvested = 0;

        for (const isin of allIsins) {
          const sharesPrev = prev[isin]?.shares ?? 0;
          const pricePrev  = prev[isin]?.price_eur ?? 0;
          const sharesCurr = curr[isin]?.shares ?? 0;
          // For exited positions, use pricePrev as proxy (no price data after exit)
          const priceCurr  = curr[isin]?.price_eur ?? pricePrev;

          // Price effect: same share count, price moved
          periodPriceEffect += sharesPrev * (priceCurr - pricePrev);
          // Investment effect: share count changed, valued at current price
          periodNetInvested += (sharesCurr - sharesPrev) * priceCurr;
        }

        periodPriceEffect = Math.round(periodPriceEffect * 100) / 100;
        periodNetInvested = Math.round(periodNetInvested * 100) / 100;

        cumInvested    += periodNetInvested;
        cumPriceEffect += periodPriceEffect;

        result.push({
          date: d,
          label: monthLabel(d),
          value,
          positions: byDate[d].length,
          avgSize: value / byDate[d].length,
          netInvested: periodNetInvested,
          priceEffect: periodPriceEffect,
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
