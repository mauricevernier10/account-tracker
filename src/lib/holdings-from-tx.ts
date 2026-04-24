// Derive month-end holdings from CSV transaction history.
// Share counts come from buy/sell/split exactly; market values use the
// last known transaction price per ISIN as a rough stand-in until the
// price-fetching phase lands.

export interface DeriveTx {
  date: string;
  direction: string;
  isin: string | null;
  name: string;
  shares: number | null;   // abs for buy/sell; signed delta for split
  price_eur: number | null;
}

export interface DerivedPosition {
  isin: string;
  name: string;
  shares: number;
  price_eur: number;   // last known transaction price (split-adjusted)
}

export interface DerivedSnapshot {
  statement_date: string;  // YYYY-MM-DD
  positions: DerivedPosition[];
}

export function monthEndsBetween(startDate: string, endDate: string): string[] {
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  const dates: string[] = [];
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  while (true) {
    // Last day of (y, m) — Date UTC with day=0 of next month
    const d = new Date(Date.UTC(y, m + 1, 0));
    if (d > end) break;
    dates.push(d.toISOString().slice(0, 10));
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return dates;
}

interface RunningPosition {
  name: string;
  shares: number;
  lastPrice: number;
}

export function deriveSnapshots(txs: DeriveTx[], endDate: string): DerivedSnapshot[] {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return [];

  const startDate = sorted[0].date;
  const targetDates = monthEndsBetween(startDate, endDate);
  if (!targetDates.length) return [];

  const positions = new Map<string, RunningPosition>();
  const snapshots: DerivedSnapshot[] = [];
  let cursor = 0;

  for (const target of targetDates) {
    // Advance through all transactions on or before this month-end
    while (cursor < sorted.length && sorted[cursor].date <= target) {
      const tx = sorted[cursor++];
      if (!tx.isin || tx.shares == null || tx.shares === 0) continue;

      const pos = positions.get(tx.isin) ?? { name: tx.name, shares: 0, lastPrice: 0 };
      pos.name = tx.name || pos.name;

      if (tx.direction === "buy") {
        pos.shares += Math.abs(tx.shares);
        if (tx.price_eur != null && tx.price_eur > 0) pos.lastPrice = tx.price_eur;
      } else if (tx.direction === "sell") {
        pos.shares -= Math.abs(tx.shares);
        if (tx.price_eur != null && tx.price_eur > 0) pos.lastPrice = tx.price_eur;
      } else if (tx.direction === "split") {
        const before = pos.shares;
        const after = before + tx.shares;
        if (before > 0 && after > 0) {
          const factor = after / before;
          pos.lastPrice = pos.lastPrice / factor;
        }
        pos.shares = after;
      }

      positions.set(tx.isin, pos);
    }

    const snapshotPositions: DerivedPosition[] = [];
    for (const [isin, pos] of positions) {
      if (pos.shares > 1e-6) {
        snapshotPositions.push({
          isin,
          name: pos.name,
          shares: Math.round(pos.shares * 1e6) / 1e6,
          price_eur: Math.round(pos.lastPrice * 100) / 100,
        });
      }
    }

    if (snapshotPositions.length) {
      snapshots.push({ statement_date: target, positions: snapshotPositions });
    }
  }

  return snapshots;
}
