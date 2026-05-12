import { normalize } from "@/lib/normalize";
import type { BoxCheckRow } from "@/types/results";

const BOX_API = "https://api.box.com/2.0";

/** Box web app file page (works for most accounts; enterprise may redirect to your subdomain when logged in). */
export function boxWebFileUrl(fileId: string): string {
  return `https://app.box.com/file/${fileId}`;
}

export const K1_TEMPLATE_DISPLAY_NAME = "K1 Partner Name and Investment Number";
export const K1_FIELD_PARTNER_DISPLAY = "Partner Name";
export const K1_FIELD_INVESTMENT_DISPLAY = "Investment Number";

export type { BoxCheckRow };

interface BoxTemplateField {
  key: string;
  displayName?: string;
}

interface BoxMetadataTemplate {
  scope: string;
  templateKey: string;
  displayName?: string;
  fields?: BoxTemplateField[];
}

async function boxJson<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BOX_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text) as { message?: string };
      if (j.message) msg = j.message;
    } catch {
      /* keep raw */
    }
    throw new Error(`Box ${res.status}: ${msg}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function asTemplateArray(data: unknown): BoxMetadataTemplate[] {
  if (Array.isArray(data)) return data as BoxMetadataTemplate[];
  if (data && typeof data === "object" && "entries" in data && Array.isArray((data as { entries: unknown }).entries)) {
    return (data as { entries: BoxMetadataTemplate[] }).entries;
  }
  return [];
}

export function resolveK1Template(templates: BoxMetadataTemplate[]): BoxMetadataTemplate | null {
  const want = K1_TEMPLATE_DISPLAY_NAME.trim().toLowerCase();
  return (
    templates.find((t) => (t.displayName ?? "").trim().toLowerCase() === want) ?? null
  );
}

function fieldKeyForDisplay(fields: BoxTemplateField[] | undefined, displayName: string): string | undefined {
  const want = displayName.trim().toLowerCase();
  return fields?.find((f) => (f.displayName ?? "").trim().toLowerCase() === want)?.key;
}

function metadataValueString(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (Array.isArray(raw)) return raw.map((x) => String(x)).join(", ");
  return null;
}

/** Last whitespace-separated segment after normalizing (e.g. surname from "First Middle Last"). */
function normalizedLastSegment(partner: string): string | null {
  const parts = normalize(partner)
    .split(" ")
    .filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  return parts[parts.length - 1] ?? null;
}

/**
 * Investment: normalized value must appear in the filename stem.
 * Partner: match if the full normalized partner string appears, or if the last segment (e.g. last name) appears.
 */
export function filenameMatchesBothFields(stem: string, partner: string | null, investment: string | null): {
  match: boolean | null;
  matchPartner: boolean | null;
  matchInvestment: boolean | null;
} {
  const nStem = normalize(stem);
  const partnerTrim = partner?.trim() ?? "";
  const investTrim = investment?.trim() ?? "";
  const nP = partnerTrim !== "" ? normalize(partnerTrim) : null;
  const nI = investTrim !== "" ? normalize(investTrim) : null;

  if (!nP || !nI) {
    return { match: null, matchPartner: null, matchInvestment: null };
  }

  const lastSeg = normalizedLastSegment(partnerTrim);
  const matchPartner =
    nStem.includes(nP) || (lastSeg !== null && lastSeg.length > 0 && nStem.includes(lastSeg));
  const matchInvestment = nStem.includes(nI);
  return {
    match: matchPartner && matchInvestment,
    matchPartner,
    matchInvestment,
  };
}

interface FolderItemsResponse {
  entries: Array<{ id: string; name: string; type: string }>;
  total_count?: number;
  offset?: number;
  limit?: number;
}

/** Max folder nodes to visit (breadth across tree) to avoid runaway scans. */
const MAX_FOLDERS_TO_TRAVERSE = 5000;

async function listAllFolderEntries(token: string, folderId: string): Promise<Array<{ id: string; name: string; type: string }>> {
  const out: Array<{ id: string; name: string; type: string }> = [];
  let offset = 0;
  const limit = 1000;

  for (;;) {
    const q = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      fields: "id,name,type",
    });
    const data = await boxJson<FolderItemsResponse>(`/folders/${folderId}/items?${q}`, token);
    const entries = data.entries ?? [];
    out.push(...entries);
    if (entries.length === 0) break;
    if (entries.length < limit) break;
    offset += limit;
  }

  return out;
}

interface PdfInTree {
  id: string;
  name: string;
  /** Parent path under the root folder (no trailing slash). Empty = PDF sits in the root folder. */
  subfolderPath: string;
}

/**
 * Breadth-first walk: collect every PDF under `rootFolderId`, including nested subfolders.
 */
async function collectPdfFilesRecursive(token: string, rootFolderId: string): Promise<PdfInTree[]> {
  const pdfs: PdfInTree[] = [];
  const queue: Array<{ id: string; path: string }> = [{ id: rootFolderId, path: "" }];
  let foldersVisited = 0;

  while (queue.length > 0) {
    if (++foldersVisited > MAX_FOLDERS_TO_TRAVERSE) {
      throw new Error(
        `Stopped: exceeded ${MAX_FOLDERS_TO_TRAVERSE} folders while scanning (safety limit). Narrow the root folder or raise the limit in code.`
      );
    }
    const { id: folderId, path: parentPathUnderRoot } = queue.shift()!;
    const entries = await listAllFolderEntries(token, folderId);
    for (const e of entries) {
      if (e.type === "folder") {
        const nextPath = parentPathUnderRoot ? `${parentPathUnderRoot}/${e.name}` : e.name;
        queue.push({ id: e.id, path: nextPath });
      } else if (e.type === "file" && /\.pdf$/i.test(e.name)) {
        pdfs.push({ id: e.id, name: e.name, subfolderPath: parentPathUnderRoot });
      }
    }
  }

  return pdfs;
}

interface FileMetadataCollection {
  entries?: Record<string, unknown>[];
}

function findK1Instance(
  entries: Record<string, unknown>[] | undefined,
  scope: string,
  templateKey: string
): Record<string, unknown> | null {
  if (!entries?.length) return null;
  return (
    entries.find(
      (e) => String(e["$scope"] ?? "") === scope && String(e["$template"] ?? "") === templateKey
    ) ?? null
  );
}

export async function runBoxFolderK1Check(accessToken: string, folderId: string): Promise<{
  results: BoxCheckRow[];
  templateScope: string;
  templateKey: string;
  partnerFieldKey: string;
  investmentFieldKey: string;
  setupError?: string;
}> {
  let templates: BoxMetadataTemplate[];
  try {
    const raw = await boxJson<unknown>("/metadata_templates/enterprise", accessToken);
    templates = asTemplateArray(raw);
  } catch (e) {
    return {
      results: [],
      templateScope: "",
      templateKey: "",
      partnerFieldKey: "",
      investmentFieldKey: "",
      setupError: e instanceof Error ? e.message : String(e),
    };
  }

  const template = resolveK1Template(templates);
  if (!template) {
    return {
      results: [],
      templateScope: "",
      templateKey: "",
      partnerFieldKey: "",
      investmentFieldKey: "",
      setupError: `Metadata template not found: "${K1_TEMPLATE_DISPLAY_NAME}"`,
    };
  }

  const partnerFieldKey = fieldKeyForDisplay(template.fields, K1_FIELD_PARTNER_DISPLAY);
  const investmentFieldKey = fieldKeyForDisplay(template.fields, K1_FIELD_INVESTMENT_DISPLAY);
  if (!partnerFieldKey || !investmentFieldKey) {
    return {
      results: [],
      templateScope: template.scope,
      templateKey: template.templateKey,
      partnerFieldKey: partnerFieldKey ?? "",
      investmentFieldKey: investmentFieldKey ?? "",
      setupError: `Template is missing field keys for "${K1_FIELD_PARTNER_DISPLAY}" and/or "${K1_FIELD_INVESTMENT_DISPLAY}"`,
    };
  }

  let files: PdfInTree[];
  try {
    files = await collectPdfFilesRecursive(accessToken, folderId);
  } catch (e) {
    return {
      results: [],
      templateScope: template.scope,
      templateKey: template.templateKey,
      partnerFieldKey,
      investmentFieldKey,
      setupError: e instanceof Error ? e.message : String(e),
    };
  }

  const results: BoxCheckRow[] = await Promise.all(
    files.map(async (file): Promise<BoxCheckRow> => {
      const stem = file.name.replace(/\.pdf$/i, "");
      try {
        const coll = await boxJson<FileMetadataCollection>(`/files/${file.id}/metadata`, accessToken);
        const instance = findK1Instance(coll.entries, template.scope, template.templateKey);
        if (!instance) {
          return {
            fileId: file.id,
            boxFileUrl: boxWebFileUrl(file.id),
            name: file.name,
            stem,
            subfolderPath: file.subfolderPath,
            partnerName: null,
            investmentNumber: null,
            match: null,
            matchPartner: null,
            matchInvestment: null,
            error: "No metadata instance for this template on file",
          };
        }

        const partnerName = metadataValueString(instance[partnerFieldKey]);
        const investmentNumber = metadataValueString(instance[investmentFieldKey]);
        const { match, matchPartner, matchInvestment } = filenameMatchesBothFields(stem, partnerName, investmentNumber);

        if (match === null) {
          return {
            fileId: file.id,
            boxFileUrl: boxWebFileUrl(file.id),
            name: file.name,
            stem,
            subfolderPath: file.subfolderPath,
            partnerName,
            investmentNumber,
            match: null,
            matchPartner: null,
            matchInvestment: null,
            error: "Partner Name or Investment Number empty in Box metadata",
          };
        }

        return {
          fileId: file.id,
          boxFileUrl: boxWebFileUrl(file.id),
          name: file.name,
          stem,
          subfolderPath: file.subfolderPath,
          partnerName,
          investmentNumber,
          match,
          matchPartner,
          matchInvestment,
        };
      } catch (e) {
        return {
          fileId: file.id,
          boxFileUrl: boxWebFileUrl(file.id),
          name: file.name,
          stem,
          subfolderPath: file.subfolderPath,
          partnerName: null,
          investmentNumber: null,
          match: null,
          matchPartner: null,
          matchInvestment: null,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    })
  );

  return {
    results,
    templateScope: template.scope,
    templateKey: template.templateKey,
    partnerFieldKey,
    investmentFieldKey,
  };
}
