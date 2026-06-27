import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "German Voice Tutor",
  description: "Practice spoken German hands-free",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
