import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(rootDirectory, 'client'),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.join(rootDirectory, 'client', 'src') } },
  build: { outDir: path.join(rootDirectory, 'dist', 'client'), emptyOutDir: true },
  server: { host: '127.0.0.1', port: 5173, proxy: { '/api': 'http://127.0.0.1:3000' } },
});
