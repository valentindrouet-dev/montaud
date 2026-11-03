import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Chemins relatifs : fonctionne à la racine comme sous /montaud/ (GitHub Pages)
  base: './',
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:3001' },
  },
});
