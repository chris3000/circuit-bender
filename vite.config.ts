import { defineConfig, build, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Vite plugin that bundles AudioWorklet processor files into self-contained
 * IIFE scripts suitable for audioWorklet.addModule().
 *
 * In dev mode, Vite's dev server transforms .ts on the fly so `new URL()`
 * already works. In production builds this plugin intercepts the asset
 * reference, runs a secondary Vite build on the worklet entry, and emits
 * the result as a standalone JS asset.
 */
function audioWorkletPlugin(): Plugin {
  return {
    name: 'audio-worklet-bundle',
    enforce: 'pre',

    async generateBundle(_options, bundle) {
      // Find the raw .ts asset Vite emitted for the processor
      for (const key of Object.keys(bundle)) {
        if (key.includes('processor') && key.endsWith('.ts')) {
          // Remove the raw asset — we'll replace it with a bundled version
          delete bundle[key];
        }
      }

      // Build the worklet entry as a self-contained IIFE
      const result = await build({
        configFile: false,
        resolve: {
          alias: {
            '@': path.resolve(__dirname, './src'),
          },
        },
        build: {
          write: false,
          lib: {
            entry: path.resolve(__dirname, 'src/simulation/worklet/processor.ts'),
            formats: ['iife'],
            name: 'CircuitWorklet',
            fileName: () => 'audio-worklet-processor.js',
          },
          rollupOptions: {
            output: {
              // Prevent code-splitting — worklet must be a single file
              inlineDynamicImports: true,
            },
          },
          minify: true,
        },
      });

      // Emit the bundled worklet as an asset
      const output = Array.isArray(result) ? result[0] : result;
      if ('output' in output) {
        for (const chunk of output.output) {
          if (chunk.type === 'chunk') {
            this.emitFile({
              type: 'asset',
              fileName: 'audio-worklet-processor.js',
              source: chunk.code,
            });
          }
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), audioWorkletPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
