import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

// EUR-listed UCITS ETFs — prices are natively in EUR, no FX conversion needed
const ALLOWED = new Set(["SXR8.DE", "IWDA.AS", "IUSQ.DE"]);

interface PriceRow {
  date: Date;
  close: number | null;
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  if (!ticker || !from || !to) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }
  if (!ALLOWED.has(ticker)) {
    return NextResponse.json({ error: "Ticker not allowed" }, { status: 400 });
  }

  // Fetch 35 days before `from` so we have a buy-in price for the first period
  const startBuf = new Date(from + "T00:00:00Z");
  startBuf.setUTCDate(startBuf.getUTCDate() - 35);
  const endBuf = new Date(to + "T00:00:00Z");
  endBuf.setUTCDate(endBuf.getUTCDate() + 2);

  try {
    const hist = (await yf.historical(ticker, {
      period1: startBuf.toISOString().slice(0, 10),
      period2: endBuf.toISOString().slice(0, 10),
      interval: "1d",
    })) as PriceRow[];

    return NextResponse.json({
      prices: hist
        .filter((h) => h.close != null)
        .map((h) => ({ date: h.date.toISOString().slice(0, 10), close: h.close as number })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
