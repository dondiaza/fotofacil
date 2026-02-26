import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        panel: "var(--panel)",
        line: "var(--line)",
        text: "var(--text)",
        muted: "var(--muted)",
        primary: "var(--primary)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)"
      },
      boxShadow: {
        soft: "0 12px 32px rgba(19, 34, 48, 0.08)"
      },
      borderRadius: {
        xl2: "1.1rem"
      }
    }
  },
  plugins: []
};

export default config;
