import { BoxCcgAuth, CcgConfig } from "box-node-sdk";

let ccgAuth: BoxCcgAuth | null = null;
let ccgCached: { token: string; expiresAtMs: number } | null = null;

function getCcgAuth(): BoxCcgAuth {
  const clientId = process.env.BOX_CLIENT_ID?.trim();
  const clientSecret = process.env.BOX_CLIENT_SECRET?.trim();
  const enterpriseId = process.env.BOX_ENTERPRISE_ID?.trim();
  if (!clientId || !clientSecret || !enterpriseId) {
    throw new Error("CCG requires BOX_CLIENT_ID, BOX_CLIENT_SECRET, and BOX_ENTERPRISE_ID.");
  }
  if (!ccgAuth) {
    ccgAuth = new BoxCcgAuth({
      config: new CcgConfig({ clientId, clientSecret, enterpriseId }),
    });
  }
  return ccgAuth;
}

/**
 * Prefer CCG when BOX_CLIENT_ID + BOX_CLIENT_SECRET + BOX_ENTERPRISE_ID are set (production).
 * Otherwise use BOX_ACCESS_TOKEN or BOX_DEVELOPER_TOKEN (local / legacy).
 */
export async function resolveBoxAccessToken(): Promise<string> {
  const hasCcg =
    Boolean(process.env.BOX_CLIENT_ID?.trim()) &&
    Boolean(process.env.BOX_CLIENT_SECRET?.trim()) &&
    Boolean(process.env.BOX_ENTERPRISE_ID?.trim());

  if (hasCcg) {
    const now = Date.now();
    if (ccgCached && ccgCached.expiresAtMs > now + 30_000) {
      return ccgCached.token;
    }
    const auth = getCcgAuth();
    const at = await auth.refreshToken();
    const token = at.accessToken?.trim();
    if (!token) {
      throw new Error("Box CCG returned an empty access token.");
    }
    const ttlSec = at.expiresIn ?? 3600;
    ccgCached = { token, expiresAtMs: now + ttlSec * 1000 };
    return token;
  }

  const staticToken = process.env.BOX_ACCESS_TOKEN ?? process.env.BOX_DEVELOPER_TOKEN;
  const t = staticToken?.trim();
  if (!t) {
    throw new Error(
      "Missing Box auth: set BOX_CLIENT_ID, BOX_CLIENT_SECRET, BOX_ENTERPRISE_ID (CCG), or BOX_ACCESS_TOKEN / BOX_DEVELOPER_TOKEN."
    );
  }
  return t;
}
