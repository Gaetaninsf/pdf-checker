import { NextRequest, NextResponse } from "next/server";
import { resolveBoxAccessToken } from "@/lib/box-server-token";
import { runBoxFolderK1Check, K1_TEMPLATE_DISPLAY_NAME } from "@/lib/box-folder-check";
import type { BoxCheckRow } from "@/types/results";

export type { BoxCheckRow };

export async function POST(req: NextRequest) {
  let token: string;
  try {
    token = await resolveBoxAccessToken();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error: `${msg} Set secrets only on the server (e.g. .env.local or your host’s env).`,
      },
      { status: 500 }
    );
  }

  let folderId = process.env.BOX_FOLDER_ID?.trim() ?? "";
  try {
    const body = (await req.json()) as { folderId?: string };
    if (typeof body?.folderId === "string" && body.folderId.trim()) {
      folderId = body.folderId.trim();
    }
  } catch {
    /* no body */
  }

  if (!folderId) {
    return NextResponse.json(
      {
        error:
          "Missing folder id. Set BOX_FOLDER_ID in .env.local or send { \"folderId\": \"...\" } in the request body.",
      },
      { status: 400 }
    );
  }

  // Box folder IDs are numeric; reject other characters so the id cannot alter REST paths.
  if (!/^\d+$/.test(folderId)) {
    return NextResponse.json({ error: "Folder id must be a numeric Box folder id." }, { status: 400 });
  }

  const {
    results,
    templateScope,
    templateKey,
    partnerFieldKey,
    investmentFieldKey,
    setupError,
  } = await runBoxFolderK1Check(token, folderId);

  if (setupError) {
    return NextResponse.json(
      {
        error: setupError,
        templateDisplayName: K1_TEMPLATE_DISPLAY_NAME,
        templateScope,
        templateKey,
        partnerFieldKey,
        investmentFieldKey,
        results,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    templateDisplayName: K1_TEMPLATE_DISPLAY_NAME,
    templateScope,
    templateKey,
    partnerFieldKey,
    investmentFieldKey,
    results,
  });
}
