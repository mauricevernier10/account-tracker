export interface FifoTx {
  date: string;
  direction: "buy" | "sell" | "split";
  qty: number;     // abs for buy/sell; signed delta for split (+ forward, − reverse)
  amount: number;  // abs EUR total; 0 for splits
}

interface Lot {
  date: string;
  originalQty: number;
  remainingQty: number;
  originalAmount: number;
}

export interface RealizedEvent {
  date: string;
  qty: number;
  proceeds: number;
  costBasis: number;
  pnl: number;
}

export interface FifoResult {
  lots: Lot[];
  realizedEvents: RealizedEvent[];
  realizedPnL: number;
  remainingQty: number;
  totalCostRemaining: number;
  avgCostPerShare: number;
}

export function computeFifo(txs: FifoTx[]): FifoResult {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));

  const lots: Lot[] = [];
  const realizedEvents: RealizedEvent[] = [];
  let realizedPnL = 0;

  for (const tx of sorted) {
    if (tx.direction === "split") {
      // Scale all existing lots proportionally so share count post-split is
      // right and cost basis is preserved (per-share cost drops by the factor).
      // tx.qty is the signed delta: e.g. 20:1 forward split on 0.5 shares → +9.5.
      const currentTotal = lots.reduce((s, l) => s + l.remainingQty, 0);
      if (currentTotal <= 0) continue;
      const newTotal = currentTotal + tx.qty;
      if (newTotal <= 0) continue;
      const factor = newTotal / currentTotal;
      for (const lot of lots) {
        lot.remainingQty *= factor;
        lot.originalQty *= factor;
      }
      continue;
    }

    if (tx.qty <= 0) continue;

    if (tx.direction === "buy") {
      lots.push({
        date: tx.date,
        originalQty: tx.qty,
        remainingQty: tx.qty,
        originalAmount: tx.amount,
      });
    } else {
      let qtyToSell = tx.qty;
      let costBasis = 0;

      for (const lot of lots) {
        if (qtyToSell <= 0) break;
        if (lot.remainingQty <= 0) continue;

        const consumed = Math.min(lot.remainingQty, qtyToSell);
        costBasis += (consumed / lot.originalQty) * lot.originalAmount;
        lot.remainingQty -= consumed;
        qtyToSell -= consumed;
      }

      const pnl = tx.amount - costBasis;
      realizedPnL += pnl;
      realizedEvents.push({
        date: tx.date,
        qty: tx.qty,
        proceeds: tx.amount,
        costBasis: round2(costBasis),
        pnl: round2(pnl),
      });
    }
  }

  const remainingQty = lots.reduce((s, l) => s + l.remainingQty, 0);
  const totalCostRemaining = lots.reduce(
    (s, l) => s + (l.originalQty > 0 ? (l.remainingQty / l.originalQty) * l.originalAmount : 0),
    0
  );
  const avgCostPerShare = remainingQty > 0 ? totalCostRemaining / remainingQty : 0;

  return {
    lots,
    realizedEvents,
    realizedPnL: round2(realizedPnL),
    remainingQty: Math.round(remainingQty * 1e6) / 1e6,
    totalCostRemaining: round2(totalCostRemaining),
    avgCostPerShare: round2(avgCostPerShare),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
