/**
 * 生产构建（跨平台）：设置 NODE_ENV=production 后依次运行三个 esbuild 脚本，
 * 确保产物 minify 且不含 sourcemap，并清理上一次构建残留的 .map 文件。
 */
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const env = { ...process.env, NODE_ENV: 'production' };
const files = ['esbuild.main.mjs', 'esbuild.preload.mjs', 'esbuild.renderer.mjs'];

for (const file of files) {
  const result = spawnSync(process.execPath, [file], { stdio: 'inherit', env });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// 生产构建不应携带 sourcemap
for (const map of ['dist/main/index.js.map', 'dist/preload/index.js.map', 'dist/renderer/index.js.map']) {
  try {
    rmSync(map);
  } catch {
    // 文件不存在则忽略
  }
}

console.log('[build:prod] done (minified, no sourcemap)');
