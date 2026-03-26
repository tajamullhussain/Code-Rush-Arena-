import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    // Base path - Yeh bohot important hai Vercel ke liye
    base: '/',

    plugins: [react(), tailwindcss()],

    // Environment variables ko sahi se inject kar rahe hain
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
      // Agar code mein import.meta.env.VITE_GEMINI_API_KEY use kar rahe ho to yeh bhi add kar sakte ho
      'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || ''),
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    // Server settings (development ke liye)
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
