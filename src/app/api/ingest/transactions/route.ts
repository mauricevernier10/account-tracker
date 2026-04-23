import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/supabase";

type TxInsert = Database["public"]["Tables"]["transactions"]["Insert"];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows, userId } = await req.json();
  if (!rows?.length) return NextResponse.json({ count: 0 });

  const uid = userId ?? user.id;

  const nn = (v: unknown) => (v == null || (typeof v === "number" && isNaN(v)) ? null : v);

  const nnNum = (v: unknown): number | null => {
    const n = nn(v);
    if (n == null) return null;
    const x = Number(n);
    return Number.isFinite(x) ? x : null;
  };
  const nnStr = (v: unknown): string | null => {
    const n = nn(v);
    return n == null ? null : String(n);
  };

  const mapped: TxInsert[] = (rows as Record<string, unknown>[])
    .map((r) => ({
      user_id: uid,
      date: String(r.date ?? ""),
      isin: nnStr(r.isin),
      name: String(r.name ?? r.isin ?? r.type ?? "Unknown"),
      direction: String(r.direction ?? ""),
      shares: nnNum(r.shares ?? r.quantity),
      price_eur: nnNum(r.price_eur ?? r.price),
      amount_eur: Math.abs(Number(r.amount_eur ?? r.amount ?? 0)),
      approx: Boolean(r.approx ?? false),
      tx_type: nnStr(r.tx_type ?? r.type),
      transaction_id: nnStr(r.transaction_id),
      fee_eur: nnNum(r.fee_eur),
      tax_eur: nnNum(r.tax_eur),
      asset_class: nnStr(r.asset_class),
      currency: nnStr(r.currency),
      original_amount: nnNum(r.original_amount),
      original_currency: nnStr(r.original_currency),
      fx_rate: nnNum(r.fx_rate),
    }))
    .filter((r) => r.direction && r.date);

  if (!mapped.length) return NextResponse.json({ count: 0 });

  // All rows must carry transaction_id (provided by CSV imports). Drop rows
  // without one rather than fall back to a best-effort 5-tuple dedup — that
  // path is deprecated now that the legacy PDF transaction parser is retired.
  const records: typeof mapped = [];
  const seen = new Set<string>();
  for (const r of mapped) {
    if (!r.transaction_id) continue;
    const key = String(r.transaction_id);
    if (seen.has(key)) continue;
    seen.add(key);
    records.push(r);
  }

  if (!records.length) return NextResponse.json({ count: 0 });

  const { error, count } = await supabase
    .from("transactions")
    .upsert(records as never, {
      onConflict: "user_id,transaction_id",
      ignoreDuplicates: true,
      count: "exact",
    });

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
  }
  return NextResponse.json({ count: count ?? records.length });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error, count } = await supabase
    .from("transactions")
    .select("date", { count: "exact" })
    .eq("user_id", user.id)
    .order("date", { ascending: true })
    .returns<{ date: string }[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const minDate = rows.length ? rows[0].date : null;
  const maxDate = rows.length ? rows[rows.length - 1].date : null;

  return NextResponse.json({ count: count ?? rows.length, minDate, maxDate });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error, count } = await supabase
    .from("transactions")
    .delete({ count: "exact" })
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ count: count ?? 0 });
}
