import { useState, useMemo } from "react";
import Head from "next/head";
import type { BoxCheckRow } from "@/types/results";
import CurrentUserBar from "@/components/CurrentUserBar";

function boxCheckSortPriority(r: BoxCheckRow): number {
  if (r.match === null) return 0;
  if (r.match === false) return 1;
  return 2;
}

function sortBoxCheckRows(rows: BoxCheckRow[]): BoxCheckRow[] {
  return [...rows].sort((a, b) => {
    const pa = boxCheckSortPriority(a);
    const pb = boxCheckSortPriority(b);
    if (pa !== pb) return pa - pb;
    const pathCmp = a.subfolderPath.localeCompare(b.subfolderPath, undefined, { sensitivity: "base" });
    if (pathCmp !== 0) return pathCmp;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export default function Home() {
  const [boxFolderId, setBoxFolderId] = useState("");
  const [boxResults, setBoxResults] = useState<BoxCheckRow[] | null>(null);
  const [boxError, setBoxError] = useState<string | null>(null);
  const [boxLoading, setBoxLoading] = useState(false);

  const onBoxCheck = async () => {
    setBoxLoading(true);
    setBoxError(null);
    setBoxResults(null);
    try {
      const res = await fetch("/api/box-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(boxFolderId.trim() ? { folderId: boxFolderId.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (data.results) setBoxResults(data.results as BoxCheckRow[]);
      if (!res.ok) {
        setBoxError(typeof data.error === "string" ? data.error : "Box check failed");
        return;
      }
    } finally {
      setBoxLoading(false);
    }
  };

  const boxMatch = boxResults?.filter((r) => r.match === true).length ?? 0;
  const boxMismatch = boxResults?.filter((r) => r.match === false).length ?? 0;
  const boxIssues = boxResults?.filter((r) => r.match === null).length ?? 0;

  const sortedBoxResults = useMemo(
    () => (boxResults?.length ? sortBoxCheckRows(boxResults) : []),
    [boxResults]
  );

  return (
    <>
      <Head>
        <title>Box K1 filename check</title>
        <meta name="description" content="Compare Box PDF filenames to K1 Partner Name and Investment Number metadata" />
      </Head>
      <CurrentUserBar />
      <main className="max-w-5xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Box folder check</h1>
        <p className="text-gray-500 text-sm mb-8">
          Recursively lists PDFs in a Box folder and all subfolders, then compares each filename to the{" "}
          <span className="font-medium text-gray-700">K1 Partner Name and Investment Number</span> template:{" "}
          <span className="font-medium text-gray-700">Investment Number</span> must appear in the filename. For{" "}
          <span className="font-medium text-gray-700">Partner Name</span>, the full name or its{" "}
          <span className="font-medium text-gray-700">last word</span> (e.g. last name) must appear. Matching ignores case and treats
          spaces, dashes, and underscores like spaces. Use the <span className="font-medium text-gray-700">Open</span> link to jump to
          the file in the Box web app (new tab).
        </p>

        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <label className="block text-sm text-gray-600 mb-1">Box folder ID (optional if BOX_FOLDER_ID is set)</label>
          <input
            type="text"
            placeholder="e.g. 123456789012"
            value={boxFolderId}
            onChange={(e) => {
              setBoxFolderId(e.target.value);
              setBoxResults(null);
              setBoxError(null);
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-2">
            Server auth (never in the browser): production uses{" "}
            <span className="font-mono">BOX_CLIENT_ID</span>, <span className="font-mono">BOX_CLIENT_SECRET</span>,{" "}
            <span className="font-mono">BOX_ENTERPRISE_ID</span> (CCG). For local testing you can use{" "}
            <span className="font-mono">BOX_ACCESS_TOKEN</span> or <span className="font-mono">BOX_DEVELOPER_TOKEN</span>{" "}
            in <span className="font-mono">.env.local</span> instead.
          </p>
        </div>

        <button
          type="button"
          onClick={onBoxCheck}
          disabled={boxLoading}
          className="w-full py-3 bg-slate-800 text-white rounded-xl font-medium hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors mb-6"
        >
          {boxLoading ? "Checking Box folder…" : "Check Box folder"}
        </button>

        {boxError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{boxError}</div>
        )}

        {boxResults && boxResults.length > 0 && (
          <div>
            <div className="flex gap-4 mb-4">
              <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-green-600">{boxMatch}</div>
                <div className="text-sm text-green-700">Both match</div>
              </div>
              <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-red-600">{boxMismatch}</div>
                <div className="text-sm text-red-700">Mismatch</div>
              </div>
              <div className="flex-1 bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-yellow-600">{boxIssues}</div>
                <div className="text-sm text-yellow-700">Missing / error</div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-3 text-gray-600 font-medium w-[32%]">Filename</th>
                    <th className="text-left px-3 py-3 text-gray-600 font-medium w-[18%]">Subfolder</th>
                    <th className="text-left px-3 py-3 text-gray-600 font-medium">Partner Name</th>
                    <th className="text-left px-3 py-3 text-gray-600 font-medium">Investment #</th>
                    <th className="text-left px-3 py-3 text-gray-600 font-medium">In filename</th>
                    <th className="text-left px-3 py-3 text-gray-600 font-medium">Status</th>
                    <th className="text-left px-3 py-3 text-gray-600 font-medium w-[72px]">Box</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedBoxResults.map((r) => (
                    <tr key={r.fileId} className="hover:bg-gray-50">
                      <td className="px-3 py-3 font-mono text-sm text-gray-700 break-all whitespace-normal align-top">
                        {r.name}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500 break-words align-top" title={r.subfolderPath || "(root folder)"}>
                        {r.subfolderPath ? r.subfolderPath : "—"}
                      </td>
                      <td className="px-3 py-3 text-gray-600 break-words align-top" title={r.partnerName ?? ""}>
                        {r.partnerName ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-gray-600 break-words align-top" title={r.investmentNumber ?? ""}>
                        {r.investmentNumber ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap align-top">
                        {r.matchPartner === true && <span className="text-green-700">Partner &#10003;</span>}
                        {r.matchPartner === false && <span className="text-red-700">Partner &#10005;</span>}
                        {r.matchPartner == null && <span className="text-gray-400">—</span>}
                        <span className="mx-1 text-gray-300">&middot;</span>
                        {r.matchInvestment === true && <span className="text-green-700">Inv &#10003;</span>}
                        {r.matchInvestment === false && <span className="text-red-700">Inv &#10005;</span>}
                        {r.matchInvestment == null && <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-3 align-top">
                        {r.match === true && (
                          <span className="inline-flex text-green-700 bg-green-50 px-2 py-1 rounded-full text-xs font-medium">
                            &#10003; Match
                          </span>
                        )}
                        {r.match === false && (
                          <span className="inline-flex text-red-700 bg-red-50 px-2 py-1 rounded-full text-xs font-medium">
                            &#10005; Mismatch
                          </span>
                        )}
                        {r.match === null && (
                          <span
                            className="inline-flex text-yellow-800 bg-yellow-50 px-2 py-1 rounded-full text-xs font-medium"
                            title={r.error}
                          >
                            &#9888; {r.error ? "Error" : "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top whitespace-nowrap">
                        <a
                          href={r.boxFileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          Open
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {boxResults && boxResults.length === 0 && !boxError && (
          <p className="text-sm text-gray-500">No PDF files in this folder.</p>
        )}
      </main>
    </>
  );
}
