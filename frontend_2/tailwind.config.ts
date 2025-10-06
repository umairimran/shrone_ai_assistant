import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './context/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0b0f13',
        panel: '#141a1f',
        accent: '#1e3a8a'
      },
      animation: {
        'typing-dot': 'typingDot 1s infinite ease-in-out'
      },
      keyframes: {
        typingDot: {
          '0%, 80%, 100%': { opacity: '0.2' },
          '40%': { opacity: '1' }
        }
      }
    }
  },
  plugins: []
};

export default config;
