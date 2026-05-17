export interface BoxCheckRow {
  fileId: string;
  boxFileUrl: string;
  name: string;
  stem: string;
  subfolderPath: string;
  partnerName: string | null;
  investmentNumber: string | null;
  match: boolean | null;
  matchPartner: boolean | null;
  matchInvestment: boolean | null;
  error?: string;
}
