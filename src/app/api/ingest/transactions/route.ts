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
      name: String(r.name ?? r.isin ?? r.type ?? "Unknown"),
      direction: String(r.direction ?? ""),
      shares: r.shares ?? r.quantity ?? null,
      price_eur: r.price_eur ?? r.price ?? null,
      amount_eur: Math.abs(Number(r.amount_eur ?? r.amount ?? 0)),
      approx: Boolean(r.approx ?? false),
      tx_type: r.tx_type ?? r.type ?? null,
    }))
    .filter(
      (r: Record<string, unknown>) =>
        r.direction &&
        Number(r.amount_eur) > 0 &&
        r.date
    );

  if (!records.length) return NextResponse.json({ count: 0 });

  // Insert and ignore duplicates via the unique constraint
  const { error, count } = await supabase
    .from("transactions")
    .insert(records, { count: "exact" });

  // Unique constraint violation = duplicates already exist, treat as success
  if (error && !error.message.includes("duplicate") && !error.code?.includes("23505")) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ count: count ?? records.length });
}
