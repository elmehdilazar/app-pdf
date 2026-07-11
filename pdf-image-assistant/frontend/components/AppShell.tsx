"use client";

import Link from "next/link";
import { FileImage, FolderOpen, UploadCloud } from "lucide-react";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-mist">
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-brand text-white">
              <FileImage size={21} />
            </span>
            <div>
              <h1 className="text-lg font-semibold leading-5 text-ink">PDF Image Assistant</h1>
              <p className="text-xs text-slate-500">Local embedded image extraction</p>
            </div>
          </Link>
          <nav className="flex items-center gap-2">
            <Link className="control" href="/">
              <FolderOpen size={16} /> Library
            </Link>
            <Link className="control-primary" href="/upload">
              <UploadCloud size={16} /> Upload PDF
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
