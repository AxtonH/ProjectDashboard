/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        surface: '#f7f8fa',
        divider: '#eceff3',
        status: {
          pending: '#f4b740',
          progress: '#f7c948',
          review: '#f9703e',
          hold: '#f05d5e',
          done: '#39b980',
          notStarted: '#d5dae1',
        },
        role: {
          owner: '#4f46e5',
          designer: '#0ea5e9',
          strategist: '#a855f7',
        },
      },
    },
  },
  plugins: [],
};
