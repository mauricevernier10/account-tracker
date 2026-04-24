import type { PeriodData } from "@/hooks/usePortfolioData";

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

// Cashflow-matched benchmark simulation.
// For each period, invest netInvested into the benchmark at the benchmark's
// price at the START of that period (= end of previous period), then read
// benchmark value at the period's end date.
// Returns one point per period (may be fewer if price data is unavailable).
export function computeCashflowBenchmark(
  periods: PeriodData[],
  prices: { date: string; close: number }[],
): BenchmarkPoint[] {
  if (!prices.length || !periods.length) return [];

  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date));

  let units = 0;
  const result: BenchmarkPoint[] = [];

  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];
    const prevDate = i > 0 ? periods[i - 1].date : null;

    // Buy/sell price = benchmark at start of period (previous month-end).
    // For period 0 there is no previous period, so use the period-end price.
    const transactionPrice =
      prevDate != null
        ? (priceOnOrBefore(sorted, prevDate) ?? priceOnOrBefore(sorted, period.date))
        : priceOnOrBefore(sorted, period.date);

    if (transactionPrice && period.netInvested !== 0) {
      if (period.netInvested > 0) {
        units += period.netInvested / transactionPrice;
      } else {
        // Sell units equivalent to the outflow
        units = Math.max(0, units - Math.abs(period.netInvested) / transactionPrice);
      }
    }

    const endPrice = priceOnOrBefore(sorted, period.date);
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
