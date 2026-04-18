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

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("holdings")
    .select("statement_date")
    .eq("user_id", user.id)
    .returns<{ statement_date: string }[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.statement_date, (counts.get(row.statement_date) ?? 0) + 1);
  }
  const statements = Array.from(counts.entries())
    .map(([statement_date, positions]) => ({ statement_date, positions }))
    .sort((a, b) => b.statement_date.localeCompare(a.statement_date));

  return NextResponse.json({ statements });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date");
  if (!date) return NextResponse.json({ error: "Missing date" }, { status: 400 });

  const { error, count } = await supabase
    .from("holdings")
    .delete({ count: "exact" })
    .eq("user_id", user.id)
    .eq("statement_date", date);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ count: count ?? 0 });
}
