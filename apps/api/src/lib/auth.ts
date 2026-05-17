import type { Request } from "express";

export function resolveUserEmail(req: Request): string | null {
  const header = req.headers["x-goog-authenticated-user-email"];
  if (header && typeof header === "string") {
    return header.replace(/^accounts\.google\.com:/, "");
  }
  const appEnv = process.env.APP_ENV || "local";
  if (appEnv === "local" || appEnv === "test") {
    return process.env.DEV_USER_EMAIL || "dev.user@example.com";
  }
  return null;
}
