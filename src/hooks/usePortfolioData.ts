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
  netInvested: number;    // buys - sells this period
  priceEffect: number;    // pure market price movement (v_curr - v_prev - buys + sells)
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

      // Holdings lookup: date -> isin -> market_value_eur
      const valueByDateIsin: Record<string, Record<string, number>> = {};
      for (const d of dates) {
        valueByDateIsin[d] = {};
        for (const h of byDate[d]) {
          valueByDateIsin[d][h.isin] = h.market_value_eur;
        }
      }

      // Build period data — mirrors Streamlit's _render_main_tab logic exactly
      const result: PeriodData[] = [];
      let cumInvested = 0;
      let cumPriceEffect = 0;

      for (let i = 0; i < dates.length; i++) {
        const d = dates[i];
        const value = totals[d];

        if (i === 0) {
          // First statement: full value = initial investment, price effect = 0
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
        const prevIsinValues = valueByDateIsin[dPrev];
        const currIsinValues = valueByDateIsin[d];

        // Transactions strictly after prev statement date, up to and including current
        const periodTxns = (txns ?? []).filter(
          (tx) => tx.date > dPrev && tx.date <= d
        );

        // Aggregate buys and sells per ISIN for this period
        const buysByIsin: Record<string, number> = {};
        const sellsByIsin: Record<string, number> = {};
        for (const tx of periodTxns) {
          if (tx.direction === "buy") {
            buysByIsin[tx.isin] = (buysByIsin[tx.isin] ?? 0) + Math.abs(tx.amount_eur);
          } else {
            sellsByIsin[tx.isin] = (sellsByIsin[tx.isin] ?? 0) + Math.abs(tx.amount_eur);
          }
        }

        // Union of all ISINs present in either statement
        const allIsins = new Set([
          ...Object.keys(prevIsinValues),
          ...Object.keys(currIsinValues),
        ]);

        let pePeriod = 0;
        let iePeriod = 0;

        for (const isin of allIsins) {
          const vCurr = currIsinValues[isin] ?? 0;
          const vPrev = prevIsinValues[isin] ?? 0;
          const b = buysByIsin[isin] ?? 0;
          const s = sellsByIsin[isin] ?? 0;

          // Matches Streamlit: pe = v_curr - v_prev - buys + sells
          pePeriod += vCurr - vPrev - b + s;
          iePeriod += b - s;
        }

        pePeriod = Math.round(pePeriod * 100) / 100;
        iePeriod = Math.round(iePeriod * 100) / 100;

        cumInvested += iePeriod;
        cumPriceEffect += pePeriod;

        result.push({
          date: d,
          label: monthLabel(d),
          value,
          positions: byDate[d].length,
          avgSize: value / byDate[d].length,
          netInvested: iePeriod,
          priceEffect: pePeriod,
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
