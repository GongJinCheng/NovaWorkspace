/**
 * Modal - 通用模态框组件
 */

import { escHtml } from '../utils/escape';

interface ModalInputField {
  placeholder: string;
  defaultValue?: string;
}

interface ModalOptions {
  title: string;
  content: string;
  inputField?: ModalInputField;
  actions?: Array<{
    label: string;
    type?: 'primary' | 'secondary' | 'danger';
    onClick: () => void;
  }>;
  onClose?: () => void;
}

export function showModal(options: ModalOptions): HTMLElement {
  const { title, content, inputField, actions = [], onClose } = options;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  let actionsHtml = '';
  if (actions.length > 0) {
    actionsHtml = `<div class="modal-actions">
      ${actions.map((a, i) => `<button class="modal-btn modal-btn-${a.type || 'secondary'}" data-action-idx="${i}">${escHtml(a.label)}</button>`).join('')}
    </div>`;
  }

  const inputHtml = inputField
    ? `<input class="modal-input" type="text" placeholder="${escHtml(inputField.placeholder)}" value="${escHtml(inputField.defaultValue || '')}" />`
    : '';

  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>${escHtml(title)}</h3>
        <button class="modal-close-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">${content}${inputHtml}</div>
      ${actionsHtml}
    </div>
  `;

  document.body.appendChild(overlay);

  // Auto-focus the input if present
  const inputEl = overlay.querySelector('.modal-input') as HTMLInputElement | null;
  if (inputEl) {
    requestAnimationFrame(() => inputEl.focus());
    // Submit on Enter
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const primaryBtn = overlay.querySelector('.modal-btn-primary') as HTMLButtonElement | null;
        primaryBtn?.click();
      }
    });
  }

  // Unified close handling — single delegated handler catches ALL close triggers.
  // Uses closest() rather than relying on the button's own click handler
  // (which can be suppressed by Electron/Chromium quirks with SVG children).
  let closed = false;
  overlay.addEventListener('click', (e) => {
    if (closed) return;
    const target = e.target as HTMLElement | null;
    // Close button (or any child of it — SVG path, etc.)
    if (target?.closest('.modal-close-btn')) {
      closed = true;
      overlay.remove();
      onClose?.();
      return;
    }
    // Overlay background
    if (target === overlay) {
      closed = true;
      overlay.remove();
      onClose?.();
      return;
    }
  });

  // Bind actions - auto-remove overlay after action completes
  actions.forEach((a, i) => {
    overlay.querySelector(`[data-action-idx="${i}"]`)?.addEventListener('click', () => {
      a.onClick();
      if (overlay.parentNode) overlay.remove();
    });
  });

  return overlay;
}

export function closeModal(overlay: HTMLElement): void {
  overlay.remove();
}

/**
 * Show an input prompt dialog. Returns a Promise that resolves with the
 * user's input string, or null if they cancelled.
 * Drop-in replacement for the native prompt() which is disabled in Electron 35+.
 */
export function showInputPrompt(title: string, placeholder: string, defaultValue?: string): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false;
    let overlay: HTMLElement;

    const done = (value: string | null) => {
      if (resolved) return;
      resolved = true;
      if (overlay) overlay.remove();
      resolve(value);
    };

    overlay = showModal({
      title,
      content: '',
      inputField: { placeholder, defaultValue },
      actions: [
        { label: '取消', type: 'secondary', onClick: () => done(null) },
        {
          label: '确定', type: 'primary', onClick: () => {
            const input = overlay?.querySelector('.modal-input') as HTMLInputElement | null;
            done(input?.value?.trim() ?? null);
          }
        },
      ],
      onClose: () => done(null),
    });
  });
}


export function showConfirmDialog(options: {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;
    let overlay: HTMLElement;
    const done = (value: boolean) => {
      if (resolved) return;
      resolved = true;
      if (overlay) overlay.remove();
      resolve(value);
    };

    overlay = showModal({
      title: options.title,
      content: '<p class="modal-message">' + escHtml(options.message).replace(/\n/g, '<br>') + '</p>',
      actions: [
        { label: options.cancelText || '取消', type: 'secondary', onClick: () => done(false) },
        { label: options.confirmText || '确定', type: options.danger ? 'danger' : 'primary', onClick: () => done(true) },
      ],
      onClose: () => done(false),
    });
  });
}

export function showTaskConfirmDialog(tasks: Array<{ title: string; description?: string; priority?: string }>): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;
    let overlay: HTMLElement;
    const done = (value: boolean) => {
      if (resolved) return;
      resolved = true;
      if (overlay) overlay.remove();
      resolve(value);
    };

    const priorityLabel: Record<string, string> = {
      urgent: '紧急',
      high: '高',
      medium: '中',
      low: '低',
    };
    const listHtml = tasks.slice(0, 12).map((task, index) =>
      '<div class="modal-task-preview-item">' +
        '<div class="modal-task-preview-title"><span>' + (index + 1) + '.</span>' + escHtml(task.title) + '</div>' +
        (task.description ? '<div class="modal-task-preview-desc">' + escHtml(task.description) + '</div>' : '') +
        '<div class="modal-task-preview-priority">优先级：' + escHtml(priorityLabel[task.priority || 'medium'] || '中') + '</div>' +
      '</div>'
    ).join('');

    overlay = showModal({
      title: '确认创建待办',
      content:
        '<p class="modal-message">AI 已识别出 ' + tasks.length + ' 个待办，请确认后创建。</p>' +
        '<div class="modal-task-preview-list">' + listHtml + (tasks.length > 12 ? '<div class="modal-task-preview-more">还有 ' + (tasks.length - 12) + ' 个待办未显示</div>' : '') + '</div>',
      actions: [
        { label: '取消', type: 'secondary', onClick: () => done(false) },
        { label: '创建待办', type: 'primary', onClick: () => done(true) },
      ],
      onClose: () => done(false),
    });
  });
}