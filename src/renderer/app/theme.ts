/**
 * Theme — 主题切换管理
 */

type Theme = 'dark' | 'light';

let currentTheme: Theme = 'dark';

export function initTheme(): void {
  const saved = (localStorage.getItem('theme') as Theme) || 'dark';
  setTheme(saved);
}

export function toggleTheme(): void {
  setTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

export function setTheme(theme: Theme): void {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  
  // Update Monaco editor theme if available
  const editorManager = (window as any).__editorManager;
  if (editorManager?.monaco) {
    editorManager.monaco.editor.setTheme(theme === 'dark' ? 'custom-dark' : 'custom-light');
  }
}

export function getTheme(): Theme {
  return currentTheme;
}