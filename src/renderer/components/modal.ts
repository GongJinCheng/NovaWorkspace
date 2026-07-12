/**
 * Modal - 通用模态框组件
 *
 * Accessibility: every modal is a focus-trapped, aria-modal dialog that
 * closes on Escape or backdrop click. See showError() for the shared
 * error presentation built on .nova-state-card.is-error.
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
  /** Render the dialog in the error visual variant. */
  isError?: boolean;
}

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function showModal(options: ModalOptions): HTMLElement {
  const { title, content, inputField, actions = [], onClose, isError } = options;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'presentation');

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
    <div class="modal-content${isError ? ' is-error' : ''}">
      <div class="modal-header">
        <h3 id="modal-title">${escHtml(title)}</h3>
        <button class="modal-close-btn" aria-label="关闭">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">${content}${inputHtml}</div>
      ${actionsHtml}
    </div>
  `;

  const modalContent = overlay.querySelector('.modal-content') as HTMLElement;
  modalContent.setAttribute('role', 'dialog');
  modalContent.setAttribute('aria-modal', 'true');
  modalContent.setAttribute('aria-labelledby', 'modal-title');

  document.body.appendChild(overlay);

  let closed = false;

  // Remove the global key handler and the overlay element. Does NOT fire onClose.
  const teardown = (): void => {
    document.removeEventListener('keydown', onKeydown);
    if (overlay.parentNode) overlay.remove();
  };

  // Full close path (backdrop / close button / Escape): also runs onClose.
  const close = (): void => {
    if (closed) return;
    closed = true;
    teardown();
    onClose?.();
  };

  const focusable = (): HTMLElement[] =>
    Array.from(modalContent.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
    );

  // Keep keyboard focus inside the dialog (focus trap).
  const trapFocus = (e: KeyboardEvent): void => {
    const els = focusable();
    if (els.length === 0) {
      e.preventDefault();
      return;
    }
    const first = els[0];
    const last = els[els.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (active === first || !modalContent.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last || !modalContent.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  };

  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      trapFocus(e);
    }
  };

  document.addEventListener('keydown', onKeydown);

  // Auto-focus the input if present, otherwise the first focusable control.
  const inputEl = overlay.querySelector('.modal-input') as HTMLInputElement | null;
  const focusTarget = inputEl || focusable()[0] || modalContent;
  requestAnimationFrame(() => focusTarget.focus());

  // Submit on Enter from the input field.
  if (inputEl) {
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const primaryBtn = overlay.querySelector('.modal-btn-primary') as HTMLButtonElement | null;
        primaryBtn?.click();
      }
    });
  }

  // Unified close handling — single delegated handler catches ALL close triggers.
  overlay.addEventListener('click', (e) => {
    if (closed) return;
    const target = e.target as HTMLElement | null;
    // Close button (or any child of it — SVG path, etc.)
    if (target?.closest('.modal-close-btn')) {
      close();
      return;
    }
    // Overlay background
    if (target === overlay) {
      close();
      return;
    }
  });

  // Bind actions - auto-remove overlay after action completes.
  actions.forEach((a, i) => {
    overlay.querySelector(`[data-action-idx="${i}"]`)?.addEventListener('click', () => {
      if (closed) return;
      closed = true;
      a.onClick();
      teardown();
    });
  });

  return overlay;
}

export function closeModal(overlay: HTMLElement): void {
  overlay.remove();
}

/**
 * Fire-and-forget informational dialog.
 * Drop-in replacement for the native alert() which is blocked in Electron 35+.
 */
export function showAlert(message: string): void {
  showModal({
    title: '提示',
    content: '<p class="modal-message">' + escHtml(message).replace(/\n/g, '<br>') + '</p>',
    actions: [{ label: '确定', type: 'primary', onClick: () => {} }],
  });
}

/**
 * Shared error dialog. Renders a .nova-state-card.is-error body so all
 * error surfaces look identical. Drop-in for ad-hoc alert() error calls.
 */
export function showError(title: string, message: string, options?: { onClose?: () => void }): void {
  showModal({
    title,
    isError: true,
    content:
      '<div class="nova-state-card is-error">' +
      '<div class="nova-state-icon">⚠️</div>' +
      '<div class="nova-state-body"><p>' + escHtml(message).replace(/\n/g, '<br>') + '</p></div>' +
      '</div>',
    actions: [{ label: '确定', type: 'primary', onClick: () => {} }],
    onClose: options?.onClose,
  });
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
