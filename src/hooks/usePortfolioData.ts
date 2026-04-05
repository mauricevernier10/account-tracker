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
  direction: "buy" | "sell";
  amount_eur: number;
}

export interface PeriodData {
  date: string;
  label: string;
  value: number;
  positions: number;
  avgSize: number;
  netInvested: number;   // net cash in this period (buy - sell)
  priceEffect: number;   // value change minus net invested
  cumInvested: number;   // cumulative net invested
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
      // Fetch all holdings in one query
      const { data: holdings } = await supabase
        .from("holdings")
        .select("*")
        .eq("user_id", userId)
        .order("statement_date", { ascending: true })
        .returns<Holding[]>();

      // Fetch all buy/sell transactions
      const { data: txns } = await supabase
        .from("transactions")
        .select("date, direction, amount_eur")
        .eq("user_id", userId)
        .in("direction", ["buy", "sell"])
        .order("date", { ascending: true })
        .returns<Transaction[]>();

      if (!holdings) return;

      // Group holdings by date
      const byDate: Record<string, Holding[]> = {};
      for (const h of holdings) {
        if (!byDate[h.statement_date]) byDate[h.statement_date] = [];
        byDate[h.statement_date].push(h);
      }

      const dates = Object.keys(byDate).sort();

      // Total value per date
      const totals: Record<string, number> = {};
      for (const d of dates) {
        totals[d] = byDate[d].reduce((s, h) => s + h.market_value_eur, 0);
      }

      // Net invested per period from transactions
      const netPerPeriod: Record<string, number> = {};
      if (txns) {
        for (const tx of txns) {
          // Find which period this transaction belongs to
          // (after prev statement date, up to and including this statement date)
          for (let i = 0; i < dates.length; i++) {
            const from = i === 0 ? "1970-01-01" : dates[i - 1];
            const to = dates[i];
            if (tx.date > from && tx.date <= to) {
              const sign = tx.direction === "buy" ? 1 : -1;
              netPerPeriod[to] = (netPerPeriod[to] ?? 0) + sign * tx.amount_eur;
              break;
            }
          }
        }
      }

      // Build period data
      const result: PeriodData[] = [];
      let cumInvested = 0;
      let cumPriceEffect = 0;

      for (let i = 0; i < dates.length; i++) {
        const d = dates[i];
        const value = totals[d];
        const prevValue = i > 0 ? totals[dates[i - 1]] : 0;

        // Period 0: treat initial value as net invested, price effect = 0
        const netInvested = i === 0 ? value : (netPerPeriod[d] ?? 0);
        const priceEffect = i === 0 ? 0 : value - prevValue - netInvested;

        cumInvested += netInvested;
        cumPriceEffect += priceEffect;

        result.push({
          date: d,
          label: monthLabel(d),
          value,
          positions: byDate[d].length,
          avgSize: value / byDate[d].length,
          netInvested,
          priceEffect,
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
