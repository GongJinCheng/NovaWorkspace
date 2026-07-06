import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

esbuild.build({
  entryPoints: ['src/main/index.ts'],
  bundle: true,
  outfile: 'dist/main/index.js',
  platform: 'node',
  target: isProd ? 'node22' : 'node20',
  format: 'cjs',
  sourcemap: !isProd,
  minify: isProd,
  logLevel: 'info',
  external: ['electron'],
  alias: {
    '@shared': path.resolve(__dirname, 'src/shared'),
    '@main': path.resolve(__dirname, 'src/main'),
  },
}).catch((err) => {
  console.error('[build:main] failed:', err);
  process.exit(1);
});
