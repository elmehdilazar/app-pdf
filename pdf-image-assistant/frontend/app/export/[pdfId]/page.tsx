"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ExportOptionsPanel } from "@/components/ExportOptionsPanel";
import { api } from "@/lib/api";
import type { ExtractedImage, PDFDocument } from "@/lib/types";

export default function ExportPage() {
  const params = useParams<{ pdfId: string }>();
  const pdfId = params.pdfId;
  const [pdf, setPdf] = useState<PDFDocument | null>(null);
  const [images, setImages] = useState<ExtractedImage[]>([]);
  const [initialSelectedIds, setInitialSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [metadata, extracted] = await Promise.all([api.getPdf(pdfId), api.images(pdfId)]);
        setPdf(metadata);
        setImages(extracted);
        const stored = localStorage.getItem(`pdf-image-assistant:selected:${pdfId}`);
        setInitialSelectedIds(stored ? JSON.parse(stored) : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load export data.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [pdfId]);

  return (
    <AppShell>
      <main className="mx-auto max-w-[1500px] px-5 py-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-ink">Export images</h2>
            <p className="mt-2 text-sm text-slate-600">{pdf?.fileName ?? "PDF"} · choose format and download selected images.</p>
          </div>
          <Link className="control" href={`/viewer/${pdfId}`}>Back to viewer</Link>
        </div>
        {loading ? (
          <div className="panel p-6 text-sm text-slate-600">Loading export options...</div>
        ) : error ? (
          <div className="panel border-red-200 p-6 text-sm text-red-700">{error}</div>
        ) : images.length === 0 ? (
          <div className="panel p-8 text-center text-sm text-slate-600">
            No extracted images are available yet. Return to the viewer and run extraction first.
          </div>
        ) : (
          <ExportOptionsPanel images={images} initialSelectedIds={initialSelectedIds} />
        )}
      </main>
    </AppShell>
  );
}
