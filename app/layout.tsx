import type { Metadata } from "next";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Solari Screener",
  description:
    "Every fork of the Solari repo, cloned into a Solari Sandbox, opened in a Solari Browser or Desktop, and demoed by an AI agent.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="min-h-dvh flex flex-col">{children}</body>
    </html>
  );
}
