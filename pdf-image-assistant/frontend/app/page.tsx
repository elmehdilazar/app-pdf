"use client";

import { AppShell } from "@/components/AppShell";
import { PDFLibrary } from "@/components/PDFLibrary";

export default function DashboardPage() {
  return (
    <AppShell>
      <main className="mx-auto max-w-[1500px] px-5 py-6">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-ink">PDF Image Assistant</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Upload PDFs, inspect each page, extract real embedded images, and export selected assets locally.
            </p>
          </div>
          <div className="rounded-md border border-amber-200 bg-amberSoft px-4 py-3 text-sm text-amber-900">
            Offline-first. No cloud database or authentication required.
          </div>
        </div>
        <PDFLibrary />
      </main>
    </AppShell>
  );
}
