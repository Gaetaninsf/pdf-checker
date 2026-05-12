/** Shared result shapes for API routes and the client UI (no server-only imports). */

export interface FileResult {
  filename: string;
  extractedValue: string | null;
  match: boolean | null;
  error?: string;
}

export interface BoxCheckRow {
  fileId: string;
  /** Web UI link to the file in Box (opens in browser when logged in). */
  boxFileUrl: string;
  name: string;
  stem: string;
  /** Path under the scanned root folder (e.g. "2024/K1s"). Empty when the PDF is in the root folder. */
  subfolderPath: string;
  partnerName: string | null;
  investmentNumber: string | null;
  match: boolean | null;
  matchPartner: boolean | null;
  matchInvestment: boolean | null;
  error?: string;
}
