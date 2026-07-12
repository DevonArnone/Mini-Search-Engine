import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        mist: "#eef7ff",
        ember: "#e14b35",
        ocean: "#0f8b8d",
        sand: "#f8fbff",
      },
      fontFamily: {
        sans: ["'Space Grotesk'", "ui-sans-serif", "system-ui"],
        display: ["'Sora'", "ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        premium: "0 24px 80px rgba(15, 23, 42, 0.12)",
        soft: "0 14px 40px rgba(15, 23, 42, 0.08)",
        glow: "0 24px 90px rgba(20, 184, 166, 0.22)",
        "inner-soft": "inset 0 1px 0 rgba(255, 255, 255, 0.78)",
      },
      keyframes: {
        "rise-in": {
          "0%": { opacity: "0", transform: "translateY(18px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        shimmer: {
          "0%": { transform: "translateX(-110%)" },
          "100%": { transform: "translateX(110%)" },
        },
      },
      animation: {
        "rise-in": "rise-in 700ms cubic-bezier(0.16, 1, 0.3, 1) both",
        float: "float 5s ease-in-out infinite",
        shimmer: "shimmer 2.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
