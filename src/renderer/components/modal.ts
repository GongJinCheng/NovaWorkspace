/**
 * Modal - 通用模态框组件
 */

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
      ${actions.map((a, i) => `<button class="modal-btn modal-btn-${a.type || 'secondary'}" data-action-idx="${i}">${esc(a.label)}</button>`).join('')}
    </div>`;
  }

  const inputHtml = inputField
    ? `<input class="modal-input" type="text" placeholder="${esc(inputField.placeholder)}" value="${esc(inputField.defaultValue || '')}" />`
    : '';

  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>${esc(title)}</h3>
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

  // Bind close
  overlay.querySelector('.modal-close-btn')?.addEventListener('click', () => {
    overlay.remove();
    onClose?.();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
      onClose?.();
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
    const done = (value: string | null) => {
      if (resolved) return;
      resolved = true;
      overlay.remove();
      resolve(value);
    };

    const overlay = showModal({
      title,
      content: '',
      inputField: { placeholder, defaultValue },
      actions: [
        { label: '取消', type: 'secondary', onClick: () => done(null) },
        {
          label: '确定', type: 'primary', onClick: () => {
            const input = overlay.querySelector('.modal-input') as HTMLInputElement | null;
            done(input?.value?.trim() ?? null);
          }
        },
      ],
      onClose: () => done(null),
    });
  });
}

function esc(text: string): string {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}