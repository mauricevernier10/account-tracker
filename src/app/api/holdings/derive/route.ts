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

  // Flatten snapshots into holdings rows. market_value_eur uses the last known
  // transaction price — this is a placeholder until the price-fetching phase
  // lands; share counts are exact.
  const rows: HoldingInsert[] = [];
  for (const snap of snapshots) {
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

  // Clear derivable dates first so removed positions disappear from the snapshot.
  const datesTouched = snapshots.map((s) => s.statement_date);
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
    snapshots: snapshots.length,
    from: datesTouched[0],
    to: datesTouched[datesTouched.length - 1],
  });
}
