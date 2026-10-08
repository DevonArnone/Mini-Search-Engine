import localFont from "next/font/local";

// Self-hosted variable fonts (see src/fonts/README.md for sources and licenses).
export const display = localFont({
  src: [
    { path: "../fonts/Fraunces-Variable.woff2", style: "normal" },
    { path: "../fonts/Fraunces-Variable-Italic.woff2", style: "italic" },
  ],
  weight: "100 900",
  variable: "--font-display",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

export const sans = localFont({
  src: [
    { path: "../fonts/PublicSans-Variable.woff2", style: "normal" },
    { path: "../fonts/PublicSans-Variable-Italic.woff2", style: "italic" },
  ],
  weight: "100 900",
  variable: "--font-sans",
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
});

export const mono = localFont({
  src: "../fonts/JetBrainsMono-Variable.woff2",
  weight: "100 800",
  variable: "--font-mono",
  display: "swap",
  // Only measurements and code use it, so it is not worth blocking first paint on.
  preload: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});
