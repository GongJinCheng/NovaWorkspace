/** Project Dashboard Page - 项目概览页 */
import { registerPageInit, switchPage } from '../app/router';
import { ipcClient } from '../services/ipc-client';
import { getCurrentWorkspaceRoot } from '../services/workspace-context';
import { showInputPrompt } from '../components/modal';
import type { ProjectOverview, ProjectActivityItem, ProjectRecentDocument } from '@shared/types/workspace';

let currentOverview: ProjectOverview | null = null;
let isBound = false;

async function initProjectPage(): Promise<void> {
  bindOnce();
  await renderProjectDashboard();
}

function bindOnce(): void {
  if (isBound) return;
  isBound = true;

  document.getElementById('btn-project-open-workspace')?.addEventListener('click', openWorkspacePicker);
  document.getElementById('btn-project-refresh')?.addEventListener('click', () => { void renderProjectDashboard(); });
  document.getElementById('btn-project-edit-meta')?.addEventListener('click', () => { void editProjectMeta(); });
  document.getElementById('btn-project-new-doc')?.addEventListener('click', () => { switchPage('files'); setTimeout(() => (window as any).__handleNewFile?.(), 220); });
  document.getElementById('btn-project-new-todo')?.addEventListener('click', () => { switchPage('todo'); setTimeout(() => (window as any).__focusTodoQuickInput?.(), 220); });
  document.getElementById('btn-project-files')?.addEventListener('click', () => switchPage('files'));
  document.getElementById('btn-project-ai')?.addEventListener('click', () => switchPage('ai'));
  document.getElementById('btn-project-summary')?.addEventListener('click', () => runProjectAI('summary'));
  document.getElementById('btn-project-plan')?.addEventListener('click', () => runProjectAI('plan'));

  window.addEventListener('nova:todo-data-changed', () => { void renderProjectDashboard(); });
  window.addEventListener('nova:workspace-changed', () => { void renderProjectDashboard(); });
}

async function renderProjectDashboard(): Promise<void> {
  const root = getCurrentWorkspaceRoot();
  const empty = document.getElementById('project-empty');
  const content = document.getElementById('project-content');
  if (!root) {
    if (empty) empty.style.display = '';
    if (content) content.style.display = 'none';
    return;
  }

  if (empty) empty.style.display = 'none';
  if (content) content.style.display = '';
  setText('project-loading-text', '正在读取项目状态...');
  try {
    const overview = await ipcClient.workspace.getProjectOverview(root);
    currentOverview = overview;
    renderOverview(overview);
  } catch (error) {
    console.error('[Project] render failed:', error);
    setText('project-loading-text', '项目概览读取失败，请重新打开工作区');
  }
}

function renderOverview(overview: ProjectOverview): void {
  setText('project-loading-text', '');
  setText('project-title', overview.meta.name || basename(overview.meta.rootPath));
  setText('project-description', overview.meta.description || '这个项目还没有描述，点击“编辑项目”补充项目目标。');
  setText('project-path', overview.meta.rootPath);
  setText('project-updated', overview.meta.updatedAt ? '更新于 ' + formatRelativeTime(overview.meta.updatedAt) : '');

  setText('project-stat-md', String(overview.documentStat.totalMarkdown));
  setText('project-stat-files', String(overview.documentStat.totalFiles));
  setText('project-stat-pending', String(overview.todoStat.pending));
  setText('project-stat-today', String(overview.todoStat.today));
  setText('project-stat-overdue', String(overview.todoStat.overdue));
  setText('project-stat-history', String(overview.historyStat.totalVersions));
  setText('project-ai-provider', overview.ai.configured ? `${overview.ai.providerName || 'AI'} / ${overview.ai.model || '未选择模型'}` : '未配置 AI 模型');
  setText('project-last-edit', overview.documentStat.lastEditedAt ? formatRelativeTime(overview.documentStat.lastEditedAt) : '暂无编辑记录');

  renderRecentDocs(overview.recentDocuments);
  renderActivities(overview.activities);
}

function renderRecentDocs(docs: ProjectRecentDocument[]): void {
  const el = document.getElementById('project-recent-docs');
  if (!el) return;
  if (docs.length === 0) {
    el.innerHTML = '<div class="project-empty-card">当前项目还没有 Markdown 文档。</div>';
    return;
  }
  el.innerHTML = docs.map(doc =>
    '<button class="project-doc-row" data-path="' + escAttr(doc.path) + '">' +
      '<span class="project-doc-badge">MD</span>' +
      '<span class="project-doc-main"><strong>' + esc(doc.name) + '</strong><em>' + esc(doc.relativePath) + '</em></span>' +
      '<span class="project-doc-time">' + formatRelativeTime(doc.modifiedAt) + '</span>' +
    '</button>'
  ).join('');
  el.querySelectorAll('.project-doc-row').forEach(row => {
    row.addEventListener('click', () => {
      const filePath = (row as HTMLElement).dataset.path;
      if (!filePath) return;
      switchPage('files');
      setTimeout(() => { void (window as any).__openFilePath?.(filePath); }, 220);
    });
  });
}

