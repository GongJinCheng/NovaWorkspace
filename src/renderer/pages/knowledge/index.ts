/**
 * Knowledge Base Page — v2.9.0
 *
 * Manages per-workspace knowledge items:
 * import PDF, web pages, clipboard text, TXT/MD files,
 * browse items, view extracted text, trigger AI summaries.
 *
 * v2.9.x improvements:
 * - Full-text search across titles and content
 * - Auto-summarize after import (background AI call)
 * - Batch operations (select, delete, summarize)
 * - Checkbox selection mode
 */

import { switchPage, registerPageInit } from '../../app/router';
import { ipcClient } from '../../services/ipc-client';
import { getCurrentWorkspaceRoot } from '../../services/workspace-context';
import type { KnowledgeItem, KnowledgeIndex, KnowledgeStats, KnowledgeSourceType } from '../../../shared/types/knowledge';

let items: KnowledgeItem[] = [];
let currentDetailId: string | null = null;
let searchQuery = '';
let selectedItems = new Set<string>();

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

  // Search
  const searchInput = document.getElementById('kb-search-input');
  searchInput?.addEventListener('input', debounce(() => {
    searchQuery = (searchInput as HTMLInputElement).value.trim().toLowerCase();
    selectedItems.clear();
    renderList();
    updateBatchBar();
  }, 250));

  // Batch bar
  document.getElementById('kb-batch-delete')?.addEventListener('click', batchDelete);
  document.getElementById('kb-batch-summarize')?.addEventListener('click', batchSummarize);
  document.getElementById('kb-batch-cancel')?.addEventListener('click', () => {
    selectedItems.clear();
    renderList();
    updateBatchBar();
  });

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
    updateBatchBar();
  } catch (err) {
    console.error('Failed to load knowledge base:', err);
    renderError();
  }
}

// ── Render ────────────────────────────────────────────────────────

