"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { parseTradeRepublicCsv } from "@/lib/csv/trade-republic";

interface Props {
  userId: string;
}

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

async function ingestCsv(file: File, userId: string): Promise<{ count: number }> {
  const text = await file.text();
  const rows = parseTradeRepublicCsv(text);
  if (!rows.length) throw new Error("No rows parsed from CSV");

  const res = await fetch(`/api/ingest/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows, userId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Failed to save data");
  }
  return res.json();
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function UploadButton({ userId }: Props) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [dragging, setDragging] = useState(false);
  const [statements, setStatements] = useState<PortfolioStatement[]>([]);
  const [txSummary, setTxSummary] = useState<TransactionsSummary | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [pipelineStage, setPipelineStage] = useState<string | null>(null);
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
    const accepted = selected.filter((f) => f.name.toLowerCase().endsWith(".csv"));
    if (!accepted.length) return;

    setFiles(accepted.map((f) => ({ name: f.name, status: "pending", message: "" })));
    setPipelineStage(null);

    for (let i = 0; i < accepted.length; i++) {
      setFiles((prev) => prev.map((f, idx) => idx === i ? { ...f, status: "uploading" } : f));
      try {
        const result = await ingestCsv(accepted[i], userId);
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

    // Auto-pipeline: derive snapshots → fetch prices
    const anySucceeded = accepted.length > 0;
    if (anySucceeded) {
      try {
        setPipelineStage("Deriving snapshots…");
        const dRes = await fetch("/api/holdings/derive", { method: "POST" });
        if (!dRes.ok) throw new Error("Derive failed");

        setPipelineStage("Fetching prices…");
        const pRes = await fetch("/api/prices/update", { method: "POST" });
        const pBody = await pRes.json().catch(() => ({}));
        if (!pRes.ok) throw new Error(pBody.error ?? "Price fetch failed");

        const failNote = pBody.failed?.length ? ` · ${pBody.failed.length} unresolved` : "";
        setPipelineStage(`✓ ${pBody.updated} rows priced${failNote}`);
      } catch (err) {
        setPipelineStage(`⚠ ${err instanceof Error ? err.message : "Pipeline failed"}`);
      }
    }

    loadStatements();
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

  function reset() {
    setFiles([]);
    setPipelineStage(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative">
      <Button size="sm" onClick={() => { setOpen((o) => !o); reset(); }}>
        <span className="hidden sm:inline">+ Import CSV</span>
        <span className="sm:hidden">+ Import</span>
      </Button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-lg border bg-background p-4 shadow-lg sm:w-96 sm:max-w-none">
          <p className="text-sm font-medium mb-3">Manage data</p>

          <div className="mb-3 rounded-md border bg-muted/30 p-2 space-y-3">
            {loadingData && <p className="text-xs text-muted-foreground">Loading…</p>}

            {!loadingData && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Portfolio snapshots
                    </p>
                    {!!statements.length && (
                      <button
                        onClick={deleteAllPortfolio}
                        disabled={!!deletingKey}
                        className="text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-50 transition-colors"
                      >
                        {deletingKey === "p:all" ? "Deleting…" : "Delete all"}
                      </button>
                    )}
                  </div>
                  {statements.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No snapshots yet.</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {statements.length} month-end snapshots · {formatDate(statements[statements.length - 1].statement_date)} – {formatDate(statements[0].statement_date)}
                    </p>
                  )}
                </div>

                <div className="border-t pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Transactions
                    </p>
                    {!!txSummary?.count && (
                      <button
                        onClick={deleteTransactions}
                        disabled={!!deletingKey}
                        className="text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-50 transition-colors"
                      >
                        {deletingKey === "t:all" ? "Deleting…" : "Delete all"}
                      </button>
                    )}
                  </div>
                  {!txSummary?.count ? (
                    <p className="text-xs text-muted-foreground">No transactions yet.</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {txSummary.count} rows
                      {txSummary.minDate && txSummary.maxDate && (
                        <> · {formatDate(txSummary.minDate)} – {formatDate(txSummary.maxDate)}</>
                      )}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

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
            <p className="text-sm font-medium text-muted-foreground">Drop Trade Republic CSV here</p>
            <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(Array.from(e.target.files));
            }}
          />

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

          {pipelineStage && (
            <p className="mt-2 text-xs text-muted-foreground">{pipelineStage}</p>
          )}
        </div>
      )}
    </div>
  );
}
