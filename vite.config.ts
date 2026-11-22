import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = import.meta.dirname;

// One HTML entry per Overwolf window. `public/` (manifest.json + icons) is
// copied verbatim into `dist/`, so `dist/` loads directly as an unpacked app.
export default defineConfig({
  // Overwolf serves files from overwolf-extension://<uid>/ — paths must be relative.
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120', // Overwolf ships a recent CEF/Chromium
    rollupOptions: {
      input: {
        background: resolve(root, 'background.html'),
        desktop: resolve(root, 'desktop.html'),
        in_game: resolve(root, 'in_game.html'),
      },
    },
  },
  server: {
    open: '/in_game.html',
  },
});
