import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

esbuild.build({
  entryPoints: ['src/renderer/app/index.ts'],
  bundle: true,
  outfile: 'dist/renderer/index.js',
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  sourcemap: true,
  alias: {
    '@shared': path.resolve(__dirname, 'src/shared'),
    '@renderer': path.resolve(__dirname, 'src/renderer'),
  },
}).catch(() => process.exit(1));
