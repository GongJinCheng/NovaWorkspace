/**
 * Toast — 通用 Toast 通知组件
 */

import { escHtml } from '../utils/escape';

type ToastType = 'success' | 'error' | 'info' | 'warning';

const TOAST_DURATION = 3000;
const UNDO_TOAST_DURATION = 5000;

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
    <span class="toast-message">${escHtml(message)}</span>
    <button class="toast-close">×</button>
  `;

  document.body.appendChild(toast);

  toast.querySelector('.toast-close')?.addEventListener('click', () => toast.remove());
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, TOAST_DURATION);
}

/**
 * Show a toast with an "撤销" (undo) action button.
 * @param message   - Notification text (will be HTML-escaped)
 * @param onUndo    - Called when the user clicks 撤销. Returns whether the undo succeeded.
 * @param duration  - Auto-dismiss timeout in ms (default 5 s)
 */
export function showUndoToast(
  message: string,
  onUndo: () => void | Promise<void>,
  duration = UNDO_TOAST_DURATION
): void {
  const toast = document.createElement('div');
  toast.className = 'toast toast-info toast-undo';

  toast.innerHTML = `
    <span class="toast-icon">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
      </svg>
    </span>
    <span class="toast-message">${escHtml(message)}</span>
    <button class="toast-undo-btn">撤销</button>
    <button class="toast-close">×</button>
  `;

  document.body.appendChild(toast);

  let dismissed = false;
  const dismiss = () => {
    if (!dismissed) {
      dismissed = true;
      toast.remove();
    }
  };

  const undoBtn = toast.querySelector('.toast-undo-btn');
  undoBtn?.addEventListener('click', () => {
    dismiss();
    void Promise.resolve(onUndo());
  });

  toast.querySelector('.toast-close')?.addEventListener('click', dismiss);

  const timer = setTimeout(dismiss, duration);

  // If removed externally (e.g. page unload), clear timer
  const observer = new MutationObserver(() => {
    if (!toast.isConnected) {
      clearTimeout(timer);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: false });
}
