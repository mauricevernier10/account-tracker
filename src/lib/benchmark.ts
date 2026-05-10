import type { PeriodData, Transaction } from "@/hooks/usePortfolioData";

export interface BenchmarkPoint {
  date: string;
  label: string;
  value: number;
}

export const BENCHMARKS = [
  { label: "S&P 500", ticker: "SXR8.DE" },
  { label: "MSCI World", ticker: "IWDA.AS" },
  { label: "MSCI ACWI", ticker: "IUSQ.DE" },
] as const;

export type BenchmarkTicker = (typeof BENCHMARKS)[number]["ticker"];

function priceOnOrBefore(
  sortedPrices: { date: string; close: number }[],
  target: string,
): number | null {
  let best: number | null = null;
  for (const p of sortedPrices) {
    if (p.date <= target) best = p.close;
    else break;
  }
  return best;
}

// Cashflow-matched benchmark simulation, transaction-level.
// Walks every buy/sell transaction in date order, converting the EUR amount
// into benchmark units at that day's benchmark close (or the nearest prior
// trading day). At each portfolio period boundary, records the running unit
// count × period-end benchmark price.
//
// Falls back to a lump-sum seed at period 0 only when the user's first
// statement has no contributing transactions in the dataset (typical when
// the very first imported PDF reflects pre-existing holdings whose buy
// history isn't loaded). In that case, benchmark seeds at the same value
// as the portfolio so both lines start equal.
export function computeCashflowBenchmark(
  periods: PeriodData[],
  transactions: Transaction[],
  prices: { date: string; close: number }[],
): BenchmarkPoint[] {
  if (!prices.length || !periods.length) return [];

  const sortedPrices = [...prices].sort((a, b) => a.date.localeCompare(b.date));
  const sortedTx = transactions
    .filter(
      (tx) =>
        (tx.direction === "buy" || tx.direction === "sell") &&
        tx.amount_eur !== 0 &&
        tx.amount_eur != null,
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  // Did any tx in the dataset land on or before the first period? If not,
  // the first period is a pure pre-existing-portfolio snapshot and we seed.
  const hasFirstPeriodTxs = sortedTx.some((tx) => tx.date <= periods[0].date);

  let units = 0;
  let txIdx = 0;
  const result: BenchmarkPoint[] = [];

  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];

    // Apply every transaction on or before this period's end at its actual
    // date. txIdx is monotonic so each tx is processed exactly once.
    while (txIdx < sortedTx.length && sortedTx[txIdx].date <= period.date) {
      const tx = sortedTx[txIdx++];
      const txPrice = priceOnOrBefore(sortedPrices, tx.date);
      if (!txPrice) continue; // benchmark has no price that early — skip
      const amount = Math.abs(tx.amount_eur);
      if (tx.direction === "buy") {
        units += amount / txPrice;
      } else {
        // Cap at zero: benchmark holds at most what's been bought.
        units = Math.max(0, units - amount / txPrice);
      }
    }

    const endPrice = priceOnOrBefore(sortedPrices, period.date);

    // Period-0 seed: only when the dataset contains no contributing
    // transactions ≤ periods[0].date. Mirrors the previous behaviour and
    // ensures both lines start at the same value when the user imports a
    // standalone snapshot with no transaction backstory.
    if (i === 0 && !hasFirstPeriodTxs && period.value > 0 && endPrice) {
      units = period.value / endPrice;
    }

    if (endPrice != null) {
      result.push({
        date: period.date,
        label: period.label,
        value: Math.round(units * endPrice * 100) / 100,
      });
    }
  }

  return result;
}
