/**
 * Home Page - 今日工作台
 * 把首页从“导航页”升级为工作入口：今日待办、最近文档、AI 状态、最近项目。
 */

import { registerPageInit, switchPage } from '../../app/router';
import { ipcClient } from '../../services/ipc-client';
import type { Workspace } from '@shared/types/workspace';
import type { TodoTask } from '@shared/types/todo';
import type { RecentMarkdownFile } from '@shared/types/file';
import { escHtml, escAttr } from '../../utils/escape';
import { formatRelativeTime, getGreeting } from '../../utils/format';
import { isOverdue, isDueToday } from '../../utils/date';
import { novaIcon, novaIconTile } from '../../utils/icons';
import { showAlert } from '../../components/modal';
import { getRuntime } from '../../services/runtime';

let quickActionsBound = false;
let cachedAppVersion: string | null = null;

async function initHomePage(): Promise<void> {
  ensureOnboardingStyles();
  renderGreeting();
  if (!cachedAppVersion) {
    cachedAppVersion = await ipcClient.app.getVersion().catch(() => '');
  }
  await Promise.allSettled([
    renderTodoSummary(),
    renderRecentProjects(),
    renderRecentDocs(),
    renderAIStatus(),
  ]);
  bindQuickActions();
  showOnboardingIfNeeded();
}

// ── 首次引导 ──

function renderGreeting(): void {
  const greeting = document.getElementById('home-greeting');
  const subtitle = document.querySelector('.home-subtitle') as HTMLElement | null;
  if (greeting) greeting.textContent = getGreeting() + ' 👋';
  if (subtitle) subtitle.textContent = '今天从一个文档开始，让 AI 帮你整理，再把任务推进下去。';
}

function showOnboardingIfNeeded(): void {
  if (localStorage.getItem('nova:onboarding-seen') === 'true') return;
  showOnboardingModal();
}

function showOnboardingModal(): void {
  let modal = document.getElementById('nova-onboarding-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'nova-onboarding-modal';
    modal.className = 'nova-onboarding-modal';
    modal.innerHTML =
      '<div class="nova-onboarding-card">' +
      '<div class="nova-onboarding-badge">Nova v' + escHtml(cachedAppVersion || '2.9') + '</div>' +
        '<h2>欢迎使用 Nova</h2>' +
        '<p>一个面向深度工作的 AI 工作台。你可以在这里管理 Markdown 文档、使用 AI 助手、整理待办任务，并把项目推进下去。</p>' +
        '<div class="nova-onboarding-steps">' +
          '<div><strong>1</strong><span>打开或创建工作区</span></div>' +
          '<div><strong>2</strong><span>编辑 Markdown 文档</span></div>' +
          '<div><strong>3</strong><span>让 AI 提取任务</span></div>' +
        '</div>' +
        '<div class="nova-onboarding-actions">' +
          '<button class="btn-primary" id="onboarding-create-sample">创建示例工作区</button>' +
          '<button class="btn-ghost" id="onboarding-open-folder">打开本地项目</button>' +
          '<button class="btn-ghost" id="onboarding-settings">配置 AI 模型</button>' +
        '</div>' +
        '<button class="nova-onboarding-skip" id="onboarding-skip">先跳过</button>' +
      '</div>';
    document.body.appendChild(modal);
  }
  modal.classList.add('show');

  const close = () => {
    localStorage.setItem('nova:onboarding-seen', 'true');
    modal?.classList.remove('show');
  };

  document.getElementById('onboarding-skip')?.addEventListener('click', close, { once: true });
  document.getElementById('onboarding-open-folder')?.addEventListener('click', () => { close(); void openWorkspacePicker(); }, { once: true });
  document.getElementById('onboarding-settings')?.addEventListener('click', () => { close(); void switchPage('settings'); }, { once: true });
  document.getElementById('onboarding-create-sample')?.addEventListener('click', async () => {
    const btn = document.getElementById('onboarding-create-sample') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = '正在创建...'; }
    try {
      const workspacePath = await ipcClient.fs.createSampleWorkspace();
      close();
      await openRecentProject(workspacePath);
      await renderRecentProjects();
    } catch (err) {
      showAlert('创建示例工作区失败: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '创建示例工作区'; }
    }
  }, { once: true });
}

