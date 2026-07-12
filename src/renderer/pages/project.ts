/** Project Dashboard Page - 项目概览页 */
import { registerPageInit, switchPage } from '../app/router';
import { ipcClient } from '../services/ipc-client';
import { getCurrentWorkspaceRoot } from '../services/workspace-context';
import { showInputPrompt, showAlert } from '../components/modal';
import { getBuiltInTemplates } from '../services/template-service';
import { exportProjectReport, type ExportFormat } from '../services/export-service';
import { escHtml, escAttr } from '../utils/escape';
import { formatRelativeTime } from '../utils/format';
import { novaIcon, iconForTemplate, iconForActivity } from '../utils/icons';
import type { ProjectOverview, ProjectActivityItem, ProjectRecentDocument } from '@shared/types/workspace';
import { getRuntime, setRuntime } from '../services/runtime';

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
  document.getElementById('btn-project-new-doc')?.addEventListener('click', () => { void (async () => { await switchPage('files'); void getRuntime('handleNewFile')?.(); })(); });
  document.getElementById('btn-project-new-todo')?.addEventListener('click', () => { void (async () => { await switchPage('todo'); void getRuntime('focusTodoQuickInput')?.(); })(); });
  document.getElementById('btn-project-files')?.addEventListener('click', () => { void switchPage('files'); });
  document.getElementById('btn-project-ai')?.addEventListener('click', () => { void switchPage('ai'); });
  document.getElementById('btn-project-summary')?.addEventListener('click', () => runProjectAI('summary'));
  document.getElementById('btn-project-plan')?.addEventListener('click', () => runProjectAI('plan'));
  document.getElementById('btn-project-export-report-md')?.addEventListener('click', () => { void exportCurrentProjectReport('markdown'); });
  document.getElementById('btn-project-export-report-pdf')?.addEventListener('click', () => { void exportCurrentProjectReport('pdf'); });

  window.addEventListener('nova:todo-data-changed', () => { void renderProjectDashboard(); });
  window.addEventListener('nova:workspace-changed', () => { void renderProjectDashboard(); });

  setRuntime('exportProjectReport', (format: ExportFormat = 'markdown') => exportCurrentProjectReport(format));
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
  renderTemplateShortcuts();
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
      '<span class="project-doc-badge project-doc-badge-svg">' + novaIcon('markdown', 'nova-icon nova-icon-sm') + '</span>' +
      '<span class="project-doc-main"><strong>' + escHtml(doc.name) + '</strong><em>' + escHtml(doc.relativePath) + '</em></span>' +
      '<span class="project-doc-time">' + formatRelativeTime(doc.modifiedAt) + '</span>' +
    '</button>'
  ).join('');
  el.querySelectorAll('.project-doc-row').forEach(row => {
    row.addEventListener('click', () => {
      const filePath = (row as HTMLElement).dataset.path;
      if (!filePath) return;
      void (async () => {
        await switchPage('files');
        void getRuntime('openFilePath')?.(filePath);
      })();
    });
  });
}


function renderTemplateShortcuts(): void {
  const host = document.getElementById('project-template-shortcuts');
  if (!host) return;
  const quickTemplates = getBuiltInTemplates().filter((template) => ['prd', 'meeting', 'tech-plan', 'weekly-report'].includes(template.id));
  host.innerHTML = quickTemplates.map((template) =>
    '<button class="project-template-card" data-template-id="' + escAttr(template.id) + '">' +
      '<span class="project-template-icon project-template-icon-svg">' + novaIcon(iconForTemplate(template.id), 'nova-icon') + '</span>' +
      '<span><strong>' + escHtml(template.name) + '</strong><em>' + escHtml(template.description) + '</em></span>' +
    '</button>'
  ).join('');
  host.querySelectorAll('.project-template-card').forEach((card) => {
    card.addEventListener('click', async () => {
      const templateId = (card as HTMLElement).dataset.templateId;
      if (!templateId) return;
      await switchPage('files');
      void getRuntime('handleNewFileFromTemplate')?.(templateId);
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
      '<span class="project-activity-icon type-' + escAttr(item.type) + '">' + novaIcon(iconForActivity(item.type), 'nova-icon nova-icon-xs') + '</span>' +
      '<div class="project-activity-main"><strong>' + escHtml(item.title) + '</strong>' +
      (item.subtitle ? '<em>' + escHtml(item.subtitle) + '</em>' : '') + '</div>' +
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
  await switchPage('files');
  const chooseWorkspace = getRuntime('chooseWorkspaceFolder');
  const ft = getRuntime('fileTree');
  if (typeof chooseWorkspace === 'function') await chooseWorkspace();
  else if (ft?.openFolder) await ft.openFolder();
}

async function exportCurrentProjectReport(format: ExportFormat): Promise<void> {
  if (!currentOverview) {
    showAlert('请先打开一个工作区');
    return;
  }
  try {
    const filePath = await exportProjectReport(format, {
      name: currentOverview.meta.name,
      description: currentOverview.meta.description,
      rootPath: currentOverview.meta.rootPath,
      documentStat: currentOverview.documentStat,
      todoStat: currentOverview.todoStat,
      historyStat: currentOverview.historyStat,
      recentDocuments: currentOverview.recentDocuments,
      activities: currentOverview.activities,
      ai: currentOverview.ai,
    });
    if (filePath) showAlert('项目报告已导出：\n' + filePath);
  } catch (error) {
    showAlert('导出项目报告失败：' + (error instanceof Error ? error.message : String(error)));
  }
}

function runProjectAI(mode: 'summary' | 'plan'): void {
  if (!currentOverview) return;
  const prompt = buildProjectPrompt(mode, currentOverview);
  void (async () => {
    await switchPage('ai');
    const input = document.getElementById('ai-chat-input') as HTMLTextAreaElement | null;
    if (input) {
      input.value = prompt;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    }
  })();
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

registerPageInit('project', initProjectPage);
