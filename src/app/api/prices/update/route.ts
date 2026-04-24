import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  resolveIsin,
  getCurrency,
  fetchHistoricalPrices,
  fetchEurDivisors,
} from "@/lib/price-fetch";

interface HoldingRow {
  id: string;
  isin: string;
  ticker: string | null;
  shares: number;
  statement_date: string;
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: holdings, error } = await supabase
    .from("holdings")
    .select("id, isin, ticker, shares, statement_date")
    .eq("user_id", user.id)
    .returns<HoldingRow[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!holdings?.length) return NextResponse.json({ updated: 0, failed: [] });

  // Group by ISIN to minimise Yahoo Finance calls
  const byIsin = new Map<string, HoldingRow[]>();
  for (const h of holdings) {
    if (!byIsin.has(h.isin)) byIsin.set(h.isin, []);
    byIsin.get(h.isin)!.push(h);
  }

  const updates: { id: string; ticker: string; price_eur: number; market_value_eur: number }[] =
    [];
  const failed: string[] = [];

  for (const [isin, rows] of byIsin) {
    let ticker = rows[0].ticker ?? null;
    let currency = "EUR";

    if (!ticker) {
      const resolved = await resolveIsin(isin);
      if (!resolved) {
        failed.push(isin);
        continue;
      }
      ticker = resolved.ticker;
      currency = resolved.currency;
    } else {
      currency = await getCurrency(ticker);
    }

    const dates = [...new Set(rows.map((r) => r.statement_date))];

    let prices: Map<string, number>;
    let divisors: Map<string, number>;
    try {
      [prices, divisors] = await Promise.all([
        fetchHistoricalPrices(ticker, dates),
        fetchEurDivisors(currency, dates),
      ]);
    } catch {
      failed.push(isin);
      continue;
    }

    for (const row of rows) {
      const raw = prices.get(row.statement_date);
      if (raw == null) continue;
      const divisor = divisors.get(row.statement_date) ?? 1;
      const price_eur = Math.round((raw / divisor) * 100) / 100;
      const market_value_eur = Math.round(row.shares * price_eur * 100) / 100;
      updates.push({ id: row.id, ticker: ticker!, price_eur, market_value_eur });
    }

    // Avoid hammering the Yahoo Finance API
    await new Promise((r) => setTimeout(r, 150));
  }

  // Apply updates (one call per row — PostgREST has no multi-row UPDATE with different values)
  let updated = 0;
  for (const u of updates) {
    const { error: e } = await supabase
      .from("holdings")
      .update({ ticker: u.ticker, price_eur: u.price_eur, market_value_eur: u.market_value_eur } as never)
      .eq("id", u.id)
      .eq("user_id", user.id);
    if (!e) updated++;
  }

  return NextResponse.json({
    updated,
    total: holdings.length,
    failed,
  });
}
