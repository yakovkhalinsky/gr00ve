import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

const here = fileURLToPath(new URL('.', import.meta.url));

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
    fs: {
      // The guide page imports docs/using-gr00ve.md, which lives outside the
      // app directory. The dev server refuses to serve files above the project
      // root by default; the workspace root is the honest boundary here.
      allow: [searchForWorkspaceRoot(process.cwd())],
    },
  },
  build: {
    target: 'es2023',
    sourcemap: true,
    rollupOptions: {
      // Three pages: the sequencer, the guide, and the Tracker .mtp exporter.
      // Multi-page rather than routes inside the app, because each should be
      // readable and linkable without loading an audio application first, and
      // the exporter is a different instrument with its own state.
      input: {
        main: `${here}index.html`,
        guide: `${here}guide.html`,
        tracker: `${here}tracker.html`,
      },
    },
  },
});
