// Historical price fetching via Yahoo Finance.
// Resolves ISIN → ticker, fetches closing prices for given dates,
// and converts to EUR using same-day FX rates.

import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

export interface ResolvedTicker {
  ticker: string;
  currency: string;
}

export async function resolveIsin(isin: string): Promise<ResolvedTicker | null> {
  try {
    const result = await yf.search(isin, { quotesCount: 5, newsCount: 0 });
    // Filter to Yahoo-native quotes which all have a symbol property
    const yahooQuotes = result.quotes.filter((q) => q.isYahooFinance);
    const equity =
      yahooQuotes.find((q) => (q as { quoteType?: string }).quoteType === "EQUITY") ??
      yahooQuotes[0];
    if (!equity) return null;
    const ticker = (equity as { symbol: string }).symbol;
    if (!ticker) return null;

    const q = await yf.quote(ticker);
    return { ticker, currency: q.currency ?? "EUR" };
  } catch {
    return null;
  }
}

export async function getCurrency(ticker: string): Promise<string> {
  try {
    const q = await yf.quote(ticker);
    return q.currency ?? "EUR";
  } catch {
    return "EUR";
  }
}

interface PriceRow {
  date: Date;
  close: number | null;
}

// Returns a map of statement_date → closing price in native currency.
// Looks back up to 10 days to find the nearest trading day for each date.
export async function fetchHistoricalPrices(
  ticker: string,
  dates: string[],
): Promise<Map<string, number>> {
  const sorted = [...dates].sort();
  const start = new Date(sorted[0] + "T00:00:00Z");
  start.setUTCDate(start.getUTCDate() - 10);
  const end = new Date(sorted[sorted.length - 1] + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() + 1);

  const hist = (await yf.historical(ticker, {
    period1: start.toISOString().slice(0, 10),
    period2: end.toISOString().slice(0, 10),
    interval: "1d",
  })) as PriceRow[];

  hist.sort((a, b) => a.date.getTime() - b.date.getTime());

  const result = new Map<string, number>();
  for (const target of dates) {
    const cutoff = new Date(target + "T23:59:59Z").getTime();
    let best: number | null = null;
    for (const h of hist) {
      if (h.date.getTime() <= cutoff && h.close != null) best = h.close;
    }
    if (best !== null) result.set(target, best);
  }
  return result;
}

// Returns a map of statement_date → divisor to convert native price to EUR.
// For EUR: divisor = 1. For USD: divisor = EURUSD rate. For GBp/GBX: divisor = EURGBP × 100.
export async function fetchEurDivisors(
  currency: string,
  dates: string[],
): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (currency === "EUR") {
    for (const d of dates) m.set(d, 1);
    return m;
  }

  const isPence = currency === "GBp" || currency === "GBX";
  const pair = `EUR${isPence ? "GBP" : currency}=X`;

  const sorted = [...dates].sort();
  const start = new Date(sorted[0] + "T00:00:00Z");
  start.setUTCDate(start.getUTCDate() - 10);
  const end = new Date(sorted[sorted.length - 1] + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() + 1);

  let hist: PriceRow[] = [];
  try {
    hist = (await yf.historical(pair, {
      period1: start.toISOString().slice(0, 10),
      period2: end.toISOString().slice(0, 10),
      interval: "1d",
    })) as PriceRow[];
    hist.sort((a, b) => a.date.getTime() - b.date.getTime());
  } catch {
    // Fall back to divisor=1 (no conversion) if FX data unavailable
  }

  for (const target of dates) {
    const cutoff = new Date(target + "T23:59:59Z").getTime();
    let rate = 1;
    for (const h of hist) {
      if (h.date.getTime() <= cutoff && h.close) rate = h.close;
    }
    // EURUSD=X: 1 EUR = rate USD → price_eur = price_usd / rate
    // GBp: price_eur = (price_gbx / 100) / rate_eurgbp → divisor = rate × 100
    m.set(target, isPence ? rate * 100 : rate);
  }
  return m;
}
