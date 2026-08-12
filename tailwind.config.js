/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'fantasy': {
          50: '#f7f5f1',
          100: '#ebe8e1',
          200: '#d5d0c7',
          300: '#b8b0a5',
          400: '#958d82',
          500: '#736d64',
          600: '#5b5953',
          700: '#444541',
          800: '#2d322f',
          900: '#1d2321',
          950: '#111615',
        },
        'midnight': {
          50: '#f6f7f5',
          100: '#e7e9e6',
          200: '#cdd2ce',
          300: '#abb3ae',
          400: '#858f89',
          500: '#67716c',
          600: '#505955',
          700: '#3d4642',
          800: '#29312f',
          900: '#19211f',
          950: '#0c1211',
        },
        'yellow': {
          50: '#f5f3ef',
          100: '#e7e3db',
          200: '#d1cabf',
          300: '#b9afa0',
          400: '#a09482',
          500: '#887b68',
          600: '#6f6454',
          700: '#574e43',
          800: '#423c34',
          900: '#2f2b26',
          950: '#1d1a17',
        },
        'purple': {
          50: '#f4f4f2',
          100: '#e7e7e3',
          200: '#d0d1cb',
          300: '#afb2ab',
          400: '#8b918a',
          500: '#6d746e',
          600: '#555d58',
          700: '#424944',
          800: '#303632',
          900: '#232825',
          950: '#121613',
        }
      },
      fontFamily: {
        'fantasy': ['Cinzel', 'serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'fantasy-gradient': 'linear-gradient(145deg, #111615 0%, #19211f 48%, #0c1211 100%)',
      }
    },
  },
  plugins: [],
};
