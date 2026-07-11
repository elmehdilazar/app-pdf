"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, UploadCloud } from "lucide-react";

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
      setBusy(true);
      setProgress(15);
      const formData = new FormData();
      formData.append("file", file);
      try {
        const timer = window.setInterval(() => setProgress((value) => Math.min(value + 12, 88)), 220);
        const response = await fetch("/api/upload", { method: "POST", body: formData });
        window.clearInterval(timer);
        if (!response.ok) {
          const body = await response.json().catch(() => ({ detail: "Upload failed." }));
          throw new Error(body.detail ?? "Upload failed.");
        }
        const pdf = await response.json();
        setProgress(100);
        setMessage("Upload complete. Opening viewer...");
        setTimeout(() => router.push(`/viewer/${pdf.id}`), 450);
      } catch (err) {
        setError(err instanceof Error ? err.message : "The backend server may be offline.");
        setProgress(0);
      } finally {
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