async function createSampleWorkspaceFromHome(): Promise<void> {
  try {
    const workspacePath = await ipcClient.fs.createSampleWorkspace();
    localStorage.setItem('nova:onboarding-seen', 'true');
    await openRecentProject(workspacePath);
    await renderRecentProjects();
  } catch (err) {
    showAlert('创建示例工作区失败: ' + (err instanceof Error ? err.message : String(err)));
  }
}

function ensureOnboardingStyles(): void {
  if (document.getElementById('nova-onboarding-styles')) return;
  const style = document.createElement('style');
  style.id = 'nova-onboarding-styles';
  style.textContent = `
    .nova-onboarding-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.56);backdrop-filter:blur(10px);z-index:2000;padding:24px}
    .nova-onboarding-modal.show{display:flex}
    .nova-onboarding-card{width:min(720px,92vw);border:1px solid var(--border-subtle);background:var(--bg-surface);border-radius:24px;padding:32px;box-shadow:0 24px 80px rgba(0,0,0,.38);position:relative;overflow:hidden}
    .nova-onboarding-card:before{content:'';position:absolute;inset:-40% -10% auto auto;width:320px;height:320px;background:var(--accent-soft);border-radius:999px;filter:blur(20px);opacity:.65;pointer-events:none}
    .nova-onboarding-badge{display:inline-flex;padding:6px 10px;border-radius:999px;background:var(--accent-soft);color:var(--accent);font-weight:700;font-size:12px;margin-bottom:12px}
    .nova-onboarding-card h2{font-size:32px;margin:0 0 10px;color:var(--text-primary)}
    .nova-onboarding-card p{max-width:560px;line-height:1.7;color:var(--text-secondary);margin:0 0 22px}
    .nova-onboarding-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:20px 0 26px}
    .nova-onboarding-steps div{border:1px solid var(--border-subtle);background:var(--bg-elevated);border-radius:16px;padding:14px;display:flex;gap:10px;align-items:center}
    .nova-onboarding-steps strong{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--accent);color:white;font-size:13px;flex:0 0 auto}
    .nova-onboarding-steps span{font-size:13px;color:var(--text-secondary);font-weight:600}
    .nova-onboarding-actions{display:flex;gap:10px;flex-wrap:wrap}
    .nova-onboarding-skip{margin-top:14px;border:0;background:transparent;color:var(--text-tertiary);cursor:pointer;font-size:13px}
    .home-recent-empty .btn-primary{margin-top:10px}
  `;
  document.head.appendChild(style);
}

// ── 待办概览 ──

async function renderTodoSummary(): Promise<void> {
  try {
    const data = await ipcClient.todo.load();
    const tasks = data.tasks || [];
    const now = new Date();
    const pendingTasks = tasks.filter(t => !t.completed);
    const pending = pendingTasks.length;
    const overdue = pendingTasks.filter(t => isOverdue(t.dueDate, now)).length;
    const todayTasks = pendingTasks.filter(t => isDueToday(t.dueDate, now));
    const completed = tasks.filter(t => t.completed).length;
    const nextTask = sortTasksForToday(pendingTasks)[0] || null;

    setText('home-todo-pending', String(pending));
    setText('home-todo-overdue', String(overdue));
    setText('home-todo-today', String(todayTasks.length));
    setText('home-todo-completed', String(completed));
    setText('home-todo-next', nextTask ? nextTask.title : '暂无待办');

    renderTodayTaskList(sortTasksForToday(pendingTasks));
  } catch (err) {
    console.error('[Home] renderTodoSummary failed:', err);
  }
}

