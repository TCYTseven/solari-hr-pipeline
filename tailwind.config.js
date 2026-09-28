// Design tokens pulled from getsolari.com (see docs/steps.md, Section 1).
// Tailwind v4 loads this file through `@config` in app/globals.css.
/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        bg: "#080A0E", raised: "#0B0D10", surface: "#17171D",
        teal: { 900: "#0F1514", 800: "#151E1D", 700: "#2A3C3A" },
        accent: { DEFAULT: "#F5B301", soft: "#F5C66A" },
        blue: "#0099FF",
        ink: { DEFAULT: "#FFFFFF", body: "#E7E7E2", muted: "#939599", faint: "#636363" },
        ok: "#9BD89A", fail: "#FF6B5A", warn: "#F5C66A",
        run: "#0099FF", skip: "#636363",
        line: { DEFAULT: "rgba(255,255,255,0.10)", strong: "rgba(255,255,255,0.16)" },
      },
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: { card: "10px", btn: "6px", badge: "4px" },
      maxWidth: { content: "1200px" },
    },
  },
};
