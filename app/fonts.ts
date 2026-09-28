import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";

// Inter ships an optical-size axis on Google Fonts. With `opsz` loaded, the
// browser's default `font-optical-sizing: auto` renders large headings with the
// Inter Display cut that getsolari.com uses, so no separate display font is needed.
export const inter = Inter({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-inter",
  display: "swap",
});

// Closest free stand-in for Inter Display, kept as the display fallback.
export const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
  preload: false,
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const fontVariables = [inter.variable, interTight.variable, jetbrainsMono.variable].join(" ");
