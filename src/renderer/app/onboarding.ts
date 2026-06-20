import { switchPage } from './router';

const ONBOARDING_KEY = 'nova-onboarding-v298-completed';

type OnboardingStep = {
  title: string;
  description: string;
  page?: 'home' | 'project' | 'files' | 'ai' | 'todo' | 'knowledge' | 'settings';
  actionLabel?: string;
  action?: () => void | Promise<void>;
};

const steps: OnboardingStep[] = [
  {
    title: '打开你的第一个工作区',
    description: 'Nova 以本地文件夹作为项目工作区。打开文件夹后，首页、项目概览、文件管理、待办和知识库都会围绕这个项目展开。',
    page: 'home',
    actionLabel: '打开工作区',
    action: async () => {
      await switchPage('files');
      void (window.__fileTree?.openFolder?.() || window.__chooseWorkspaceFolder?.());
    },
  },
  {
    title: '创建第一篇 Markdown',
    description: '可以从空白文档开始，也可以使用 PRD、会议纪要、技术方案、周报等模板快速创建。',
    page: 'files',
    actionLabel: '新建文档',
    action: async () => {
      await switchPage('files');
      void window.__handleNewFile?.();
    },
  },
  {
    title: '配置 AI 模型',
    description: '在设置页保存 Base URL、API Key 和默认模型后，AI 助手、文档总结、改写、生成待办等能力才会完整启用。',
    page: 'settings',
    actionLabel: '打开设置',
    action: () => switchPage('settings'),
  },
  {
    title: '把任务推进到待办中心',
    description: '在待办中心记录下一步动作，也可以从 Markdown 中提取任务，形成文档和执行事项的闭环。',
    page: 'todo',
    actionLabel: '新建待办',
    action: async () => {
      await switchPage('todo');
      window.__focusTodoQuickInput?.();
    },
  },
  {
    title: '用 Ctrl+K 驱动整个工作台',
    description: '命令面板可以搜索文件、切换页面、创建文档、执行 AI 文档命令和导出报告，是 Nova 的效率入口。',
    page: 'home',
    actionLabel: '打开命令面板',
    action: () => window.__openCommandPalette?.(),
  },
];

let activeIndex = 0;
let overlay: HTMLElement | null = null;
let bound = false;

export function initOnboarding(): void {
  if (bound) return;
  bound = true;
  window.__startOnboarding = startOnboarding;
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest<HTMLElement>('[data-start-onboarding]')) {
      event.preventDefault();
      startOnboarding();
      return;
    }
    const action = target.closest<HTMLElement>('[data-onboarding-action]')?.dataset.onboardingAction;
    if (!action) return;
    event.preventDefault();
    void handleOnboardingAction(action);
  });

  if (!localStorage.getItem(ONBOARDING_KEY)) {
    window.setTimeout(() => startOnboarding(), 900);
  }
}

export function startOnboarding(): void {
  activeIndex = 0;
  renderOnboarding();
}

async function handleOnboardingAction(action: string): Promise<void> {
  if (action === 'close') {
    closeOnboarding(false);
    return;
  }
  if (action === 'skip') {
    closeOnboarding(true);
    return;
  }
  if (action === 'prev') {
    activeIndex = Math.max(0, activeIndex - 1);
    renderOnboarding();
    return;
  }
  if (action === 'next') {
    if (activeIndex >= steps.length - 1) {
      closeOnboarding(true);
      return;
    }
    activeIndex += 1;
    renderOnboarding();
    return;
  }
  if (action === 'do') {
    const step = steps[activeIndex];
    closeOnboarding(activeIndex >= steps.length - 1);
    await step.action?.();
  }
}

function closeOnboarding(complete: boolean): void {
  if (complete) localStorage.setItem(ONBOARDING_KEY, 'true');
  overlay?.remove();
  overlay = null;
}

function renderOnboarding(): void {
  const step = steps[activeIndex];
  if (step.page) void switchPage(step.page);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'nova-onboarding-overlay';
    document.body.appendChild(overlay);
  }

  const progress = Math.round(((activeIndex + 1) / steps.length) * 100);
  overlay.innerHTML =
    '<div class="nova-onboarding-backdrop" data-onboarding-action="close"></div>' +
    '<div class="nova-onboarding-card" role="dialog" aria-modal="false" aria-label="Nova 首次使用引导">' +
      '<div class="nova-onboarding-top">' +
        '<span class="nova-kicker">GET STARTED</span>' +
        '<button class="nova-onboarding-close" data-onboarding-action="close" type="button">×</button>' +
      '</div>' +
      '<div class="nova-onboarding-progress"><span style="width:' + progress + '%"></span></div>' +
      '<div class="nova-onboarding-step-count">' + (activeIndex + 1) + ' / ' + steps.length + '</div>' +
      '<h2>' + escapeHtml(step.title) + '</h2>' +
      '<p>' + escapeHtml(step.description) + '</p>' +
      '<div class="nova-onboarding-dots">' + steps.map((_, index) => '<button class="' + (index === activeIndex ? 'active' : '') + '" data-onboarding-action="' + (index < activeIndex ? 'prev' : index > activeIndex ? 'next' : 'noop') + '" type="button" aria-label="第 ' + (index + 1) + ' 步"></button>').join('') + '</div>' +
      '<div class="nova-onboarding-actions">' +
        '<button class="nova-btn nova-btn-ghost" data-onboarding-action="skip" type="button">不再提示</button>' +
        '<div class="nova-onboarding-action-right">' +
          (activeIndex > 0 ? '<button class="nova-btn nova-btn-soft" data-onboarding-action="prev" type="button">上一步</button>' : '') +
          (step.actionLabel ? '<button class="nova-btn nova-btn-soft" data-onboarding-action="do" type="button">' + escapeHtml(step.actionLabel) + '</button>' : '') +
          '<button class="nova-btn nova-btn-primary" data-onboarding-action="next" type="button">' + (activeIndex >= steps.length - 1 ? '完成' : '下一步') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch] || ch));
}
