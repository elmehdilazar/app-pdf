"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, UploadCloud } from "lucide-react";
import { API_BASE } from "@/lib/api";

const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;
const UPLOAD_API_BASE = API_BASE || "http://localhost:8000";

export function PDFUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const upload = useCallback(
    async (file?: File) => {
      setError("");
      setMessage("");
      if (!file) return;
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        setError("Please choose a valid PDF file.");
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setError("PDF is too large. The local limit is 250 MB.");
        return;
      }
      setBusy(true);
      setProgress(15);
      const formData = new FormData();
      formData.append("file", file);
      let timer: number | undefined;
      try {
        timer = window.setInterval(() => setProgress((value) => Math.min(value + 12, 88)), 220);
        const response = await fetch(`${UPLOAD_API_BASE}/api/upload`, { method: "POST", body: formData });
        if (!response.ok) {
          const responseText = await response.text();
          let detail = responseText || `Upload failed (${response.status}).`;
          try {
            const body = JSON.parse(responseText) as { detail?: string };
            detail = body.detail || detail;
          } catch {
            // Keep a plain-text server or proxy error when the response is not JSON.
          }
          throw new Error(detail);
        }
        const pdf = await response.json();
        setProgress(100);
        setMessage("Upload complete. Opening viewer...");
        setTimeout(() => router.push(`/viewer/${pdf.id}`), 450);
      } catch (err) {
        const detail = err instanceof Error ? err.message : "Unknown upload error.";
        setError(detail === "Failed to fetch" ? "Cannot reach the PDF backend at http://localhost:8000. Start the backend and try again." : detail);
        setProgress(0);
      } finally {
        if (timer !== undefined) window.clearInterval(timer);
        setBusy(false);
      }
    },
    [router]
  );

  return (
    <section
      className={`panel flex min-h-[360px] flex-col items-center justify-center border-2 border-dashed px-6 py-12 text-center transition ${
        dragging ? "border-brand bg-cyan-50" : "border-line"
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        upload(event.dataTransfer.files[0]);
      }}
    >
      <input ref={inputRef} className="hidden" type="file" accept="application/pdf" onChange={(event) => upload(event.target.files?.[0])} />
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-lg bg-brand text-white">
        <UploadCloud size={30} />
      </div>
      <h2 className="text-2xl font-semibold text-ink">Drop a PDF here</h2>
      <p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">
        Files stay on this computer. The backend validates the PDF with PyMuPDF before it appears in your library.
      </p>
      <button className="control-primary mt-6" disabled={busy} onClick={() => inputRef.current?.click()}>
        Choose PDF
      </button>
      {progress > 0 && (
        <div className="mt-6 w-full max-w-md">
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-500">{progress}% uploaded</p>
        </div>
      )}
      {message && (
        <p className="mt-5 flex items-center gap-2 text-sm font-medium text-emerald-700">
          <CheckCircle2 size={16} /> {message}
        </p>
      )}
      {error && (
        <p className="mt-5 flex items-center gap-2 text-sm font-medium text-red-700">
          <AlertCircle size={16} /> {error}
        </p>
      )}
    </section>
  );
}
