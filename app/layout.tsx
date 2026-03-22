import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PDF Filename Checker",
  description: "Verify PDF filenames match fields inside the documents",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
