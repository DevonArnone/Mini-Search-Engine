import type { Config } from "tailwindcss";

// Colors are CSS custom properties defined per theme in globals.css, stored
// as space-separated RGB channels so Tailwind's opacity modifiers work.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: token("paper"), raised: token("paper-raised"), sunk: token("paper-sunk") },
        ink: { DEFAULT: token("ink"), soft: token("ink-soft"), faint: token("ink-faint") },
        rule: { DEFAULT: token("rule"), strong: token("rule-strong") },
        marker: token("marker"),
        focus: token("focus"),
        ok: token("ok"),
        warn: token("warn"),
        bad: token("bad"),
        // The current source's bookcloth, set by a [data-source] ancestor.
        cloth: { DEFAULT: token("cloth"), ink: token("cloth-ink"), text: token("cloth-text") },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Product scale (fixed rem), 1.2 ratio.
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
        xs: ["0.75rem", { lineHeight: "1.125rem" }],
        sm: ["0.875rem", { lineHeight: "1.375rem" }],
        base: ["1rem", { lineHeight: "1.625rem" }],
        lg: ["1.125rem", { lineHeight: "1.75rem" }],
        xl: ["1.375rem", { lineHeight: "1.875rem" }],
        "2xl": ["1.75rem", { lineHeight: "2.125rem" }],
        "3xl": ["2.25rem", { lineHeight: "2.5rem" }],
        "4xl": ["3rem", { lineHeight: "3.125rem" }],
      },
      borderRadius: { none: "0", sm: "2px", DEFAULT: "2px", md: "3px", lg: "4px", full: "9999px" },
      boxShadow: {
        // Sheets and menus that lift off the page.
        lift: "0 1px 1px rgb(var(--shadow) / 0.08), 0 8px 24px -6px rgb(var(--shadow) / 0.22)",
        sheet: "-12px 0 40px -12px rgb(var(--shadow) / 0.35)",
      },
      maxWidth: { page: "84rem", prose: "68ch" },
      transitionTimingFunction: { out: "cubic-bezier(0.16, 1, 0.3, 1)" },
      keyframes: {
        "sheet-in": { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "menu-in": { from: { opacity: "0", transform: "translateY(-4px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        pulse: { "50%": { opacity: "0.45" } },
      },
      animation: {
        "sheet-in": "sheet-in 220ms cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in": "fade-in 180ms ease-out",
        "menu-in": "menu-in 160ms cubic-bezier(0.16, 1, 0.3, 1)",
        pulse: "pulse 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
