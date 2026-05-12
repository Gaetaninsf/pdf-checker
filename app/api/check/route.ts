import { NextRequest, NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import { normalize } from "@/lib/normalize";
import type { FileResult } from "@/types/results";

export type { FileResult };

function extractTextField(text: string, fieldName: string): string | null {
  // Match patterns like "Field Name: value" or "Field Name value" on same line
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}[:\\s]+([^\\n\\r]+)`, "i");
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const mode = formData.get("mode") as string;
  const field = formData.get("field") as string;
  const files = formData.getAll("files") as File[];

  if (!mode || !field || files.length === 0) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const results: FileResult[] = await Promise.all(
    files.map(async (file): Promise<FileResult> => {
      const filename = file.name.replace(/\.pdf$/i, "");
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const parsed = await pdfParse(buffer);

        let extractedValue: string | null = null;

        if (mode === "metadata") {
          const info = parsed.info as Record<string, string>;
          extractedValue = info[field] ?? null;
        } else {
          extractedValue = extractTextField(parsed.text, field);
        }

        if (extractedValue === null) {
          return { filename, extractedValue: null, match: null, error: `Field "${field}" not found` };
        }

        const match = normalize(filename) === normalize(extractedValue);
        return { filename, extractedValue, match };
      } catch (err) {
        return { filename, extractedValue: null, match: null, error: String(err) };
      }
    })
  );

  return NextResponse.json({ results });
}
