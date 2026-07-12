/**
 * Map file extensions to Monaco language ids.
 * Extracted from editor-manager.ts (detectLanguage) — pure, no state.
 */

const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  md: 'markdown',
  html: 'html',
  css: 'css',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
};

export function detectLanguage(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return LANGUAGE_MAP[ext] ?? 'plaintext';
}
