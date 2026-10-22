import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cyclic Study",
  description: "A focused workspace for daily study revision.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
