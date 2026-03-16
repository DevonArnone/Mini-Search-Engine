import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f2937",
        mist: "#eef2ff",
        ember: "#c2410c",
        ocean: "#0f766e",
        sand: "#fff7ed",
      },
      fontFamily: {
        sans: ["'Space Grotesk'", "ui-sans-serif", "system-ui"],
        display: ["'Sora'", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};

export default config;

