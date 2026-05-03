"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { computeFifo, type FifoResult } from "@/lib/fifo";

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
  shares: number | null;
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

export interface PeriodBreakdown {
  // Per-position price effect for this period: v_curr − v_prev − buys + sells
  priceByName: Record<string, number>;
  // Per-position net invested for this period: buys − sells (or initial value for period 0)
  investByName: Record<string, number>;
  // True for the very first statement: there is no prior period to compute price effect against.
  noPriorPeriod: boolean;
}

export function usePortfolioData(userId: string, refreshKey = 0) {
  const supabase = createClient();
  const [periods, setPeriods] = useState<PeriodData[]>([]);
  const [holdingsByDate, setHoldingsByDate] = useState<Record<string, Holding[]>>({});
  const [breakdownByDate, setBreakdownByDate] = useState<Record<string, PeriodBreakdown>>({});
  const [fifoByIsin, setFifoByIsin] = useState<Map<string, FifoResult>>(new Map());
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
          .select("date, isin, direction, shares, amount_eur")
          .eq("user_id", userId)
          .in("direction", ["buy", "sell", "split"])
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
      const breakdown: Record<string, PeriodBreakdown> = {};
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

        const buysByIsin: Record<string, number> = {};
        const sellsByIsin: Record<string, number> = {};
        for (const tx of periodTxns) {
          if (!tx.isin) continue;
          const amt = Math.abs(tx.amount_eur);
          if (tx.direction === "buy") buysByIsin[tx.isin] = (buysByIsin[tx.isin] ?? 0) + amt;
          else if (tx.direction === "sell") sellsByIsin[tx.isin] = (sellsByIsin[tx.isin] ?? 0) + amt;
        }
        const buys = Object.values(buysByIsin).reduce((s, v) => s + v, 0);
        const sells = Object.values(sellsByIsin).reduce((s, v) => s + v, 0);
        const netInvested = buys - sells;

        let priceEffect: number;
        if (!dPrev) {
          priceEffect = (buys > 0 || sells > 0)
            ? Math.round((value - netInvested) * 100) / 100
            : 0;
        } else {
          const prevValue = byDate[dPrev].reduce((s, h) => s + h.market_value_eur, 0);
          priceEffect = Math.round((value - prevValue - buys + sells) * 100) / 100;
        }

        const effectiveNetInvested = (!dPrev && buys === 0 && sells === 0) ? value : netInvested;
        cumNetInvested += effectiveNetInvested;
        cumPriceEffect += priceEffect;

        // Per-position breakdown
        const currByIsin: Record<string, Holding> = {};
        for (const h of byDate[d]) currByIsin[h.isin] = h;
        const prevByIsin: Record<string, Holding> = {};
        if (dPrev) for (const h of byDate[dPrev] ?? []) prevByIsin[h.isin] = h;
        const allIsins = new Set([...Object.keys(currByIsin), ...Object.keys(prevByIsin)]);

        const priceByName: Record<string, number> = {};
        const investByName: Record<string, number> = {};
        const noPrior = !dPrev && buys === 0 && sells === 0;

        for (const isin of allIsins) {
          const curr = currByIsin[isin];
          const prev = prevByIsin[isin];
          const name = curr?.ticker ?? curr?.name ?? prev?.ticker ?? prev?.name ?? isin;
          const vCurr = curr?.market_value_eur ?? 0;
          const vPrev = prev?.market_value_eur ?? 0;
          const b = buysByIsin[isin] ?? 0;
          const s = sellsByIsin[isin] ?? 0;

          if (noPrior) {
            priceByName[name] = 0;
            investByName[name] = vCurr;
          } else if (!dPrev) {
            priceByName[name] = Math.round((vCurr - (b - s)) * 100) / 100;
            investByName[name] = b - s;
          } else {
            priceByName[name] = Math.round((vCurr - vPrev - b + s) * 100) / 100;
            investByName[name] = b - s;
          }
        }

        breakdown[d] = { priceByName, investByName, noPriorPeriod: noPrior };

        result.push({
          date: d,
          label: monthLabel(d),
          value,
          positions: byDate[d].length,
          avgSize: value / byDate[d].length,
          priceEffect,
          netInvested: effectiveNetInvested,
          cumNetInvested,
          cumPriceEffect,
        });
      }

      // FIFO: group buy/sell/split transactions by ISIN and compute cost basis
      const txsByIsin = new Map<string, { date: string; direction: "buy" | "sell" | "split"; qty: number; amount: number }[]>();
      for (const tx of allTxns) {
        if (!tx.isin || tx.shares == null || tx.shares === 0) continue;
        const dir = tx.direction as "buy" | "sell" | "split";
        if (dir !== "buy" && dir !== "sell" && dir !== "split") continue;
        const qty = dir === "split" ? tx.shares : Math.abs(tx.shares);
        if (!txsByIsin.has(tx.isin)) txsByIsin.set(tx.isin, []);
        txsByIsin.get(tx.isin)!.push({
          date: tx.date,
          direction: dir,
          qty,
          amount: Math.abs(tx.amount_eur),
        });
      }
      const fifo = new Map<string, FifoResult>();
      for (const [isin, txs] of txsByIsin) {
        fifo.set(isin, computeFifo(txs));
      }

      setPeriods(result);
      setHoldingsByDate(byDate);
      setBreakdownByDate(breakdown);
      setFifoByIsin(fifo);
      setLoading(false);
    }

    load();
  }, [userId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { periods, holdingsByDate, breakdownByDate, fifoByIsin, loading };
}