function renderTodayTaskList(tasks: TodoTask[]): void {
  const container = document.getElementById('home-today-list');
  if (!container) return;
  const visible = tasks.slice(0, 6);
  if (visible.length === 0) {
    container.innerHTML = '<div class="home-empty-state nova-state-card">' + novaIconTile('task', 'nova-state-icon') + '<strong>今天没有待办</strong><span>可以从 Markdown 文档里用 AI 生成任务，或手动创建一个待办。</span><button class="btn-ghost" id="btn-home-empty-todo">新建待办</button></div>'; 
    document.getElementById('btn-home-empty-todo')?.addEventListener('click', () => { void switchPage('todo'); });
    return;
  }

  container.innerHTML = visible.map(task => {
    const dueClass = isOverdue(task.dueDate) ? 'overdue' : isDueToday(task.dueDate) ? 'today' : '';
    const source = task.sourceTitle || (task.sourceFilePath ? basename(task.sourceFilePath) : '手动创建');
    return '<div class="home-task-row" data-id="' + escAttr(task.id) + '">' +
      '<button class="home-task-done" data-id="' + escAttr(task.id) + '" title="完成任务">✓</button>' +
      '<div class="home-task-main">' +
        '<div class="home-task-title">' + escHtml(task.title) + '</div>' +
        '<div class="home-task-meta"><span class="home-priority home-priority-' + escAttr(task.priority) + '">' + priorityLabel(task.priority) + '</span>' +
        (task.dueDate ? '<span class="home-task-due ' + dueClass + '">' + formatDueDate(task.dueDate) + '</span>' : '<span>无截止时间</span>') +
        '<span>来源：' + escHtml(source) + '</span></div>' +
      '</div>' +
      '<button class="home-task-open" data-id="' + escAttr(task.id) + '">查看</button>' +
    '</div>';
  }).join('');

  container.onclick = async (event) => {
    const target = event.target as HTMLElement;
    const doneBtn = target.closest('.home-task-done') as HTMLElement | null;
    if (doneBtn?.dataset.id) {
      event.stopPropagation();
      await ipcClient.todo.updateTask(doneBtn.dataset.id, { completed: true, completedAt: new Date().toISOString() });
      window.dispatchEvent(new CustomEvent('nova:todo-data-changed'));
      await renderTodoSummary();
      return;
    }
    const openBtn = target.closest('.home-task-open, .home-task-row') as HTMLElement | null;
    if (openBtn) void switchPage('todo');
  };
}

function sortTasksForToday(tasks: TodoTask[]): TodoTask[] {
  const now = new Date();
  return [...tasks].sort((a, b) => {
    const as = taskUrgencyScore(a, now);
    const bs = taskUrgencyScore(b, now);
    if (as !== bs) return as - bs;
    const ap = priorityWeight(a.priority);
    const bp = priorityWeight(b.priority);
    if (ap !== bp) return ap - bp;
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    return ad - bd;
  });
}

function taskUrgencyScore(task: TodoTask, now = new Date()): number {
  if (isOverdue(task.dueDate, now)) return 0;
  if (isDueToday(task.dueDate, now)) return 1;
  return 2;
}

function priorityWeight(priority: string): number {
  if (priority === 'urgent') return 0;
  if (priority === 'high') return 1;
  if (priority === 'medium') return 2;
  return 3;
}

function priorityLabel(priority: string): string {
  if (priority === 'urgent') return '紧急';
  if (priority === 'high') return '高';
  if (priority === 'medium') return '中';
  return '低';
}

// ── 最近文档 ──

async function renderRecentDocs(): Promise<void> {
  const container = document.getElementById('home-doc-list');
  if (!container) return;
  try {
    const workspaces = await ipcClient.workspace.list();
    const docs = await ipcClient.fs.getRecentMarkdown(workspaces.map(w => w.rootPath));
    if (docs.length === 0) {
      container.innerHTML = '<div class="home-empty-state nova-state-card">' + novaIconTile('markdown', 'nova-state-icon') + '<strong>还没有 Markdown 文档</strong><span>打开工作区后，最近编辑的 .md 文档会显示在这里。</span><button class="btn-ghost" id="btn-home-doc-open">打开工作区</button></div>'; 
      document.getElementById('btn-home-doc-open')?.addEventListener('click', () => openWorkspacePicker());
      return;
    }

    container.innerHTML = docs.slice(0, 6).map(doc =>
      '<div class="home-doc-item" data-path="' + escAttr(doc.path) + '">' +
        '<div class="home-doc-icon home-doc-icon-svg">' + novaIcon('markdown', 'nova-icon nova-icon-sm') + '</div>' +
        '<div class="home-doc-main"><div class="home-doc-name">' + escHtml(doc.name) + '</div>' +
        '<div class="home-doc-meta">' + escHtml(doc.workspaceName) + ' · ' + formatRelativeTime(doc.modifiedAt) + '</div></div>' +
      '</div>'
    ).join('');

    container.onclick = (event) => {
      const item = (event.target as HTMLElement).closest('.home-doc-item') as HTMLElement | null;
      if (item?.dataset.path) openMarkdownFile(item.dataset.path);
    };
  } catch (err) {
    console.error('[Home] renderRecentDocs failed:', err);
    container.innerHTML = '<div class="home-empty-state nova-state-card is-error">' + novaIconTile('error', 'nova-state-icon') + '<strong>最近文档读取失败</strong><span>请重新打开工作区后再试。</span></div>'; 
  }
}

