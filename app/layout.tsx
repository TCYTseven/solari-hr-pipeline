import type { Metadata, Viewport } from "next";
import { Footer } from "@/ui/Footer";
import { Nav } from "@/ui/Nav";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Solari Screener", template: "%s · Solari Screener" },
  description:
    "Every fork of the Solari repo, cloned into a Solari Sandbox, opened in a Solari Browser or Desktop, and demoed by an AI agent.",
};

export const viewport: Viewport = {
  themeColor: "#080A0E",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="flex min-h-dvh flex-col">
        <Nav />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer lastScanAt={null} />
      </body>
    </html>
  );
}
