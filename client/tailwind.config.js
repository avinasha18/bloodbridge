/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        blood: {
          50:  "#fff1f2",
          100: "#ffe4e6",
          200: "#fecdd3",
          300: "#fda4af",
          400: "#fb7185",
          500: "#f43f5e",
          600: "#e11d48",
          700: "#be123c",
          800: "#9f1239",
          900: "#881337",
          950: "#4c0519",
        },
        ink: {
          50:  "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
          950: "#020617",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        "xs": "0 1px 2px 0 rgb(0 0 0 / 0.03)",
        "card": "0 1px 3px rgb(0 0 0 / 0.04), 0 4px 12px -2px rgb(0 0 0 / 0.05)",
        "card-hover": "0 8px 24px -4px rgb(0 0 0 / 0.08), 0 2px 6px -1px rgb(0 0 0 / 0.04)",
        "elevated": "0 8px 30px -4px rgb(0 0 0 / 0.08), 0 4px 12px -4px rgb(0 0 0 / 0.04)",
        "panel": "0 20px 60px -12px rgb(0 0 0 / 0.12), 0 8px 20px -8px rgb(0 0 0 / 0.06)",
        "glow-blood": "0 0 0 3px rgb(225 29 72 / 0.1), 0 4px 12px -2px rgb(225 29 72 / 0.15)",
        "glow-indigo": "0 0 0 3px rgb(99 102 241 / 0.1), 0 4px 12px -2px rgb(99 102 241 / 0.15)",
      },
      transitionTimingFunction: {
        "spring": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [],
};
