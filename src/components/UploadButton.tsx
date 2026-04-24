"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { parseTradeRepublicCsv } from "@/lib/csv/trade-republic";

interface Props {
  userId: string;
}

type UploadType = "portfolio" | "transactions";

interface FileStatus {
  name: string;
  status: "pending" | "uploading" | "done" | "error";
  message: string;
}

interface PortfolioStatement {
  statement_date: string;
  positions: number;
}

interface TransactionsSummary {
  count: number;
  minDate: string | null;
  maxDate: string | null;
}

async function processCsv(file: File, userId: string): Promise<{ count: number }> {
  const text = await file.text();
  const rows = parseTradeRepublicCsv(text);
  if (!rows.length) throw new Error("No rows parsed from CSV");

  const ingestRes = await fetch(`/api/ingest/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows, userId }),
  });
  if (!ingestRes.ok) {
    const err = await ingestRes.json().catch(() => ({}));
    throw new Error(err.error ?? "Failed to save data");
  }
  return ingestRes.json();
}

async function processPdf(file: File, type: UploadType, userId: string): Promise<{ count: number }> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`/api/parse/${type}`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Parser error");
  }

  const payload = await res.json();
  const ingestRes = await fetch(`/api/ingest/${type}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows: payload.rows, userId }),
  });

  if (!ingestRes.ok) throw new Error("Failed to save data");
  return ingestRes.json();
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function UploadButton({ userId }: Props) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<UploadType>("portfolio");
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [dragging, setDragging] = useState(false);
  const [statements, setStatements] = useState<PortfolioStatement[]>([]);
  const [txSummary, setTxSummary] = useState<TransactionsSummary | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [deriving, setDeriving] = useState(false);
  const [deriveMsg, setDeriveMsg] = useState<string | null>(null);
  const [fetchingPrices, setFetchingPrices] = useState(false);
  const [priceMsg, setPriceMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadStatements = useCallback(async () => {
    setLoadingData(true);
    try {
      const [pRes, tRes] = await Promise.all([
        fetch("/api/ingest/portfolio"),
        fetch("/api/ingest/transactions"),
      ]);
      if (pRes.ok) {
        const p = await pRes.json();
        setStatements(p.statements ?? []);
      }
      if (tRes.ok) {
        const t = await tRes.json();
        setTxSummary({ count: t.count ?? 0, minDate: t.minDate, maxDate: t.maxDate });
      }
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadStatements();
  }, [open, loadStatements]);

  async function handleFiles(selected: File[]) {
    const ext = type === "transactions" ? ".csv" : ".pdf";
    const accepted = selected.filter((f) => f.name.toLowerCase().endsWith(ext));
    if (!accepted.length) return;

    const newFiles: FileStatus[] = accepted.map((f) => ({ name: f.name, status: "pending", message: "" }));
    setFiles(newFiles);

    for (let i = 0; i < accepted.length; i++) {
      setFiles((prev) => prev.map((f, idx) => idx === i ? { ...f, status: "uploading" } : f));
      try {
        const result = type === "transactions"
          ? await processCsv(accepted[i], userId)
          : await processPdf(accepted[i], type, userId);
        setFiles((prev) =>
          prev.map((f, idx) => idx === i ? { ...f, status: "done", message: `✓ ${result.count} rows` } : f)
        );
      } catch (err) {
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: "error", message: err instanceof Error ? err.message : "Failed" } : f
          )
        );
      }
    }
    loadStatements();
  }

  async function deletePortfolio(date: string) {
    if (!confirm(`Delete portfolio statement from ${formatDate(date)}?`)) return;
    setDeletingKey(`p:${date}`);
    try {
      const res = await fetch(`/api/ingest/portfolio?date=${encodeURIComponent(date)}`, { method: "DELETE" });
      if (!res.ok) { alert((await res.json().catch(() => ({}))).error ?? "Failed to delete"); return; }
      await loadStatements();
    } finally {
      setDeletingKey(null);
    }
  }

  async function deleteAllPortfolio() {
    if (!statements.length) return;
    if (!confirm(`Delete all ${statements.length} portfolio statements? This cannot be undone.`)) return;
    setDeletingKey("p:all");
    try {
      const res = await fetch("/api/ingest/portfolio", { method: "DELETE" });
      if (!res.ok) { alert((await res.json().catch(() => ({}))).error ?? "Failed to delete"); return; }
      await loadStatements();
    } finally {
      setDeletingKey(null);
    }
  }

  async function deleteTransactions() {
    if (!txSummary?.count) return;
    if (!confirm(`Delete all ${txSummary.count} transactions? This cannot be undone.`)) return;
    setDeletingKey("t:all");
    try {
      const res = await fetch("/api/ingest/transactions", { method: "DELETE" });
      if (!res.ok) { alert((await res.json().catch(() => ({}))).error ?? "Failed to delete"); return; }
      await loadStatements();
    } finally {
      setDeletingKey(null);
    }
  }

  async function deriveHoldings() {
    if (!txSummary?.count) return;
    if (statements.length && !confirm("Replace month-end snapshots on any dates covered by your CSV? Prices will be approximate until you run Fetch Prices.")) return;
    setDeriving(true);
    setDeriveMsg(null);
    try {
      const res = await fetch("/api/holdings/derive", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setDeriveMsg(body.error ?? "Failed to derive"); return; }
      setDeriveMsg(`✓ ${body.snapshots} snapshots · ${body.count} positions`);
      await loadStatements();
    } finally {
      setDeriving(false);
    }
  }

  async function fetchPrices() {
    if (!statements.length) return;
    setFetchingPrices(true);
    setPriceMsg(null);
    try {
      const res = await fetch("/api/prices/update", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setPriceMsg(body.error ?? "Failed to fetch prices"); return; }
      const failNote = body.failed?.length ? ` · ${body.failed.length} unresolved` : "";
      setPriceMsg(`✓ ${body.updated} rows updated${failNote}`);
    } finally {
      setFetchingPrices(false);
    }
  }

  function reset() {
    setFiles([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }, [type, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = deriving || fetchingPrices || !!deletingKey;

  return (
    <div className="relative">
      <Button size="sm" onClick={() => { setOpen((o) => !o); reset(); }}>
        <span className="hidden sm:inline">+ New Statement</span>
        <span className="sm:hidden">+ New</span>
      </Button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-lg border bg-background p-4 shadow-lg sm:w-96 sm:max-w-none">
          <p className="text-sm font-medium mb-3">Manage data</p>

          {/* Unified loaded-data panel */}
          <div className="mb-3 rounded-md border bg-muted/30 p-2 space-y-3">
            {loadingData && <p className="text-xs text-muted-foreground">Loading…</p>}

            {!loadingData && (
              <>
                {/* Portfolio statements */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Portfolio statements
                    </p>
                    {statements.length > 1 && (
                      <button
                        onClick={deleteAllPortfolio}
                        disabled={busy}
                        className="text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-50 transition-colors"
                      >
                        {deletingKey === "p:all" ? "Deleting…" : "Delete all"}
                      </button>
                    )}
                  </div>
                  {statements.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No statements yet.</p>
                  ) : (
                    <ul className="space-y-1 max-h-32 overflow-y-auto">
                      {statements.map((s) => (
                        <li key={s.statement_date} className="flex items-center gap-2 text-xs">
                          <span className="flex-1 truncate">{formatDate(s.statement_date)}</span>
                          <span className="text-muted-foreground">{s.positions} pos</span>
                          <button
                            onClick={() => deletePortfolio(s.statement_date)}
                            disabled={busy}
                            className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                            aria-label={`Delete statement ${s.statement_date}`}
                          >
                            {deletingKey === `p:${s.statement_date}` ? "…" : "🗑"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Transactions summary */}
                <div className="border-t pt-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    Transactions
                  </p>
                  {!txSummary?.count ? (
                    <p className="text-xs text-muted-foreground">No transactions yet.</p>
                  ) : (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="flex-1 text-muted-foreground">
                        {txSummary.count} rows
                        {txSummary.minDate && txSummary.maxDate && (
                          <> · {formatDate(txSummary.minDate)} – {formatDate(txSummary.maxDate)}</>
                        )}
                      </span>
                      <button
                        onClick={deleteTransactions}
                        disabled={busy}
                        className="text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-50 transition-colors"
                      >
                        {deletingKey === "t:all" ? "Deleting…" : "Delete all"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Actions */}
                {(!!txSummary?.count || !!statements.length) && (
                  <div className="border-t pt-2 flex flex-col gap-1.5">
                    {!!txSummary?.count && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={deriveHoldings}
                          disabled={busy}
                          className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
                        >
                          {deriving ? "Deriving…" : "Derive from CSV"}
                        </button>
                        {deriveMsg && <span className="text-xs text-muted-foreground truncate">{deriveMsg}</span>}
                      </div>
                    )}
                    {!!statements.length && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={fetchPrices}
                          disabled={busy}
                          className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
                        >
                          {fetchingPrices ? "Fetching…" : "Fetch Prices"}
                        </button>
                        {priceMsg && <span className="text-xs text-muted-foreground truncate">{priceMsg}</span>}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Upload type selector */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-muted-foreground shrink-0">Upload:</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => { setType("portfolio"); reset(); }}
                className={`rounded px-2 py-0.5 text-xs font-medium transition-colors border ${
                  type === "portfolio" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted border-transparent"
                }`}
              >
                PDF
              </button>
              <button
                onClick={() => { setType("transactions"); reset(); }}
                className={`rounded px-2 py-0.5 text-xs font-medium transition-colors border ${
                  type === "transactions" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted border-transparent"
                }`}
              >
                CSV
              </button>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => { reset(); inputRef.current?.click(); }}
            className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors ${
              dragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
            }`}
          >
            <p className="text-sm font-medium text-muted-foreground">
              {type === "transactions" ? "Drop CSV here" : "Drop PDFs here"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept={type === "transactions" ? ".csv" : ".pdf"}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(Array.from(e.target.files));
            }}
          />

          {/* Per-file status */}
          {files.length > 0 && (
            <ul className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  <span className="shrink-0">
                    {(f.status === "pending" || f.status === "uploading") && "⏳"}
                    {f.status === "done" && "✅"}
                    {f.status === "error" && "❌"}
                  </span>
                  <span className="truncate text-muted-foreground flex-1">{f.name}</span>
                  {f.message && (
                    <span className={`shrink-0 ${f.status === "error" ? "text-red-500" : "text-green-600"}`}>
                      {f.message}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
