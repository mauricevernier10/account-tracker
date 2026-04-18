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

  const nn = (v: unknown) => (v == null || (typeof v === "number" && isNaN(v)) ? null : v);

  const mapped = rows
    .map((r: Record<string, unknown>) => ({
      user_id: uid,
      date: r.date,
      isin: nn(r.isin),
      name: String(r.name ?? r.isin ?? r.type ?? "Unknown"),
      direction: String(r.direction ?? ""),
      shares: nn(r.shares ?? r.quantity),
      price_eur: nn(r.price_eur ?? r.price),
      amount_eur: Math.abs(Number(r.amount_eur ?? r.amount ?? 0)),
      approx: Boolean(r.approx ?? false),
      tx_type: nn(r.tx_type ?? r.type),
    }))
    .filter(
      (r: Record<string, unknown>) =>
        r.direction &&
        Number(r.amount_eur) > 0 &&
        r.date
    );

  if (!mapped.length) return NextResponse.json({ count: 0 });

  // Deduplicate within the batch before sending to Supabase.
  // A duplicate key on any row kills the entire insert, so we must ensure
  // the batch itself is unique on (user_id, date, isin, direction, amount_eur).
  const seen = new Set<string>();
  const records = mapped.filter((r: Record<string, unknown>) => {
    const key = `${r.date}|${r.isin ?? ""}|${r.direction}|${r.amount_eur}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // upsert with ignoreDuplicates so re-uploads of the same PDF don't error.
  // onConflict targets the unique constraint; null-isin rows (interest, deposits)
  // are not matched by ON CONFLICT (NULL != NULL) and always insert — acceptable
  // since the batch-level dedup above handles within-PDF duplicates.
  const { error, count } = await supabase
    .from("transactions")
    .upsert(records, {
      onConflict: "user_id,date,isin,direction,amount_eur",
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
