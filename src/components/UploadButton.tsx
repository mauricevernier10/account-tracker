"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";

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

async function processFile(file: File, type: UploadType, userId: string): Promise<{ count: number }> {
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
  const inputRef = useRef<HTMLInputElement>(null);

  const isUploading = files.some((f) => f.status === "uploading" || f.status === "pending");

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
    const pdfs = selected.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (!pdfs.length) return;

    const newFiles: FileStatus[] = pdfs.map((f) => ({
      name: f.name,
      status: "pending",
      message: "",
    }));
    setFiles(newFiles);

    for (let i = 0; i < pdfs.length; i++) {
      setFiles((prev) => prev.map((f, idx) => idx === i ? { ...f, status: "uploading" } : f));
      try {
        const result = await processFile(pdfs[i], type, userId);
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
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "Failed to delete");
        return;
      }
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
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "Failed to delete");
        return;
      }
      await loadStatements();
    } finally {
      setDeletingKey(null);
    }
  }

  function reset() {
    setFiles([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    handleFiles(dropped);
  }, [type, userId]);

  return (
    <div className="relative">
      <Button size="sm" onClick={() => { setOpen((o) => !o); reset(); }}>
        + New Statement
      </Button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-96 rounded-lg border bg-background p-4 shadow-lg">
          <p className="text-sm font-medium mb-3">Upload statements</p>

          {/* Type toggle */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => { setType("portfolio"); reset(); }}
              className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition-colors ${
                type === "portfolio" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
              }`}
            >
              📊 Portfolio
            </button>
            <button
              onClick={() => { setType("transactions"); reset(); }}
              className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition-colors ${
                type === "transactions" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
              }`}
            >
              💳 Transactions
            </button>
          </div>

          {/* Loaded data panel */}
          <div className="mb-3 rounded-md border bg-muted/30 p-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
              Loaded
            </p>
            {loadingData && (
              <p className="text-xs text-muted-foreground">Loading…</p>
            )}
            {!loadingData && type === "portfolio" && (
              statements.length === 0 ? (
                <p className="text-xs text-muted-foreground">No portfolio statements yet.</p>
              ) : (
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {statements.map((s) => (
                    <li key={s.statement_date} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 truncate">{formatDate(s.statement_date)}</span>
                      <span className="text-muted-foreground">{s.positions} pos</span>
                      <button
                        onClick={() => deletePortfolio(s.statement_date)}
                        disabled={deletingKey === `p:${s.statement_date}`}
                        className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        aria-label={`Delete statement ${s.statement_date}`}
                      >
                        {deletingKey === `p:${s.statement_date}` ? "…" : "🗑"}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            )}
            {!loadingData && type === "transactions" && (
              !txSummary?.count ? (
                <p className="text-xs text-muted-foreground">No transactions yet.</p>
              ) : (
                <div className="flex items-center gap-2 text-xs">
                  <span className="flex-1">
                    {txSummary.count} transactions
                    {txSummary.minDate && txSummary.maxDate && (
                      <span className="text-muted-foreground">
                        {" · "}
                        {formatDate(txSummary.minDate)} – {formatDate(txSummary.maxDate)}
                      </span>
                    )}
                  </span>
                  <button
                    onClick={deleteTransactions}
                    disabled={deletingKey === "t:all"}
                    className="rounded px-2 py-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    {deletingKey === "t:all" ? "Deleting…" : "Delete all"}
                  </button>
                </div>
              )
            )}
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => { reset(); inputRef.current?.click(); }}
            className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
              dragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
            }`}
          >
            <p className="text-sm font-medium text-muted-foreground">
              Drop PDFs here
            </p>
            <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(Array.from(e.target.files));
            }}
          />

          {/* Per-file status list */}
          {files.length > 0 && (
            <ul className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
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
