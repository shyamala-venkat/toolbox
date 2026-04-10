import type { Config } from 'tailwindcss';

// Tailwind v4 is primarily configured via CSS (@import "tailwindcss" + @theme)
// This file is kept for IDE tooling and any future plugin/preset usage.
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
