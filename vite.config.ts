import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      // Split heavy, independent vendors out of the main bundle for a faster
      // first paint. The bundler still resolves load order via the module graph.
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return;
            // Isolate three.js + recharts so they stay in their own lazy chunks
            // (only imported by the lazily-loaded 3D dashboard / Quant Lab) instead
            // of being glued into the eager `vendor` chunk and hurting first paint.
            if (/node_modules[\\/]three[\\/]/.test(id)) return 'three-vendor';
            if (id.includes('recharts') || id.includes('victory-vendor')) return 'recharts-vendor';
            if (id.includes('lightweight-charts')) return 'charts-vendor';
            if (id.includes('react-dom') || id.includes('scheduler') || /node_modules[\\/]react[\\/]/.test(id)) return 'react-vendor';
            if (id.includes('motion')) return 'motion-vendor';
            return 'vendor';
          },
        },
      },
    },
  };
});
