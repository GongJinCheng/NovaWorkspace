/**
 * Knowledge Base Page — v2.9.0
 *
 * Manages per-workspace knowledge items:
 * import PDF, web pages, clipboard text, TXT/MD files,
 * browse items, view extracted text, and trigger AI summaries.
 */

import { switchPage, registerPageInit } from '../../app/router';
import { ipcClient } from '../../services/ipc-client';
import { getCurrentWorkspaceRoot } from '../../services/workspace-context';
import type { KnowledgeItem, KnowledgeIndex, KnowledgeStats, KnowledgeSourceType } from '../../../shared/types/knowledge';

let items: KnowledgeItem[] = [];
let currentDetailId: string | null = null;

export function initKnowledgePage(): void {
  bindEvents();
  refreshKnowledgePage();
}

function bindEvents(): void {
  // Import buttons
  document.getElementById('kb-btn-import-pdf')?.addEventListener('click', handleImportPdf);
  document.getElementById('kb-btn-import-url')?.addEventListener('click', handleImportUrl);
  document.getElementById('kb-btn-import-clipboard')?.addEventListener('click', handleImportClipboard);
  document.getElementById('kb-btn-import-file')?.addEventListener('click', handleImportFile);

  // URL modal
  document.getElementById('kb-url-cancel')?.addEventListener('click', closeUrlModal);
  document.getElementById('kb-url-confirm')?.addEventListener('click', confirmUrlImport);
  document.getElementById('kb-url-modal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'kb-url-modal') closeUrlModal();
  });

  // Clipboard modal
  document.getElementById('kb-clip-cancel')?.addEventListener('click', closeClipModal);
  document.getElementById('kb-clip-confirm')?.addEventListener('click', confirmClipImport);
  document.getElementById('kb-clip-modal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'kb-clip-modal') closeClipModal();
  });

  // Detail panel close
  document.getElementById('kb-detail-close')?.addEventListener('click', closeDetail);
}

// ── Refresh ───────────────────────────────────────────────────────

async function refreshKnowledgePage(): Promise<void> {
  const workspaceRoot = getCurrentWorkspaceRoot();
  if (!workspaceRoot) {
    renderEmptyWorkspace();
    return;
  }

  try {
    const [index, stats] = await Promise.all([
      ipcClient.knowledge.list(workspaceRoot),
      ipcClient.knowledge.getStats(workspaceRoot),
    ]);
    items = index.items || [];
    renderStats(stats);
    renderList();
  } catch (err) {
    console.error('Failed to load knowledge base:', err);
    renderError();
  }
}

// ── Render ────────────────────────────────────────────────────────

function renderEmptyWorkspace(): void {
  const listEl = document.getElementById('kb-list');
  if (listEl) {
    listEl.innerHTML = `
      <div class="kb-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
          <polyline points="13 2 13 9 20 9"/>
        </svg>
        <p>请先打开一个工作区</p>
      </div>`;
  }
  renderStats({ totalItems: 0, totalWords: 0, bySource: { pdf: 0, txt: 0, md: 0, clipboard: 0, url: 0 } });
}

function renderStats(stats: KnowledgeStats): void {
  const el = document.getElementById('kb-stats');
  if (!el) return;
  el.innerHTML = `
    <span class="kb-stat"><strong>${stats.totalItems}</strong> 项资料</span>
    <span class="kb-stat"><strong>${stats.totalWords.toLocaleString()}</strong> 字数</span>
  `;
}

function renderList(): void {
  const listEl = document.getElementById('kb-list');
  if (!listEl) return;

  if (items.length === 0) {
    listEl.innerHTML = `
      <div class="kb-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <p>知识库为空</p>
        <span>导入 PDF、网页、剪贴板或 Markdown 文件开始积累知识</span>
      </div>`;
    return;
  }

  listEl.innerHTML = items
    .map(
      (item) => `
    <div class="kb-card" data-id="${item.id}">
      <div class="kb-card-main">
        <div class="kb-card-icon">${sourceIcon(item.sourceType)}</div>
        <div class="kb-card-info">
          <div class="kb-card-title">${escapeHtml(item.title)}</div>
          <div class="kb-card-meta">
            <span class="kb-card-source">${item.sourceName}</span>
            <span class="kb-card-words">${item.wordCount.toLocaleString()} 字</span>
            <span class="kb-card-date">${formatDate(item.createdAt)}</span>
          </div>
          ${item.summary ? `<div class="kb-card-summary">${escapeHtml(item.summary)}</div>` : ''}
        </div>
      </div>
      <div class="kb-card-actions">
        <button class="kb-card-btn" data-action="view" data-id="${item.id}" title="查看原文">查看</button>
        <button class="kb-card-btn" data-action="summarize" data-id="${item.id}" title="AI 总结">总结</button>
        <button class="kb-card-btn kb-card-btn-danger" data-action="delete" data-id="${item.id}" title="删除">删除</button>
      </div>
    </div>`
    )
    .join('');

  // Bind card actions
  listEl.querySelectorAll('.kb-card-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const el = e.currentTarget as HTMLElement;
      const action = el.dataset.action;
      const itemId = el.dataset.id;
      if (!itemId) return;
      if (action === 'view') viewItem(itemId);
      if (action === 'summarize') summarizeItem(itemId);
      if (action === 'delete') deleteItem(itemId);
    });
  });
}

function renderDetail(item: KnowledgeItem, text: string): void {
  const panel = document.getElementById('kb-detail-panel');
  if (!panel) return;
  panel.style.display = 'flex';

  document.getElementById('kb-detail-title')!.textContent = item.title;
  document.getElementById('kb-detail-source')!.textContent = `${item.sourceName} · ${item.wordCount.toLocaleString()} 字`;
  document.getElementById('kb-detail-text')!.textContent = text;
}

