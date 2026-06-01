/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#1E3A5F",
        secondary: "#2E75B6",
        accent: "#7C3AED",
        success: "#059669",
        warning: "#D97706",
        danger: "#DC2626",
        surface: "#F8FAFC",
        border: "#E2E8F0",
        textPrimary: "#1F2937",
        textMuted: "#6B7280"
      },
      borderRadius: {
        card: "12px",
        button: "8px",
        input: "6px"
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.06)"
      }
    }
  },
  plugins: []
};

