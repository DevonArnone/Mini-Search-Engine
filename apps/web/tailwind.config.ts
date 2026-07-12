import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f5f7f8",
        ink: "#172126",
        muted: "#5f6b73",
        line: "#dde2e5",
        "line-strong": "#c8d0d4",
        teal: {
          50: "#eff9f7",
          100: "#dff3ef",
          200: "#bfe7e0",
          300: "#8fd4ca",
          400: "#55b9ac",
          500: "#2d9a90",
          600: "#16837b",
          700: "#0c766e",
          800: "#105e59",
          900: "#104e4a",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["SFMono-Regular", "Consolas", "Liberation Mono", "monospace"],
        display: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        panel: "0 1px 2px rgba(23, 33, 38, 0.05), 0 8px 24px rgba(23, 33, 38, 0.04)",
        card: "0 1px 2px rgba(23, 33, 38, 0.05)",
      },
    },
  },
  plugins: [],
};

export default config;
