/**
 * Home Page - 工作台首页
 * 展示待办概览、快捷入口、最近项目
 */

import { registerPageInit } from '../../app/router';
import { ipcClient } from '../../services/ipc-client';
import { switchPage } from '../../app/router';
import type { Workspace } from '@shared/types/workspace';

async function initHomePage(): Promise<void> {
  await renderTodoSummary();
  await renderRecentProjects();
  bindQuickActions();
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
        '<button class="btn-ghost" id="btn-home-open-folder">打开文件夹</button>' +
        '</div>';
      document.getElementById('btn-home-open-folder')?.addEventListener('click', () => openWorkspacePicker());
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