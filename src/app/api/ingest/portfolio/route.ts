import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows, userId } = await req.json();
  if (!rows?.length) return NextResponse.json({ count: 0 });

  // Attach user_id and normalise field names from parser output
  const records = rows.map((r: Record<string, unknown>) => ({
    user_id: userId ?? user.id,
    statement_date: r.statement_date,
    isin: r.isin,
    name: r.name,
    ticker: r.ticker ?? null,
    shares: r.shares ?? r.quantity ?? 0,
    price_eur: r.price_eur ?? r.price ?? 0,
    market_value_eur: r.market_value_eur ?? r.market_value ?? 0,
    depot: r.depot ?? null,
  }));

  const { error, count } = await supabase
    .from("holdings")
    .upsert(records, { onConflict: "user_id,statement_date,isin", count: "exact" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ count });
}
