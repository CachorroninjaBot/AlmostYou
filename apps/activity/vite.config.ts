import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, '../..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  const clientId =
    env.VITE_DISCORD_CLIENT_ID ||
    env.DISCORD_CLIENT_ID ||
    process.env.VITE_DISCORD_CLIENT_ID ||
    process.env.DISCORD_CLIENT_ID ||
    '';

  return {
    root,
    base: './',
    plugins: [react()],
    define: {
      __DISCORD_CLIENT_ID__: JSON.stringify(clientId),
    },
    resolve: {
      alias: {
        '@almost-you/shared': path.resolve(repoRoot, 'packages/shared/src/index.ts'),
        '@almost-you/game-core': path.resolve(repoRoot, 'packages/game-core/src/index.ts'),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false },
        '/ws': { target: 'http://127.0.0.1:3001', ws: true },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      target: 'es2022',
      sourcemap: false,
    },
  };
});
