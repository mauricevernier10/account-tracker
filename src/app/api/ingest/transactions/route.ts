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

  const records = rows.map((r: Record<string, unknown>) => ({
    user_id: userId ?? user.id,
    date: r.date,
    isin: r.isin,
    name: r.name,
    direction: r.direction,
    shares: r.shares ?? r.quantity ?? null,
    price_eur: r.price_eur ?? r.price ?? null,
    amount_eur: r.amount_eur ?? r.amount ?? 0,
    approx: r.approx ?? false,
    tx_type: r.tx_type ?? r.type ?? null,
  }));

  const { error, count } = await supabase.from("transactions").upsert(records, {
    onConflict: "user_id,date,isin,direction,amount_eur",
    count: "exact",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ count });
}
