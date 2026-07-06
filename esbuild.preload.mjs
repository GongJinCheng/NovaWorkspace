import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

esbuild.build({
  entryPoints: ['src/preload/index.ts'],
  bundle: true,
  outfile: 'dist/preload/index.js',
  platform: 'node',
  target: isProd ? 'node22' : 'node20',
  format: 'cjs',
  sourcemap: !isProd,
  minify: isProd,
  logLevel: 'info',
  external: ['electron'],
  alias: {
    '@shared': path.resolve(__dirname, 'src/shared'),
  },
}).catch((err) => {
  console.error('[build:preload] failed:', err);
  process.exit(1);
});
