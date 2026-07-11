/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}', '../packages/ui/src/**/*.{js,jsx}', '../modules/*/src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: { extend: {} },
  plugins: [],
}