function renderEmptyWorkspace(): void {
  const listEl = document.getElementById('kb-list');
  if (listEl) {
    listEl.innerHTML = `<div class="kb-empty">
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

let fullTextCache = new Map<string, string>();

function renderList(): void {
  const listEl = document.getElementById('kb-list');
  if (!listEl) return;

  // Filter by search
  let filtered = items;
  if (searchQuery) {
    filtered = items.filter((item) => {
      // Title match
      if (item.title.toLowerCase().includes(searchQuery)) return true;
      if (item.sourceName.toLowerCase().includes(searchQuery)) return true;
      if (item.summary && item.summary.toLowerCase().includes(searchQuery)) return true;
      return false;
    });
  }

  if (items.length === 0) {
    listEl.innerHTML = `<div class="kb-empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <p>知识库为空</p>
      <span>导入 PDF、网页、剪贴板或 Markdown 文件开始积累知识</span>
    </div>`;
    return;
  }

  if (searchQuery && filtered.length === 0) {
    listEl.innerHTML = `<div class="kb-empty">
      <p>没有匹配"${escapeHtml(searchQuery)}"的资料</p>
    </div>`;
    return;
  }

  listEl.innerHTML = filtered
    .map((item) => {
      const checked = selectedItems.has(item.id);
      return `
    <div class="kb-card${checked ? ' kb-card-selected' : ''}" data-id="${item.id}">
      <label class="kb-card-check">
        <input type="checkbox" class="kb-checkbox" data-id="${item.id}" ${checked ? 'checked' : ''}>
      </label>
      <div class="kb-card-main">
        <div class="kb-card-icon">${sourceIcon(item.sourceType)}</div>
        <div class="kb-card-info">
          <div class="kb-card-title">${highlightMatch(escapeHtml(item.title), searchQuery)}</div>
          <div class="kb-card-meta">
            <span class="kb-card-source">${item.sourceName}</span>
            <span class="kb-card-words">${item.wordCount.toLocaleString()} 字</span>
            <span class="kb-card-date">${formatDate(item.createdAt)}</span>
          </div>
          ${item.summary ? `<div class="kb-card-summary">${highlightMatch(escapeHtml(item.summary), searchQuery)}</div>` : ''}
        </div>
      </div>
      <div class="kb-card-actions">
        <button class="kb-card-btn" data-action="view" data-id="${item.id}" title="查看原文">查看</button>
        <button class="kb-card-btn" data-action="summarize" data-id="${item.id}" title="AI 总结">总结</button>
        <button class="kb-card-btn kb-card-btn-danger" data-action="delete" data-id="${item.id}" title="删除">删除</button>
      </div>
    </div>`;
    })
    .join('');

  // Bind card actions
  listEl.querySelectorAll('.kb-card-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const el = e.currentTarget as HTMLElement;
      const action = el.dataset.action;
      const itemId = el.dataset.id;
      if (!itemId) return;
      if (action === 'view') viewItem(itemId);
      if (action === 'summarize') summarizeItemBg(itemId);
      if (action === 'delete') deleteItem(itemId);
    });
  });

  // Bind checkbox
  listEl.querySelectorAll('.kb-checkbox').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      const itemId = (e.target as HTMLInputElement).dataset.id;
      if (!itemId) return;
      if ((e.target as HTMLInputElement).checked) {
        selectedItems.add(itemId);
      } else {
        selectedItems.delete(itemId);
      }
      updateBatchBar();
      // Toggle card highlight
      (e.target as HTMLElement).closest('.kb-card')?.classList.toggle('kb-card-selected', (e.target as HTMLInputElement).checked);
    });
  });

  // Bind card click for selection
  listEl.querySelectorAll('.kb-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      // Don't toggle if clicking a button or checkbox
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('input')) return;
      const itemId = (card as HTMLElement).dataset.id;
      if (!itemId) return;
      if (selectedItems.has(itemId)) {
        selectedItems.delete(itemId);
        card.classList.remove('kb-card-selected');
      } else {
        selectedItems.add(itemId);
        card.classList.add('kb-card-selected');
      }
      updateBatchBar();
      // Sync checkbox
      const cb = card.querySelector('.kb-checkbox') as HTMLInputElement;
      if (cb) cb.checked = selectedItems.has(itemId);
    });
  });
}

function updateBatchBar(): void {
  const bar = document.getElementById('kb-batch-bar');
  const countEl = document.getElementById('kb-batch-count');
  if (!bar || !countEl) return;
  if (selectedItems.size > 0) {
    bar.style.display = 'flex';
    countEl.textContent = `已选 ${selectedItems.size} 项`;
  } else {
    bar.style.display = 'none';
  }
}

function renderDetail(item: KnowledgeItem, text: string): void {
  const panel = document.getElementById('kb-detail-panel');
  if (!panel) return;
  panel.style.display = 'flex';

  document.getElementById('kb-detail-title')!.textContent = item.title;
  document.getElementById('kb-detail-source')!.textContent = `${item.sourceName} · ${item.wordCount.toLocaleString()} 字`;
  document.getElementById('kb-detail-text')!.textContent = text;
}

// ── Full-text search ──────────────────────────────────────────────

async function performFullTextSearch(): Promise<void> {
  if (!searchQuery) {
    renderList();
    return;
  }

  // Already filtered by title/source/summary in renderList.
  // Now also search full text for deeper matches.
  const matchingIds = new Set(
    items.filter((item) => {
      if (item.title.toLowerCase().includes(searchQuery)) return true;
      if (item.sourceName.toLowerCase().includes(searchQuery)) return true;
      if (item.summary && item.summary.toLowerCase().includes(searchQuery)) return true;
      return false;
    }).map((i) => i.id)
  );

  // Search full text for remaining items not yet matched
  const toSearch = items.filter((i) => !matchingIds.has(i.id));
  if (toSearch.length === 0) {
    renderList();
    return;
  }

  showToast(`正在搜索 ${toSearch.length} 篇资料全文...`);

  let foundCount = 0;
  for (const item of toSearch) {
    try {
      const text = await ipcClient.knowledge.getText(item.id);
      if (text.toLowerCase().includes(searchQuery)) {
        matchingIds.add(item.id);
        foundCount++;
      }
    } catch {
      // skip
    }
  }

  // Re-filter items to only show matches
  const prevItems = items;
  items = items.filter((i) => matchingIds.has(i.id));
  renderList();
  items = prevItems; // Restore for subsequent searches
  showToast(`找到 ${matchingIds.size} 条匹配`);
}

// ── Background Summarize ──────────────────────────────────────────

async function summarizeItemBg(itemId: string): Promise<void> {
  const item = items.find((i) => i.id === itemId);
  if (!item) return;

  // Update card to show "summarizing" state
  const card = document.querySelector(`.kb-card[data-id="${itemId}"]`);
  const summaryEl = card?.querySelector('.kb-card-summary') as HTMLElement;
  if (!summaryEl && card) {
    const info = card.querySelector('.kb-card-info');
    if (info) {
      const div = document.createElement('div');
      div.className = 'kb-card-summary kb-summarizing';
      div.textContent = 'AI 总结中...';
      info.appendChild(div);
    }
  } else if (summaryEl) {
    summaryEl.className = 'kb-card-summary kb-summarizing';
    summaryEl.textContent = 'AI 总结中...';
  }

  try {
    const text = await ipcClient.knowledge.getText(itemId);
    if (!text.trim()) {
      showToast('资料内容为空，无法生成摘要');
      restoreSummaryState(itemId);
      return;
    }

    // Use global aiService
    const svc = (window as any).aiService;
    if (!svc) {
      showToast('AI 服务未就绪，请先打开 AI 助手页面初始化');
      restoreSummaryState(itemId);
      return;
    }

    if (!svc.isConfigured()) {
      showToast('请先在 AI 助手页面配置 AI 模型');
      restoreSummaryState(itemId);
      return;
    }

    const prompt = `请总结以下资料的内容，用一段简洁的中文概括（200字以内）：\n\n${text.slice(0, 8000)}`;
    const messages = [
      { role: 'system' as const, content: '你是一个专业的资料总结助手。请用简洁的中文回复，不要使用Markdown格式。' },
      { role: 'user' as const, content: prompt },
    ];

    const summary = await svc.chatStream(messages, { temperature: 0.3, max_tokens: 400 }, () => {
      // No streaming UI needed for background summarization
    });

    if (summary) {
      const workspaceRoot = getCurrentWorkspaceRoot();
      await window.electronAPI.knowledge.updateSummary(itemId, summary, workspaceRoot);
      // Update local item
      item.summary = summary;
      // Refresh the card
      refreshKnowledgePage();
      showToast('✅ 摘要已生成并保存');
    }
  } catch (err: any) {
    console.error('Summarize failed:', err);
    showToast(`总结失败: ${err.message}`);
    restoreSummaryState(itemId);
  }
}

function restoreSummaryState(itemId: string): void {
  const item = items.find((i) => i.id === itemId);
  const card = document.querySelector(`.kb-card[data-id="${itemId}"]`);
  if (!card) return;
  const summaryEl = card.querySelector('.kb-card-summary') as HTMLElement;
  if (summaryEl && !item?.summary) {
    summaryEl.remove();
  } else if (summaryEl && item?.summary) {
    summaryEl.className = 'kb-card-summary';
    summaryEl.textContent = item.summary;
  }
}

async function batchSummarize(): Promise<void> {
  const ids = [...selectedItems];
  if (ids.length === 0) return;
  showToast(`正在为 ${ids.length} 篇资料生成摘要...`);
  for (const id of ids) {
    await summarizeItemBg(id);
  }
  selectedItems.clear();
  updateBatchBar();
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
    const imported = await ipcClient.knowledge.importPdf(filePath);
    showToast('PDF 导入成功');
    await refreshKnowledgePage();
    // Auto-summarize
    if (imported) summarizeItemBg(imported.id);
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
    const imported = await ipcClient.knowledge.importWeb(url);
    showToast('网页导入成功');
    await refreshKnowledgePage();
    if (imported) summarizeItemBg(imported.id);
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
    const imported = await ipcClient.knowledge.create({
      title,
      sourceType: 'clipboard',
      sourceName: '剪贴板',
      textContent: content,
    });
    showToast('剪贴板文本已导入');
    await refreshKnowledgePage();
    if (imported) summarizeItemBg(imported.id);
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
    const imported = await ipcClient.knowledge.create({
      title,
      sourceType: isMd ? 'md' : 'txt',
      sourceName: fileName,
      sourcePath: filePath,
      textContent: content,
    });
    showToast('文件导入成功');
    await refreshKnowledgePage();
    if (imported) summarizeItemBg(imported.id);
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

async function deleteItem(itemId: string): Promise<void> {
  const item = items.find((i) => i.id === itemId);
  if (!item) return;

  if (!confirm(`确定要删除「${item.title}」吗？此操作不可撤销。`)) return;

  try {
    await ipcClient.knowledge.delete(itemId);
    showToast('已删除');
    selectedItems.delete(itemId);
    if (currentDetailId === itemId) closeDetail();
    await refreshKnowledgePage();
  } catch (err: any) {
    showToast(`删除失败: ${err.message}`);
  }
}

async function batchDelete(): Promise<void> {
  const ids = [...selectedItems];
  if (ids.length === 0) return;
  if (!confirm(`确定要删除选中的 ${ids.length} 篇资料吗？此操作不可撤销。`)) return;

  try {
    for (const id of ids) {
      await ipcClient.knowledge.delete(id);
    }
    showToast(`已删除 ${ids.length} 篇资料`);
    selectedItems.clear();
    updateBatchBar();
    await refreshKnowledgePage();
  } catch (err: any) {
    showToast(`批量删除失败: ${err.message}`);
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

function highlightMatch(text: string, query: string): string {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(
    new RegExp(`(${escaped})`, 'gi'),
    '<mark class="kb-highlight">$1</mark>'
  );
}

function debounce(fn: () => void, delay: number): () => void {
  let timer: ReturnType<typeof setTimeout>;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, delay);
  };
}

function showToast(message: string): void {
  if (typeof (window as any).__showToast === 'function') {
    (window as any).__showToast(message);
    return;
  }
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
