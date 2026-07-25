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
        "ink-muted": "#7A6F60",
        accent: "#C98A3E",
        trust: "#4B3F5E",
        calm: "#7A8B6F",
        urgent: "#B23A3A",
      },
      borderRadius: {
        card: "12px",
        control: "8px",
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        body: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
