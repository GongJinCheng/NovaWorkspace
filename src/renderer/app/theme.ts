/**
 * Theme — system-aware theme management
 *
 * Supports:
 *  - system: follow OS color scheme
 *  - dark: manual dark override
 *  - light: manual light override
 */

import { getRuntime } from '../services/runtime';

type ThemeMode = 'system' | 'dark' | 'light';
type EffectiveTheme = 'dark' | 'light';

const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
let mode: ThemeMode = 'system';
let effectiveTheme: EffectiveTheme = 'dark';

export function initTheme(): void {
  const saved = (localStorage.getItem('theme-mode') as ThemeMode) || 'system';
  setThemeMode(saved, { persist: false, syncButton: true });
  mediaQuery.addEventListener('change', () => {
    if (mode === 'system') {
      applyEffective(getSystemTheme(), { syncButton: true });
    }
  });
}

export function cycleTheme(): void {
  const next: ThemeMode = mode === 'dark' ? 'light' : mode === 'light' ? 'system' : 'dark';
  setThemeMode(next);
}

export function setThemeMode(next: ThemeMode, options?: { persist?: boolean; syncButton?: boolean }): void {
  mode = next;
  if (options?.persist !== false) {
    localStorage.setItem('theme-mode', mode);
  }

  if (mode === 'system') {
    applyEffective(getSystemTheme(), { syncButton: options?.syncButton });
  } else {
    applyEffective(mode, { syncButton: options?.syncButton });
  }
}

function applyEffective(next: EffectiveTheme, options?: { syncButton?: boolean }): void {
  effectiveTheme = next;
  document.documentElement.setAttribute('data-theme', next);
  updateMonacoTheme();

  if (options?.syncButton !== false) {
    syncThemeButton();
  }
}

function getSystemTheme(): EffectiveTheme {
  return mediaQuery.matches ? 'dark' : 'light';
}

function syncThemeButton(): void {
  const btn = document.getElementById('btn-theme');
  if (!btn) return;

  if (mode === 'system') {
    btn.title = '主题：跟随系统';
    btn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<rect x="2" y="3" width="20" height="14" rx="2"/>' +
      '<line x1="8" y1="21" x2="16" y2="21"/>' +
      '<line x1="12" y1="17" x2="12" y2="21"/></svg>';
    return;
  }

  if (mode === 'dark') {
    btn.title = '主题：深色（点击切换浅色）';
    btn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    return;
  }

  btn.title = '主题：浅色（点击跟随系统）';
  btn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<circle cx="12" cy="12" r="5"/>' +
    '<line x1="12" y1="1" x2="12" y2="3"/>' +
    '<line x1="12" y1="21" x2="12" y2="23"/>' +
    '<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>' +
    '<line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>' +
    '<line x1="1" y1="12" x2="3" y2="12"/>' +
    '<line x1="21" y1="12" x2="23" y2="12"/>' +
    '<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>' +
    '<line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
}

function updateMonacoTheme(): void {
  const editorManager = getRuntime('editorManager');
  if (editorManager) {
    editorManager.setTheme(effectiveTheme === 'dark' ? 'custom-dark' : 'custom-light');
  }
}

export function getThemeMode(): ThemeMode {
  return mode;
}

export function getEffectiveTheme(): EffectiveTheme {
  return effectiveTheme;
}
