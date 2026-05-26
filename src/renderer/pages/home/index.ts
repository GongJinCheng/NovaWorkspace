/**
 * Home Page - 工作台首页
 * 展示待办概览、快捷入口、最近项目
 */

import { registerPageInit } from '../../app/router';
import { ipcClient } from '../../services/ipc-client';
import { switchPage } from '../../app/router';
import type { Workspace } from '@shared/types/workspace';

async function initHomePage(): Promise<void> {
  ensureOnboardingStyles();
  renderGreeting();
  await renderTodoSummary();
  await renderRecentProjects();
  bindQuickActions();
  showOnboardingIfNeeded();
}


// ── 首次引导 ──

function renderGreeting(): void {
  const greeting = document.getElementById('home-greeting');
  const subtitle = document.querySelector('.home-subtitle') as HTMLElement | null;
  const hour = new Date().getHours();
  const text = hour < 6 ? '夜深了，注意休息 🌙' : hour < 12 ? '早上好 👋' : hour < 18 ? '下午好 👋' : '晚上好 👋';
  if (greeting) greeting.textContent = text;
  if (subtitle) subtitle.textContent = '从文档开始，用 AI 整理，再把任务推进下去。';
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
        '<div class="nova-onboarding-badge">Nova v2.1</div>' +
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
  document.getElementById('onboarding-settings')?.addEventListener('click', () => { close(); switchPage('settings'); }, { once: true });
  document.getElementById('onboarding-create-sample')?.addEventListener('click', async () => {
    const btn = document.getElementById('onboarding-create-sample') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = '正在创建...'; }
    try {
      const workspacePath = await ipcClient.fs.createSampleWorkspace();
      close();
      await openRecentProject(workspacePath);
      await renderRecentProjects();
    } catch (err) {
      alert('创建示例工作区失败: ' + (err instanceof Error ? err.message : String(err)));
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
    alert('创建示例工作区失败: ' + (err instanceof Error ? err.message : String(err)));
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
    const pending = tasks.filter(t => !t.completed).length;
    const overdue = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < now).length;
    const today = tasks.filter(t => {
      if (t.completed || !t.dueDate) return false;
      return new Date(t.dueDate).toDateString() === now.toDateString();
    }).length;
    const nextTask = tasks.filter(t => !t.completed).sort((a, b) => {
      const pa = priorityWeight(a.priority);
      const pb = priorityWeight(b.priority);
      if (pa !== pb) return pa - pb;
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return ad - bd;
    })[0] || null;

    setText('home-todo-pending', String(pending));
    setText('home-todo-overdue', String(overdue));
    setText('home-todo-today', String(today));
    setText('home-todo-next', nextTask ? nextTask.title : '暂无待办');
    setText('home-todo-completed', String(tasks.filter(t => t.completed).length));
  } catch (err) {
    console.error('[Home] renderTodoSummary failed:', err);
  }
}

function priorityWeight(priority: string): number {
  if (priority === 'urgent') return 0;
  if (priority === 'high') return 1;
  if (priority === 'medium') return 2;
  return 3;
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
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.25"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>' +
        '<p>还没有打开过工作区</p>' +
        '<button class="btn-primary" id="btn-home-create-sample">创建示例工作区</button>' +
        '<button class="btn-ghost" id="btn-home-open-folder">打开文件夹</button>' +
        '</div>';
      document.getElementById('btn-home-open-folder')?.addEventListener('click', () => openWorkspacePicker());
      document.getElementById('btn-home-create-sample')?.addEventListener('click', () => { void createSampleWorkspaceFromHome(); });
      return;
    }

    container.innerHTML = projects.map((p: Workspace) =>
      '<div class="home-recent-item" data-path="' + escAttr(p.rootPath) + '">' +
      '<div class="home-recent-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>' +
      '<div class="home-recent-info"><div class="home-recent-name">' + esc(p.name) + '</div><div class="home-recent-path">' + esc(p.rootPath) + '</div></div>' +
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
      };
    }
  } catch (err) {
    console.error('[Home] renderRecentProjects failed:', err);
  }
}

async function openRecentProject(projectPath: string): Promise<void> {
  switchPage('files');
  setTimeout(async () => {
    const openWorkspace = (window as any).__openWorkspaceRoot;
    const ft = (window as any).__fileTree;
    const store = (window as any).__filesStore;

    if (typeof openWorkspace === 'function') {
      await openWorkspace(projectPath, { restoreSession: true });
      return;
    }

    if (ft?.openProjectPath) {
      await ft.openProjectPath(projectPath);
      if (store) store.setWorkspaceRoot(projectPath);
    }
  }, 200);
}

async function openWorkspacePicker(): Promise<void> {
  switchPage('files');
  setTimeout(async () => {
    const chooseWorkspace = (window as any).__chooseWorkspaceFolder;
    const ft = (window as any).__fileTree;
    if (typeof chooseWorkspace === 'function') {
      await chooseWorkspace();
    } else if (ft?.openFolder) {
      await ft.openFolder();
    }
  }, 200);
}

async function removeRecentProject(projectPath: string): Promise<void> {
  await ipcClient.workspace.remove(projectPath);
  await ipcClient.recent.remove(projectPath).catch(() => []);
  await renderRecentProjects();
}

// ── 快捷操作 ──

function bindQuickActions(): void {
  document.getElementById('btn-go-files')?.addEventListener('click', () => switchPage('files'));
  document.getElementById('btn-go-ai')?.addEventListener('click', () => switchPage('ai'));
  document.getElementById('btn-go-todo')?.addEventListener('click', () => switchPage('todo'));
  document.getElementById('btn-home-open-folder')?.addEventListener('click', () => openWorkspacePicker());
  document.getElementById('btn-new-project')?.addEventListener('click', () => openWorkspacePicker());
  document.getElementById('btn-home-create-sample')?.addEventListener('click', () => { void createSampleWorkspaceFromHome(); });
}

// ── 工具函数 ──

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function esc(str: string): string {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function escAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatRelativeTime(isoStr: string): string {
  const date = new Date(isoStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return minutes + ' 分钟前';
  if (hours < 24) return hours + ' 小时前';
  if (days === 1) return '昨天';
  if (days < 7) return days + ' 天前';
  return date.toLocaleDateString('zh-CN');
}

registerPageInit('home', initHomePage);

export { initHomePage };