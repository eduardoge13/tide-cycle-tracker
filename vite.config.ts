import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
  "font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; " +
  "base-uri 'self'; form-action 'none'";

/**
 * Production-only hardening + offline shell:
 *  - injects a strict Content-Security-Policy (blocks any third-party request)
 *  - emits sw.js with a precache list of every built file, versioned by hash
 */
function offlineShell(): Plugin {
  return {
    name: 'tide-offline-shell',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
    generateBundle(_options, bundle) {
      const publicFiles = [
        'manifest.webmanifest',
        'icons/icon.svg',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-maskable-512.png',
        'icons/apple-touch-icon.png',
      ];
      const files = ['./', 'index.html', ...Object.keys(bundle), ...publicFiles].filter(
        (f) => !f.endsWith('.map') && f !== 'sw.js',
      );
      const version = createHash('sha256').update(files.sort().join('|')).digest('hex').slice(0, 12);
      const template = readFileSync(new URL('./src/sw-template.js', import.meta.url), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(files)),
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), offlineShell()],
  build: { sourcemap: false, target: 'es2020' },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
