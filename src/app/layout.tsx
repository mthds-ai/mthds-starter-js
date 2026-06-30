import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MTHDS Starter",
  description: "Minimal Next.js app calling an MTHDS API via the mthds SDK.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