// ── Actions ───────────────────────────────────────────────────────

async function handleImportPdf(): Promise<void> {
  const result = await window.electronAPI.fs.showOpenDialog({
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths?.length) return;

  const filePath = result.filePaths[0];
  showToast('正在解析 PDF...');
  try {
    await ipcClient.knowledge.importPdf(filePath);
    showToast('PDF 导入成功');
    await refreshKnowledgePage();
  } catch (err: any) {
    showToast(`导入失败: ${err.message}`);
  }
}

function handleImportUrl(): void {
  const modal = document.getElementById('kb-url-modal');
  if (modal) {
    modal.style.display = 'flex';
    (document.getElementById('kb-url-input') as HTMLInputElement).value = '';
    (document.getElementById('kb-url-input') as HTMLInputElement).focus();
  }
}

function closeUrlModal(): void {
  const modal = document.getElementById('kb-url-modal');
  if (modal) modal.style.display = 'none';
}

async function confirmUrlImport(): Promise<void> {
  const input = document.getElementById('kb-url-input') as HTMLInputElement;
  const url = input.value.trim();
  if (!url) return;

  closeUrlModal();
  showToast('正在抓取网页...');
  try {
    await ipcClient.knowledge.importWeb(url);
    showToast('网页导入成功');
    await refreshKnowledgePage();
  } catch (err: any) {
    showToast(`导入失败: ${err.message}`);
  }
}

function handleImportClipboard(): void {
  const modal = document.getElementById('kb-clip-modal');
  if (modal) {
    modal.style.display = 'flex';
    navigator.clipboard.readText().then((text) => {
      (document.getElementById('kb-clip-textarea') as HTMLTextAreaElement).value = text;
    }).catch(() => {});
    (document.getElementById('kb-clip-title') as HTMLInputElement).focus();
  }
}

function closeClipModal(): void {
  const modal = document.getElementById('kb-clip-modal');
  if (modal) modal.style.display = 'none';
}

async function confirmClipImport(): Promise<void> {
  const title = (document.getElementById('kb-clip-title') as HTMLInputElement).value.trim();
  const content = (document.getElementById('kb-clip-textarea') as HTMLTextAreaElement).value.trim();
  if (!title || !content) return;

  closeClipModal();
  try {
    await ipcClient.knowledge.create({
      title,
      sourceType: 'clipboard',
      sourceName: '剪贴板',
      textContent: content,
    });
    showToast('剪贴板文本已导入');
    await refreshKnowledgePage();
  } catch (err: any) {
    showToast(`导入失败: ${err.message}`);
  }
}

async function handleImportFile(): Promise<void> {
  const result = await window.electronAPI.fs.showOpenDialog({
    filters: [
      { name: 'Text Files', extensions: ['txt', 'md', 'markdown'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths?.length) return;

  const filePath = result.filePaths[0];
  try {
    const content = await ipcClient.fs.readFile(filePath);
    const fileName = filePath.split(/[/\\]/).pop() || 'unknown';
    const isMd = fileName.endsWith('.md') || fileName.endsWith('.markdown');
    const title = fileName.replace(/\.(md|markdown|txt)$/i, '');
    await ipcClient.knowledge.create({
      title,
      sourceType: isMd ? 'md' : 'txt',
      sourceName: fileName,
      sourcePath: filePath,
      textContent: content,
    });
    showToast('文件导入成功');
    await refreshKnowledgePage();
  } catch (err: any) {
    showToast(`导入失败: ${err.message}`);
  }
}

async function viewItem(itemId: string): Promise<void> {
  const item = items.find((i) => i.id === itemId);
  if (!item) return;
  try {
    const text = await ipcClient.knowledge.getText(itemId);
    currentDetailId = itemId;
    renderDetail(item, text);
  } catch (err: any) {
    showToast(`读取失败: ${err.message}`);
  }
}

function closeDetail(): void {
  const panel = document.getElementById('kb-detail-panel');
  if (panel) panel.style.display = 'none';
  currentDetailId = null;
}

async function summarizeItem(itemId: string): Promise<void> {
  const item = items.find((i) => i.id === itemId);
  if (!item) return;

  try {
    const text = await ipcClient.knowledge.getText(itemId);
    if (!text.trim()) {
      showToast('资料内容为空，无法生成摘要');
      return;
    }
    // Store the item context and switch to AI page
    sessionStorage.setItem('kb-summarize-id', itemId);
    sessionStorage.setItem('kb-summarize-text', text.slice(0, 8000));
    switchPage('ai');
  } catch (err: any) {
    showToast(`读取资料失败: ${err.message}`);
  }
}

async function deleteItem(itemId: string): Promise<void> {
  const item = items.find((i) => i.id === itemId);
  if (!item) return;

  if (!confirm(`确定要删除「${item.title}」吗？此操作不可撤销。`)) return;

  try {
    await ipcClient.knowledge.delete(itemId);
    showToast('已删除');
    if (currentDetailId === itemId) closeDetail();
    await refreshKnowledgePage();
  } catch (err: any) {
    showToast(`删除失败: ${err.message}`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function sourceIcon(type: KnowledgeSourceType): string {
  const icons: Record<KnowledgeSourceType, string> = {
    pdf: '📄',
    txt: '📝',
    md: '📑',
    clipboard: '📋',
    url: '🌐',
  };
  return icons[type] || '📄';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message: string): void {
  // Use the global toast if available
  if (typeof (window as any).__showToast === 'function') {
    (window as any).__showToast(message);
    return;
  }
  // Fallback simple toast
  const toast = document.createElement('div');
  toast.className = 'kb-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('kb-toast-show'));
  setTimeout(() => {
    toast.classList.remove('kb-toast-show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

registerPageInit('knowledge', initKnowledgePage);
