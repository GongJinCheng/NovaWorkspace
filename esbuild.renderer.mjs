import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

esbuild.build({
  entryPoints: ['src/renderer/app/index.ts'],
  bundle: true,
  outfile: 'dist/renderer/index.js',
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  sourcemap: !isProd,
  minify: isProd,
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
  },
  alias: {
    '@shared': path.resolve(__dirname, 'src/shared'),
    '@renderer': path.resolve(__dirname, 'src/renderer'),
  },
}).catch((err) => {
  console.error('[build:renderer] failed:', err);
  process.exit(1);
});
