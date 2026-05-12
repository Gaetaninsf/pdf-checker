import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Box K1 filename check",
  description: "Compare Box PDF filenames to K1 Partner Name and Investment Number metadata",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
