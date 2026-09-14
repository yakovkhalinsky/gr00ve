import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves this project from https://<user>.github.io/gr00ve/, so
  // every asset URL needs the repo name as a prefix. Without this the deployed
  // page loads and renders nothing, because /assets/* 404s.
  //
  // A pleasant side effect: Pages is HTTPS, which satisfies Web MIDI's
  // secure-context requirement. A LAN address would not.
  base: '/gr00ve/',
  server: {
    port: 5273,
    // Web MIDI requires a secure context. `localhost` counts as secure, so the
    // dev server is fine — but note that a kiosk on a Raspberry Pi served from
    // a LAN address does NOT, and will need TLS. See docs/research-brief.md.
    host: 'localhost',
  },
  build: {
    target: 'es2023',
    sourcemap: true,
  },
});
