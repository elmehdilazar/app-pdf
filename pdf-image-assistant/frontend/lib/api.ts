import type { ExtractedImage, PDFDocument, Thumbnail } from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: "Request failed." }));
    throw new Error(body.detail ?? "Request failed.");
  }
  return response.json() as Promise<T>;
}

export const api = {
  listPdfs: () => request<PDFDocument[]>("/api/pdfs", { cache: "no-store" }),
  getPdf: (pdfId: string) => request<PDFDocument>(`/api/pdfs/${pdfId}`, { cache: "no-store" }),
  deletePdf: (pdfId: string) => request<{ status: string }>(`/api/pdfs/${pdfId}`, { method: "DELETE" }),
  thumbnails: (pdfId: string) => request<Thumbnail[]>(`/api/pdfs/${pdfId}/thumbnails`, { cache: "no-store" }),
  extractImages: (pdfId: string, precision: ExtractionPrecision) =>
    request<{ count: number; precision: ExtractionPrecision; images: ExtractedImage[] }>(
      `/api/pdfs/${pdfId}/extract-images?precision=${precision}`,
      { method: "POST" }
    ),
  extractSelection: (pdfId: string, page: number, selection: ManualSelection) =>
    request<ExtractedImage>(`/api/pdfs/${pdfId}/page/${page}/extract-selection`, {
      method: "POST",
      body: JSON.stringify(selection)
    }),
  images: (pdfId: string) => request<ExtractedImage[]>(`/api/pdfs/${pdfId}/images`, { cache: "no-store" }),
  text: (pdfId: string) => request<{ pdfId: string; pages: { pageNumber: number; text: string }[]; text: string }>(`/api/pdfs/${pdfId}/text`)
};

export type ExtractionPrecision = "low" | "balanced" | "high" | "manual";
export type ManualSelection = { x: number; y: number; width: number; height: number };

export function fileUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
