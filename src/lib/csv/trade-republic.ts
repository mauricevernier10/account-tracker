// Parser for Trade Republic's CSV export. Handles quoted fields, escaped
// quotes, and maps CSV `type` values onto our internal `direction` enum.

export interface TradeRepublicRow {
  transaction_id: string;
  date: string;
  direction: string;
  isin: string | null;
  name: string;
  shares: number | null;
  price_eur: number | null;
  amount_eur: number;
  fee_eur: number | null;
  tax_eur: number | null;
  asset_class: string | null;
  currency: string;
  original_amount: number | null;
  original_currency: string | null;
  fx_rate: number | null;
  tx_type: string;
  approx: boolean;
}

const TYPE_TO_DIRECTION: Record<string, string> = {
  BUY: "buy",
  SELL: "sell",
  DIVIDEND: "dividend",
  INTEREST: "interest",
  CUSTOMER_INBOUND: "deposit",
  CUSTOMER_OUTBOUND: "withdrawal",
  CUSTOMER_OUTBOUND_REQUEST: "withdrawal",
  SPLIT: "split",
  FEE: "fee",
};

function parseLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { result.push(cur); cur = ""; }
      else cur += c;
    }
  }
  result.push(cur);
  return result;
}

function toNum(v: string): number | null {
  if (!v || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parseTradeRepublicCsv(text: string): TradeRepublicRow[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const header = parseLine(lines[0]).map((h) => h.trim());
  const idx = (col: string) => header.indexOf(col);
  const iDate = idx("date");
  const iType = idx("type");
  const iClass = idx("asset_class");
  const iName = idx("name");
  const iSymbol = idx("symbol");
  const iShares = idx("shares");
  const iPrice = idx("price");
  const iAmount = idx("amount");
  const iFee = idx("fee");
  const iTax = idx("tax");
  const iCurrency = idx("currency");
  const iOrigAmt = idx("original_amount");
  const iOrigCur = idx("original_currency");
  const iFxRate = idx("fx_rate");
  const iTxId = idx("transaction_id");

  const rows: TradeRepublicRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (cols.length < header.length) continue;

    const type = (cols[iType] ?? "").trim();
    const direction = TYPE_TO_DIRECTION[type] ?? type.toLowerCase();
    const txId = (cols[iTxId] ?? "").trim();
    if (!txId) continue; // transaction_id is required for dedup

    const sharesRaw = toNum(cols[iShares]);
    const amountRaw = toNum(cols[iAmount]);
    const symbol = (cols[iSymbol] ?? "").trim() || null;
    const name = (cols[iName] ?? "").trim() || symbol || type;
    // Preserve signed shares on splits so reverse splits parse correctly;
    // buy/sell rows are always abs since `direction` carries the sign.
    const shares = sharesRaw == null
      ? null
      : direction === "split" ? sharesRaw : Math.abs(sharesRaw);

    rows.push({
      transaction_id: txId,
      date: (cols[iDate] ?? "").trim(),
      direction,
      isin: symbol,
      name,
      shares,
      price_eur: toNum(cols[iPrice]),
      amount_eur: amountRaw != null ? Math.abs(amountRaw) : 0,
      fee_eur: toNum(cols[iFee]),
      tax_eur: toNum(cols[iTax]),
      asset_class: (cols[iClass] ?? "").trim() || null,
      currency: (cols[iCurrency] ?? "EUR").trim() || "EUR",
      original_amount: toNum(cols[iOrigAmt]),
      original_currency: (cols[iOrigCur] ?? "").trim() || null,
      fx_rate: toNum(cols[iFxRate]),
      tx_type: type,
      approx: false,
    });
  }
  return rows;
}
