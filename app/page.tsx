"use client";

import { useState, useCallback, useRef } from "react";
import type { FileResult } from "./api/check/route";

const METADATA_FIELDS = ["Title", "Author", "Subject", "Keywords", "Creator", "Producer"];

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<"text" | "metadata">("text");
  const [field, setField] = useState("");
  const [results, setResults] = useState<FileResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (newFiles: File[]) => {
    const pdfs = newFiles.filter((f) => f.type === "application/pdf" || f.name.endsWith(".pdf"));
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...pdfs.filter((f) => !names.has(f.name))];
    });
    setResults(null);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, []);

  const onCheck = async () => {
    if (!files.length || !field.trim()) return;
    setLoading(true);
    setResults(null);
    const formData = new FormData();
    formData.append("mode", mode);
    formData.append("field", field.trim());
    files.forEach((f) => formData.append("files", f));
    try {
      const res = await fetch("/api/check", { method: "POST", body: formData });
      const data = await res.json();
      setResults(data.results);
    } finally {
      setLoading(false);
    }
  };

  const matchCount = results?.filter((r) => r.match === true).length ?? 0;
  const mismatchCount = results?.filter((r) => r.match === false).length ?? 0;
  const errorCount = results?.filter((r) => r.match === null).length ?? 0;

  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">PDF Filename Checker</h1>
      <p className="text-gray-500 mb-8">Verify that filenames match a field inside your PDF documents.</p>

      {/* Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors mb-6 ${
          dragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
        />
        <div className="text-4xl mb-3">📄</div>
        <p className="text-gray-600 font-medium">Drop PDF files here or click to browse</p>
        <p className="text-gray-400 text-sm mt-1">Multiple files supported</p>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="mb-6 bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          <div className="px-4 py-3 flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">{files.length} file{files.length > 1 ? "s" : ""} selected</span>
            <button onClick={() => { setFiles([]); setResults(null); }} className="text-sm text-red-500 hover:text-red-700">Clear all</button>
          </div>
          {files.map((f) => (
            <div key={f.name} className="px-4 py-2 flex justify-between items-center text-sm text-gray-600">
              <span className="truncate mr-4">{f.name}</span>
              <button onClick={() => setFiles((prev) => prev.filter((x) => x.name !== f.name))} className="text-gray-400 hover:text-red-500 flex-shrink-0">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Config */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <p className="text-sm font-medium text-gray-700 mb-3">Extraction mode</p>
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => { setMode("text"); setField(""); }}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium border transition-colors ${
              mode === "text" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
            }`}
          >
            Text Field
          </button>
          <button
            onClick={() => { setMode("metadata"); setField("Title"); }}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium border transition-colors ${
              mode === "metadata" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
            }`}
          >
            PDF Metadata
          </button>
        </div>

        {mode === "text" ? (
          <div>
            <label className="block text-sm text-gray-600 mb-1">Field label to search for in document text</label>
            <input
              type="text"
              placeholder='e.g. "Invoice No" or "Contract ID"'
              value={field}
              onChange={(e) => setField(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">Looks for patterns like <span className="font-mono">Invoice No: ABC-123</span></p>
          </div>
        ) : (
          <div>
            <label className="block text-sm text-gray-600 mb-1">Metadata field</label>
            <select
              value={field}
              onChange={(e) => setField(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {METADATA_FIELDS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Check Button */}
      <button
        onClick={onCheck}
        disabled={!files.length || !field.trim() || loading}
        className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors mb-8"
      >
        {loading ? "Checking…" : "Check Files"}
      </button>

      {/* Results */}
      {results && (
        <div>
          <div className="flex gap-4 mb-4">
            <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{matchCount}</div>
              <div className="text-sm text-green-700">Match</div>
            </div>
            <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-red-600">{mismatchCount}</div>
              <div className="text-sm text-red-700">Mismatch</div>
            </div>
            <div className="flex-1 bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-yellow-600">{errorCount}</div>
              <div className="text-sm text-yellow-700">Not Found</div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Filename</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Extracted Value</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((r) => (
                  <tr key={r.filename} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-700 truncate max-w-[180px]">{r.filename}</td>
                    <td className="px-4 py-3 text-gray-500 truncate max-w-[180px]">
                      {r.extractedValue ?? <span className="text-gray-300 italic">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {r.match === true && <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-2 py-1 rounded-full text-xs font-medium">✓ Match</span>}
                      {r.match === false && <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 px-2 py-1 rounded-full text-xs font-medium">✕ Mismatch</span>}
                      {r.match === null && <span className="inline-flex items-center gap-1 text-yellow-700 bg-yellow-50 px-2 py-1 rounded-full text-xs font-medium" title={r.error}>⚠ Not Found</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
