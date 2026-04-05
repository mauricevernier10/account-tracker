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

  const uid = userId ?? user.id;

  const records = rows
    .map((r: Record<string, unknown>) => ({
      user_id: uid,
      date: r.date,
      isin: r.isin ?? null,
      name: r.name ?? r.isin ?? r.type ?? "Unknown",
      direction: r.direction,
      shares: r.shares ?? r.quantity ?? null,
      price_eur: r.price_eur ?? r.price ?? null,
      amount_eur: Math.abs(Number(r.amount_eur ?? r.amount ?? 0)),
      approx: r.approx ?? false,
      tx_type: r.tx_type ?? r.type ?? null,
    }))
    // Only keep rows with a valid direction and non-zero amount
    .filter(
      (r: Record<string, unknown>) =>
        r.direction &&
        ["buy", "sell", "dividend", "interest"].includes(r.direction as string) &&
        Number(r.amount_eur) > 0
    );

  if (!records.length) return NextResponse.json({ count: 0 });

  const { error, count } = await supabase.from("transactions").upsert(records, {
    onConflict: "user_id,date,isin,direction,amount_eur",
    count: "exact",
    ignoreDuplicates: true,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ count });
}