function openMarkdownFile(filePath: string): void {
  void (async () => {
    await switchPage('files');
    const openFilePath = getRuntime('openFilePath');
    if (typeof openFilePath === 'function') void openFilePath(filePath);
  })();
}

// ── AI 状态 ──

async function renderAIStatus(): Promise<void> {
  const container = document.getElementById('home-ai-status');
  if (!container) return;
  try {
    const settings = await ipcClient.ai.getSettings();
    const provider = settings.providers.find(item => item.id === settings.defaultProviderId) || settings.providers.find(item => item.enabled) || settings.providers[0];
    if (!provider) {
      container.innerHTML = '<div class="home-ai-empty"><div><strong>尚未配置 AI 模型</strong><span>配置 DeepSeek、通义千问、Kimi、MiMo、Ollama 或自定义 OpenAI Compatible 接口后即可使用。</span></div><button class="btn-primary" id="btn-home-config-ai">去配置</button></div>';
      document.getElementById('btn-home-config-ai')?.addEventListener('click', () => { void switchPage('settings'); });
      return;
    }

    container.innerHTML = '<div class="home-ai-card">' +
      '<div class="home-ai-dot ' + (provider.enabled ? 'enabled' : '') + '"></div>' +
      '<div class="home-ai-info"><strong>' + escHtml(provider.name) + '</strong><span>' + escHtml(provider.defaultModel || '未选择模型') + '</span></div>' +
      '<button class="btn-ghost" id="btn-home-test-ai">测试连接</button>' +
    '</div>';

    document.getElementById('btn-home-test-ai')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-home-test-ai') as HTMLButtonElement | null;
      if (btn) { btn.disabled = true; btn.textContent = '测试中...'; }
      try {
        const result = await ipcClient.ai.testConnection(provider.id);
        showAlert(result.ok ? 'AI 连接成功' : ('AI 连接失败：' + result.message));
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '测试连接'; }
      }
    });
  } catch (err) {
    console.error('[Home] renderAIStatus failed:', err);
  }
}

// ── 最近项目 ──

