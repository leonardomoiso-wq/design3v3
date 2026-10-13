import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      // I titoli usavano font-serif (Georgia) per un tono editoriale: qui
      // rimappiamo lo stack a una famiglia stile Helvetica, più
      // contemporanea e coerente col resto del sito, senza dover toccare
      // ogni singolo componente che già usa la classe font-serif.
      fontFamily: {
        serif: ['Helvetica Neue', 'Helvetica', 'Arial', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
