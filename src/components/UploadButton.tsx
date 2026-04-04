"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  userId: string;
}

type UploadType = "portfolio" | "transactions";

export default function UploadButton({ userId }: Props) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<UploadType>("portfolio");
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setStatus("uploading");
    setMessage("");

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(`/api/parse/${type}`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Parser error");
      }

      const payload = await res.json();

      // POST parsed rows to our Next.js API route, which writes to Supabase
      const ingestRes = await fetch(`/api/ingest/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload.rows, userId }),
      });

      if (!ingestRes.ok) throw new Error("Failed to save data");

      const result = await ingestRes.json();
      setStatus("done");
      setMessage(`✓ Saved ${result.count} rows`);
    } catch (err: unknown) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Upload failed");
    }
  }

  return (
    <div className="relative">
      <Button size="sm" onClick={() => setOpen((o) => !o)}>
        + New Statement
      </Button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-72 rounded-lg border bg-background p-4 shadow-lg">
          <p className="text-sm font-medium mb-3">Upload statement</p>

          {/* Type toggle */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setType("portfolio")}
              className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition-colors ${
                type === "portfolio"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted"
              }`}
            >
              📊 Portfolio
            </button>
            <button
              onClick={() => setType("transactions")}
              className={`flex-1 rounded-md border py-1.5 text-xs font-medium transition-colors ${
                type === "transactions"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted"
              }`}
            >
              💳 Transactions
            </button>
          </div>

          <p className="text-xs text-muted-foreground mb-3">
            {type === "portfolio"
              ? "Monthly portfolio snapshot PDF"
              : "Account statement PDF (transactions)"}
          </p>

          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />

          <Button
            size="sm"
            className="w-full"
            disabled={status === "uploading"}
            onClick={() => inputRef.current?.click()}
          >
            {status === "uploading" ? "Uploading…" : "Choose PDF"}
          </Button>

          {message && (
            <p
              className={`mt-2 text-xs ${status === "error" ? "text-red-500" : "text-green-600"}`}
            >
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
