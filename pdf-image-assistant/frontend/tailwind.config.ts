import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17202a",
        mist: "#f6f8fb",
        line: "#dfe6ee",
        brand: "#0f8f9a",
        brandDark: "#0a6470",
        amberSoft: "#fff4d8"
      },
      boxShadow: {
        panel: "0 10px 30px rgba(26, 38, 52, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