function renderActivities(items: ProjectActivityItem[]): void {
  const el = document.getElementById('project-activity-list');
  if (!el) return;
  if (items.length === 0) {
    el.innerHTML = '<div class="project-empty-card">暂无项目动态。编辑文档、创建待办或保存版本后会显示在这里。</div>';
    return;
  }
  el.innerHTML = items.map(item =>
    '<div class="project-activity-item" data-path="' + escAttr(item.targetPath || '') + '">' +
      '<span class="project-activity-dot type-' + escAttr(item.type) + '"></span>' +
      '<div class="project-activity-main"><strong>' + esc(item.title) + '</strong>' +
      (item.subtitle ? '<em>' + esc(item.subtitle) + '</em>' : '') + '</div>' +
      '<span class="project-activity-time">' + formatRelativeTime(item.createdAt) + '</span>' +
    '</div>'
  ).join('');
}

async function editProjectMeta(): Promise<void> {
  const root = getCurrentWorkspaceRoot();
  if (!root || !currentOverview) return;
  const name = await showInputPrompt('编辑项目名称', '项目名称', currentOverview.meta.name);
  if (!name?.trim()) return;
  const description = await showInputPrompt('编辑项目描述', '一句话说明这个项目的目标', currentOverview.meta.description || '');
  await ipcClient.workspace.updateProjectMeta({ rootPath: root, name: name.trim(), description: description || '' });
  window.dispatchEvent(new CustomEvent('nova:workspace-changed'));
  await renderProjectDashboard();
}

async function openWorkspacePicker(): Promise<void> {
  switchPage('files');
  setTimeout(async () => {
    const chooseWorkspace = (window as any).__chooseWorkspaceFolder;
    const ft = (window as any).__fileTree;
    if (typeof chooseWorkspace === 'function') await chooseWorkspace();
    else if (ft?.openFolder) await ft.openFolder();
  }, 200);
}

function runProjectAI(mode: 'summary' | 'plan'): void {
  if (!currentOverview) return;
  const prompt = buildProjectPrompt(mode, currentOverview);
  switchPage('ai');
  setTimeout(() => {
    const input = document.getElementById('ai-chat-input') as HTMLTextAreaElement | null;
    if (input) {
      input.value = prompt;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    }
  }, 260);
}

function buildProjectPrompt(mode: 'summary' | 'plan', overview: ProjectOverview): string {
  const docs = overview.recentDocuments.slice(0, 6).map(d => `- ${d.relativePath}（${formatRelativeTime(d.modifiedAt)}）`).join('\n') || '- 暂无 Markdown 文档';
  const activities = overview.activities.slice(0, 8).map(a => `- ${a.title}${a.subtitle ? '：' + a.subtitle : ''}`).join('\n') || '- 暂无活动';
  if (mode === 'plan') {
    return `请基于下面的 Nova 项目概览，帮我生成下一步推进计划。\n\n项目：${overview.meta.name}\n描述：${overview.meta.description || '暂无'}\n待办：未完成 ${overview.todoStat.pending}，今日到期 ${overview.todoStat.today}，逾期 ${overview.todoStat.overdue}\n文档：Markdown ${overview.documentStat.totalMarkdown}，总文件 ${overview.documentStat.totalFiles}\n\n最近文档：\n${docs}\n\n最近活动：\n${activities}\n\n请输出：\n1. 当前项目状态判断\n2. 接下来 3-5 个最该做的任务\n3. 风险提醒`; 
  }
  return `请基于下面的 Nova 项目概览，帮我总结当前项目状态。\n\n项目：${overview.meta.name}\n描述：${overview.meta.description || '暂无'}\n待办：总数 ${overview.todoStat.total}，未完成 ${overview.todoStat.pending}，已完成 ${overview.todoStat.completed}，逾期 ${overview.todoStat.overdue}\n文档：Markdown ${overview.documentStat.totalMarkdown}，总文件 ${overview.documentStat.totalFiles}，历史版本 ${overview.historyStat.totalVersions}\n\n最近文档：\n${docs}\n\n最近活动：\n${activities}\n\n请输出简洁的项目总结、进展、问题和建议。`;
}

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function basename(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath;
}

function formatRelativeTime(isoStr: string): string {
  const date = new Date(isoStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (Number.isNaN(date.getTime())) return '时间未知';
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return minutes + ' 分钟前';
  if (hours < 24) return hours + ' 小时前';
  if (days === 1) return '昨天';
  if (days < 7) return days + ' 天前';
  return date.toLocaleDateString('zh-CN');
}

function esc(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escAttr(str: string): string {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

registerPageInit('project', initProjectPage);
