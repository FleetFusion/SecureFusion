/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        ff: {
          green: '#16a34a',
          amber: '#d97706',
          red: '#dc2626',
          grey: '#6b7280',
        },
      },
    },
  },
  plugins: [],
};
