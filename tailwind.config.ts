import type { Config } from "tailwindcss";

// Color tokens sourced directly from docs/03_User_Experience/Design_Language.md.
// Do not add new colors here without updating that document first — Design_Language.md
// is the source of truth, this file just implements it.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        base: "#F6F3EE",
        surface: "#FFFFFF",
        ink: "#3A342C",
        // Darkened from #7A6F60 during design review — that shade failed WCAG AA
        // (~4.4:1) against `base`. #6B6055 passes at ~5.5:1.
        "ink-muted": "#6B6055",
        accent: "#C98A3E",
        // #C98A3E fails WCAG AA for white text (~2.9:1). Use accent-strong for any
        // filled control with a white label (Accept, Save, Add, primary CTAs) — ~4.66:1, passes AA.
        "accent-strong": "#9C6A2E",
        trust: "#4B3F5E",
        calm: "#7A8B6F",
        urgent: "#B23A3A",
      },
      borderRadius: {
        card: "12px",
        control: "8px",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
