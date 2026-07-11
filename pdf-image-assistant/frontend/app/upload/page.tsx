"use client";

import { AppShell } from "@/components/AppShell";
import { PDFUploader } from "@/components/PDFUploader";

export default function UploadPage() {
  return (
    <AppShell>
      <main className="mx-auto max-w-5xl px-5 py-8">
        <div className="mb-5">
          <h2 className="text-2xl font-semibold text-ink">Upload PDF</h2>
          <p className="mt-2 text-sm text-slate-600">Only PDF files are accepted. Corrupted files are rejected before storage.</p>
        </div>
        <PDFUploader />
      </main>
    </AppShell>
  );
}
