import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#FFFFFF",
        "bg-surface": "#F5F5F7",
        "text-main": "#1D1D1F",
        "text-sec": "#6E6E73",
        "text-mut": "#AEAEB2",
        accent: "#E8364E",
        blue: "#3478F6",
        "blue-lt": "#EBF2FF",
        gold: "#D4930D",
        "gold-lt": "#FFF8EB",
        "red-lt": "#FFF0F1",
        green: "#28A745",
        "green-lt": "#EDFAF1",
        purple: "#8B5CF6",
        "purple-lt": "#F3EEFF",
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "var(--font-mono)",
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
      borderRadius: {
        card: "16px",
        btn: "12px",
        badge: "8px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.06)",
        photo: "0 2px 12px rgba(0,0,0,0.08)",
        avatar: "0 2px 8px rgba(0,0,0,0.12)",
        float: "0 10px 40px rgba(0,0,0,0.12)",
      },
      maxWidth: {
        app: "480px",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        fadeIn: "fadeIn 200ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
