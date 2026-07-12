/**
 * Resolve a Markdown preview <img> src to an absolute file:// URL.
 * Extracted from EditorManager.resolvePreviewImagePaths — pure path logic,
 * no DOM. Returns null when the src should be left untouched.
 */

export function resolveImageSrc(src: string, currentFilePath: string, workspaceRoot: string): string | null {
  // Skip already-absolute URLs
  if (/^(https?:|file:|data:|blob:)/i.test(src)) return null;
  if (src.startsWith('/') || src.startsWith('\\')) return null;

  const sep = currentFilePath.includes('/') ? '/' : '\\';
  const fileDir = currentFilePath.substring(0, currentFilePath.lastIndexOf(sep));
  const rootDir = workspaceRoot.replace(/[\\/]+$/, '');

  // Try workspace-root-relative first (e.g. ".nova/images/foo.png")
  let absPath: string;
  if (src.startsWith('.nova/') || src.startsWith('.nova\\')) {
    absPath = rootDir + '/' + src;
  } else {
    // Otherwise resolve relative to the file's directory
    absPath = fileDir + '/' + src;
  }
  // Normalise to forward slashes and encode for file:// URL
  absPath = absPath.replace(/\\/g, '/');
  return 'file:///' + absPath.replace(/^\/+/, '');
}
