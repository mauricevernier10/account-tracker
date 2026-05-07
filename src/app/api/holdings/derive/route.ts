import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { deriveSnapshots, type DeriveTx } from "@/lib/holdings-from-tx";
import type { Database } from "@/types/supabase";

type HoldingInsert = Database["public"]["Tables"]["holdings"]["Insert"];

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: txs, error: txErr } = await supabase
    .from("transactions")
    .select("date, direction, isin, name, shares, price_eur")
    .eq("user_id", user.id)
    .in("direction", ["buy", "sell", "split"])
    .order("date", { ascending: true })
    .returns<DeriveTx[]>();

  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });
  if (!txs?.length) return NextResponse.json({ count: 0, snapshots: 0 });

  const today = new Date().toISOString().slice(0, 10);
  const snapshots = deriveSnapshots(txs, today);
  if (!snapshots.length) return NextResponse.json({ count: 0, snapshots: 0 });

  // Read existing snapshot dates so we don't unnecessarily wipe and re-fetch
  // historical month-ends that have already been priced. Re-deriving them
  // with placeholder prices and then re-running prices/update is fragile —
  // any failure in the price step leaves past data wrong.
  const { data: existingRows } = await supabase
    .from("holdings")
    .select("statement_date")
    .eq("user_id", user.id)
    .returns<{ statement_date: string }[]>();
  const existingDates = new Set((existingRows ?? []).map((r) => r.statement_date));

  // Always (re)write today's snapshot so partial-current-month transactions
  // and share counts stay accurate. For historical month-ends, only write
  // the ones that aren't already present.
  const snapsToWrite = snapshots.filter(
    (s) => s.statement_date === today || !existingDates.has(s.statement_date)
  );
  if (!snapsToWrite.length) {
    return NextResponse.json({ count: 0, snapshots: 0, skipped: snapshots.length });
  }

  const rows: HoldingInsert[] = [];
  for (const snap of snapsToWrite) {
    for (const p of snap.positions) {
      rows.push({
        user_id: user.id,
        statement_date: snap.statement_date,
        isin: p.isin,
        name: p.name,
        ticker: null,
        shares: p.shares,
        price_eur: p.price_eur,
        market_value_eur: Math.round(p.shares * p.price_eur * 100) / 100,
        depot: null,
      });
    }
  }

  // Clear only the dates we're about to write (so removed positions on those
  // dates disappear). Past month-ends not in snapsToWrite stay untouched.
  const datesTouched = snapsToWrite.map((s) => s.statement_date);
  const { error: delErr } = await supabase
    .from("holdings")
    .delete()
    .eq("user_id", user.id)
    .in("statement_date", datesTouched);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const { error: insErr, count } = await supabase
    .from("holdings")
    .insert(rows as never, { count: "exact" });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({
    count: count ?? rows.length,
    snapshots: snapsToWrite.length,
    skipped: snapshots.length - snapsToWrite.length,
    from: datesTouched[0],
    to: datesTouched[datesTouched.length - 1],
  });
}
