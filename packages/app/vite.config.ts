import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the build works from any sub-path (GitHub Pages serves /nethack-web/).
  base: './',
  worker: { format: 'es' },
  server: { host: false },
  build: { target: 'es2022' },
});
