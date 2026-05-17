import type { Request, Response } from "express";
import { resolveUserEmail } from "../lib/auth";

export function meHandler(req: Request, res: Response): void {
  const email = resolveUserEmail(req);
  if (!email) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({ email });
}
