import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

esbuild.build({
  entryPoints: ['src/main/index.ts'],
  bundle: true,
  outfile: 'dist/main/index.js',
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  external: ['electron'],
  alias: {
    '@shared': path.resolve(__dirname, 'src/shared'),
    '@main': path.resolve(__dirname, 'src/main'),
  },
}).catch(() => process.exit(1));
