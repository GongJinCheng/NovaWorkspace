/** 当前工作区上下文工具。用于让 Todo、搜索、首页等模块按项目读写数据。 */
export function getCurrentWorkspaceRoot(): string | null {
  try {
    const store = window.__filesStore;
    const root = store?.getWorkspaceRoot?.() || store?.getState?.()?.workspaceRoot || localStorage.getItem('files-workspace-root') || '';
    return typeof root === 'string' && root.trim() ? root : null;
  } catch {
    return null;
  }
}

export function getRelativePath(rootPath: string | null | undefined, filePath: string | null | undefined): string | undefined {
  if (!rootPath || !filePath) return undefined;
  const root = normalize(rootPath);
  const file = normalize(filePath);
  if (file === root) return '';
  if (!file.startsWith(root.endsWith('/') ? root : root + '/')) return undefined;
  return file.slice((root.endsWith('/') ? root : root + '/').length);
}

export function resolveWorkspacePath(rootPath: string | null | undefined, relativePath: string | null | undefined): string | undefined {
  if (!rootPath || !relativePath) return undefined;
  const sep = rootPath.includes('\\') ? '\\' : '/';
  return rootPath.replace(/[\\/]$/, '') + sep + relativePath.replace(/[\\/]/g, sep);
}

function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}
