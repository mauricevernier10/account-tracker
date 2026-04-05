"use client";

import { useRef, useState } from "react";
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

export default function UploadButton({ userId }: Props) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<UploadType>("portfolio");
  const [files, setFiles] = useState<FileStatus[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const isUploading = files.some((f) => f.status === "uploading" || f.status === "pending");

  async function handleFiles(selected: FileList) {
    const newFiles: FileStatus[] = Array.from(selected).map((f) => ({
      name: f.name,
      status: "pending",
      message: "",
    }));
    setFiles(newFiles);

    // Process sequentially
    for (let i = 0; i < selected.length; i++) {
      setFiles((prev) => prev.map((f, idx) => idx === i ? { ...f, status: "uploading" } : f));
      try {
        const result = await processFile(selected[i], type, userId);
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
  }

  function reset() {
    setFiles([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="relative">
      <Button size="sm" onClick={() => { setOpen((o) => !o); reset(); }}>
        + New Statement
      </Button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 rounded-lg border bg-background p-4 shadow-lg">
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

          <p className="text-xs text-muted-foreground mb-3">
            {type === "portfolio"
              ? "Select one or more monthly portfolio PDFs"
              : "Select one or more account statement PDFs"}
          </p>

          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); }}
          />

          <Button
            size="sm"
            className="w-full"
            disabled={isUploading}
            onClick={() => { reset(); inputRef.current?.click(); }}
          >
            {isUploading ? "Uploading…" : "Choose PDFs"}
          </Button>

          {/* Per-file status list */}
          {files.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  <span className="shrink-0">
                    {f.status === "pending" && "⏳"}
                    {f.status === "uploading" && "⏳"}
                    {f.status === "done" && "✅"}
                    {f.status === "error" && "❌"}
                  </span>
                  <span className="truncate text-muted-foreground flex-1">{f.name}</span>
                  {f.message && (
                    <span className={f.status === "error" ? "text-red-500 shrink-0" : "text-green-600 shrink-0"}>
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