async function renderRecentProjects(): Promise<void> {
  const container = document.getElementById('home-recent-list');
  if (!container) return;

  try {
    let projects = await ipcClient.workspace.list();
    if (projects.length === 0) {
      const legacyProjects = await ipcClient.recent.get().catch(() => []);
      if (legacyProjects.length > 0) {
        for (const legacy of legacyProjects) {
          await ipcClient.workspace.open({ rootPath: legacy.path, name: legacy.name }).catch(() => null);
        }
        projects = await ipcClient.workspace.list();
      }
    }

    if (projects.length === 0) {
      container.innerHTML =
        '<div class="home-recent-empty">' +
        novaIconTile('folder', 'nova-state-icon') +
        '<p>还没有打开过工作区</p>' +
        '<button class="btn-primary" id="btn-home-create-sample">创建示例工作区</button>' +
        '<button class="btn-ghost" id="btn-home-open-folder">打开文件夹</button>' +
        '</div>';
      document.getElementById('btn-home-open-folder')?.addEventListener('click', () => openWorkspacePicker());
      document.getElementById('btn-home-create-sample')?.addEventListener('click', () => { void createSampleWorkspaceFromHome(); });
      return;
    }

    container.innerHTML = projects.slice(0, 6).map((p: Workspace) =>
      '<div class="home-recent-item" data-path="' + escAttr(p.rootPath) + '">' +
      '<div class="home-recent-icon">' + novaIcon('folder', 'nova-icon nova-icon-sm') + '</div>' +
      '<div class="home-recent-info"><div class="home-recent-name">' + escHtml(p.name) + '</div><div class="home-recent-path">' + escHtml(p.rootPath) + '</div></div>' +
      '<div class="home-recent-meta"><span class="home-recent-time">' + formatRelativeTime(p.lastOpened) + '</span>' +
      '<button class="home-recent-remove" data-path="' + escAttr(p.rootPath) + '" title="移除记录"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
      '</div></div>'
    ).join('');

    container.onclick = async (e) => {
      const target = e.target as HTMLElement;
      const removeButton = target.closest('.home-recent-remove') as HTMLElement | null;
      if (removeButton?.dataset.path) {
        e.stopPropagation();
        await removeRecentProject(removeButton.dataset.path);
        return;
      }

      const item = target.closest('.home-recent-item') as HTMLElement | null;
      if (item?.dataset.path) {
        await openRecentProject(item.dataset.path);
      }
    };

    const clearBtn = document.getElementById('btn-clear-recent');
    if (clearBtn) {
      clearBtn.style.display = projects.length > 0 ? '' : 'none';
      clearBtn.onclick = async () => {
        await ipcClient.workspace.clear();
        await ipcClient.recent.clear().catch(() => []);
        await renderRecentProjects();
        await renderRecentDocs();
      };
    }
  } catch (err) {
    console.error('[Home] renderRecentProjects failed:', err);
  }
}

async function openRecentProject(projectPath: string): Promise<void> {
  await ipcClient.workspace.open({ rootPath: projectPath }).catch(() => null);
  await switchPage('files');
  const openWorkspace = getRuntime('openWorkspaceRoot');
  const ft = getRuntime('fileTree');
  const store = getRuntime('filesStore');

  if (typeof openWorkspace === 'function') {
    await openWorkspace(projectPath, { restoreSession: true });
    return;
  }

  if (ft?.openProjectPath) {
    await ft.openProjectPath(projectPath);
    if (store) store.setWorkspaceRoot(projectPath);
  }
}

async function openWorkspacePicker(): Promise<void> {
  await switchPage('files');
  const chooseWorkspace = getRuntime('chooseWorkspaceFolder');
  const ft = getRuntime('fileTree');
  if (typeof chooseWorkspace === 'function') {
    await chooseWorkspace();
  } else if (ft?.openFolder) {
    await ft.openFolder();
  }
}

async function removeRecentProject(projectPath: string): Promise<void> {
  await ipcClient.workspace.remove(projectPath);
  await ipcClient.recent.remove(projectPath).catch(() => []);
  await renderRecentProjects();
  await renderRecentDocs();
}

// ── 快捷操作 ──

function bindQuickActions(): void {
  if (quickActionsBound) return;
  quickActionsBound = true;
  document.getElementById('btn-go-files')?.addEventListener('click', () => { void switchPage('files'); });
  document.getElementById('btn-go-ai')?.addEventListener('click', () => { void switchPage('ai'); });
  document.getElementById('btn-go-todo')?.addEventListener('click', () => { void switchPage('todo'); });
  document.getElementById('btn-home-view-todo')?.addEventListener('click', () => { void switchPage('todo'); });
  document.getElementById('btn-home-ai-settings')?.addEventListener('click', () => { void switchPage('settings'); });
  document.getElementById('btn-home-open-folder')?.addEventListener('click', () => openWorkspacePicker());
  document.getElementById('btn-new-project')?.addEventListener('click', () => openWorkspacePicker());
  document.getElementById('btn-home-create-sample')?.addEventListener('click', () => { void createSampleWorkspaceFromHome(); });
}

// ── 工具函数 ──

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}


function basename(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath;
}

function formatDueDate(isoStr: string): string {
  const date = new Date(isoStr);
  if (Number.isNaN(date.getTime())) return '截止时间异常';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return '今天';
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return '昨天';
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) return '明天';
  return date.toLocaleDateString('zh-CN');
}

registerPageInit('home', initHomePage);

export { initHomePage };
