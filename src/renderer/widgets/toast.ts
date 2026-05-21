/**
 * Toast — 通用 Toast 通知组件
 */

type ToastType = 'success' | 'error' | 'info' | 'warning';

const TOAST_DURATION = 3000;

export function showToast(message: string, type: ToastType = 'info'): void {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons: Record<ToastType, string> = {
    success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };

  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message">${esc(message)}</span>
    <button class="toast-close">×</button>
  `;

  document.body.appendChild(toast);

  toast.querySelector('.toast-close')?.addEventListener('click', () => toast.remove());
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, TOAST_DURATION);
}

function esc(text: string): string {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}