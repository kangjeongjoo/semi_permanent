import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#b56576",
          dark: "#8a4a5b",
          light: "#e8c9d1",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
