"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, Trash2 } from "lucide-react";
import { api, formatBytes } from "@/lib/api";
import type { PDFDocument } from "@/lib/types";

export function PDFLibrary() {
  const [pdfs, setPdfs] = useState<PDFDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setPdfs(await api.listPdfs());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backend server is offline.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(pdfId: string) {
    await api.deletePdf(pdfId);
    setPdfs((rows) => rows.filter((row) => row.id !== pdfId));
  }

  if (loading) return <div className="panel p-6 text-sm text-slate-600">Loading local PDFs...</div>;
  if (error) return <div className="panel border-red-200 p-6 text-sm text-red-700">{error}</div>;

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">Uploaded PDFs</h2>
          <p className="text-sm text-slate-500">{pdfs.length} file{pdfs.length === 1 ? "" : "s"} stored locally</p>
        </div>
        <Link className="control-primary" href="/upload">Upload PDF</Link>
      </div>
      {pdfs.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-slate-500">No PDFs yet. Upload a document to extract embedded images.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">File name</th>
                <th className="px-5 py-3">Size</th>
                <th className="px-5 py-3">Upload date</th>
                <th className="px-5 py-3">Pages</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {pdfs.map((pdf) => (
                <tr key={pdf.id} className="bg-white">
                  <td className="px-5 py-4 font-medium text-ink">{pdf.fileName}</td>
                  <td className="px-5 py-4 text-slate-600">{formatBytes(pdf.size)}</td>
                  <td className="px-5 py-4 text-slate-600">{new Date(pdf.uploadDate).toLocaleString()}</td>
                  <td className="px-5 py-4 text-slate-600">{pdf.pages}</td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <Link className="control" href={`/viewer/${pdf.id}`}><Eye size={15} /> Open</Link>
                      <button className="control text-red-700 hover:border-red-300 hover:text-red-800" onClick={() => remove(pdf.id)}>
                        <Trash2 size={15} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
