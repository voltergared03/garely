import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'oklch(0.18 0.012 250)',
          2: 'oklch(0.22 0.014 250)',
        },
        surface: {
          DEFAULT: 'oklch(0.245 0.016 250)',
          2: 'oklch(0.285 0.016 250)',
          3: 'oklch(0.33 0.018 250)',
        },
        border: {
          DEFAULT: 'oklch(0.34 0.018 250)',
          2: 'oklch(0.42 0.02 250)',
        },
        muted: {
          DEFAULT: 'oklch(0.62 0.012 250)',
          2: 'oklch(0.48 0.012 250)',
        },
        accent: {
          DEFAULT: '#3b82f6',
          2: '#60a5fa',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '14px',
        lg: '20px',
        sm: '10px',
      },
    },
  },
  plugins: [],
};

export default config;
