import type { Request, Response } from "express";
import { resolveBoxAccessToken } from "../lib/box-server-token";
import { runBoxFolderK1Check, K1_TEMPLATE_DISPLAY_NAME } from "../lib/box-folder-check";

export async function boxCheckHandler(req: Request, res: Response): Promise<void> {
  let token: string;
  try {
    token = await resolveBoxAccessToken();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({
      error: `${msg} Set secrets only on the server (e.g. .env.local or your host's env).`,
    });
    return;
  }

  let folderId = process.env.BOX_FOLDER_ID?.trim() ?? "";
  const body = req.body as { folderId?: string } | undefined;
  if (typeof body?.folderId === "string" && body.folderId.trim()) {
    folderId = body.folderId.trim();
  }

  if (!folderId) {
    res.status(400).json({
      error:
        'Missing folder id. Set BOX_FOLDER_ID in .env.local or send { "folderId": "..." } in the request body.',
    });
    return;
  }

  if (!/^\d+$/.test(folderId)) {
    res.status(400).json({ error: "Folder id must be a numeric Box folder id." });
    return;
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
    res.status(502).json({
      error: setupError,
      templateDisplayName: K1_TEMPLATE_DISPLAY_NAME,
      templateScope,
      templateKey,
      partnerFieldKey,
      investmentFieldKey,
      results,
    });
    return;
  }

  res.json({
    templateDisplayName: K1_TEMPLATE_DISPLAY_NAME,
    templateScope,
    templateKey,
    partnerFieldKey,
    investmentFieldKey,
    results,
  });
}
