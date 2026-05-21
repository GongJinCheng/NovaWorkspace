/**
 * AI Page - AI assistant page
 */
import { aiService } from './ai-service';
import { registerPageInit } from '../../app/router';
import { aiStats } from '../../app/index';

(window as any).aiService = aiService;

const ACTION_LABELS: Record<string, { loading: string; success: string }> = {
  format:   { loading: '格式化中...', success: '✓ 格式化完成' },
  explain:  { loading: '解释中...',   success: '✓ 解释完成' },
  summarize:{ loading: '总结中...',   success: '✓ 总结完成' },
  translate:{ loading: '翻译中...',   success: '✓ 翻译完成' },
};

function persistStats(): void {
  localStorage.setItem('ai-stats', JSON.stringify(aiStats));
}

function loadAIConfig(): void {
  setInputValue('ai-api-key', aiService.getApiKey());
  setInputValue('ai-base-url', aiService.getBaseUrl());
  setInputValue('ai-model-select', aiService.getModel());
  updateAIStatus();
}

function saveAIConfig(): void {
  aiService.saveConfig({
    apiKey: getInputValue('ai-api-key'),
    baseUrl: getInputValue('ai-base-url'),
    model: getInputValue('ai-model-select'),
  });
  showMsg('Config saved', 'success');
  updateAIStatus();
}

async function testAIConnection(): Promise<void> {
  if (!aiService.isConfigured()) { showMsg('Please configure API Key first', 'warn'); return; }
  showMsg('Testing connection...', 'info');
  try {
    const models = await aiService.fetchModels();
    showMsg('Connected! Found ' + models.length + ' models', 'success');
    populateModelSelector(models);
  } catch (err: unknown) {
    showMsg('Connection failed: ' + (err instanceof Error ? err.message : String(err)), 'error');
  }
}

async function fetchModels(): Promise<void> {
  try {
    const models = await aiService.fetchModels();
    populateModelSelector(models);
    showMsg('Found ' + models.length + ' models', 'success');
  } catch (err: unknown) {
    showMsg('Failed: ' + (err instanceof Error ? err.message : String(err)), 'error');
  }
}

function populateModelSelector(models: string[]): void {
  const select = document.getElementById('ai-model-select') as HTMLSelectElement | null;
  if (!select) return;
  select.innerHTML = '';
  models.sort().forEach(id => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = id;
    select.appendChild(opt);
  });
  const customOpt = document.createElement('option');
  customOpt.value = 'custom';
  customOpt.textContent = '-- Custom --';
  select.appendChild(customOpt);
}

function toggleApiKeyVisibility(): void {
  const input = document.getElementById('ai-api-key') as HTMLInputElement | null;
  if (input) input.type = input.type === 'password' ? 'text' : 'password';
}

async function handleAIAction(action: string): Promise<void> {
  if (!aiService.isConfigured()) { alert('Please configure AI first'); return; }
  const em = (window as any).__editorManager;
  if (!em?.activeEditor) { alert('Please open a file first'); return; }
  const editorData = em.editors.get(em.activeEditor);
  if (!editorData) return;
  const content = editorData.model.getValue();
  if (!content.trim()) { alert('File is empty'); return; }

  const labels = ACTION_LABELS[action] || { loading: '处理中...', success: '✓ 完成' };

  // Find both the card button and toolbar button for this action
  const cardBtn = document.getElementById('btn-ai-' + action) as HTMLButtonElement | null;
  const toolbarBtn = document.getElementById('btn-ai-format-toolbar') as HTMLButtonElement | null;
  const originalCardHTML = cardBtn?.innerHTML || '';
  const originalToolbarHTML = toolbarBtn?.innerHTML || '';

  // Enter loading state
  if (cardBtn) {
    cardBtn.disabled = true;
    cardBtn.innerHTML = '<span class="ai-spinner"></span> ' + labels.loading;
    cardBtn.classList.add('loading');
  }
  if (toolbarBtn && action === 'format') {
    toolbarBtn.disabled = true;
    toolbarBtn.innerHTML = '<span class=ai-spinner></span> ' + labels.loading;
    toolbarBtn.classList.add('loading');
  }

  try {
    let result: string;
    let title: string;
    switch (action) {
      case 'format': title = 'Formatted'; result = await aiService.formatMarkdown(content); break;
      case 'explain': title = 'Explanation'; result = await aiService.explainCode(content); break;
      case 'summarize': title = 'Summary'; result = await aiService.summarize(content); break;
      case 'translate': title = 'Translation'; result = await aiService.translate(content); break;
      default: return;
    }
    incrementAIStats(Math.ceil((content.length + result.length) / 4));

    // Show success state briefly
    if (cardBtn) {
      cardBtn.innerHTML = labels.success;
      cardBtn.classList.remove('loading');
      cardBtn.classList.add('success');
    }
    if (toolbarBtn && action === 'format') {
      toolbarBtn.innerHTML = labels.success;
      toolbarBtn.classList.remove('loading');
      toolbarBtn.classList.add('success');
    }

    showAIModal(title, result, action === 'format' ? () => editorData.model.setValue(result) : undefined);

    // Restore after 2 seconds
    setTimeout(() => {
      if (cardBtn) {
        cardBtn.disabled = false;
        cardBtn.innerHTML = originalCardHTML;
        cardBtn.classList.remove('success');
      }
      if (toolbarBtn && action === 'format') {
        toolbarBtn.disabled = false;
        toolbarBtn.innerHTML = originalToolbarHTML;
        toolbarBtn.classList.remove('success');
        toolbarBtn.title = 'AI 格式化';
      }
    }, 2000);
  } catch (err: unknown) {
    alert('AI failed: ' + (err instanceof Error ? err.message : String(err)));
    // Restore immediately on error
    if (cardBtn) {
      cardBtn.disabled = false;
      cardBtn.innerHTML = originalCardHTML;
      cardBtn.classList.remove('loading');
    }
    if (toolbarBtn && action === 'format') {
        toolbarBtn.disabled = false;
        toolbarBtn.innerHTML = originalToolbarHTML;
      toolbarBtn.classList.remove('loading');
      toolbarBtn.title = 'AI 格式化';
    }
  }
}

function escHTML(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showAIModal(title: string, content: string, onApply?: () => void): void {
  const existing = document.querySelector('.ai-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'ai-modal';
  modal.innerHTML = '<div class="ai-modal-content"><div class="ai-modal-header"><h3>' + title + '</h3><button class="ai-modal-close" id="ai-modal-close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div><div class="ai-result">' + escHTML(content) + '</div>' + (onApply ? '<div class="ai-modal-actions"><button class="ai-save" id="ai-modal-apply"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Apply</button></div>' : '') + '</div>';
  document.body.appendChild(modal);
  document.getElementById('ai-modal-close')?.addEventListener('click', () => modal.remove());
  if (onApply) document.getElementById('ai-modal-apply')?.addEventListener('click', () => { onApply(); modal.remove(); });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

function updateAIStatus(): void {
  const isConfigured = aiService.isConfigured();
  const chip = document.getElementById('ai-status-chip');
  const dot = chip?.querySelector('.ai-dot');
  const text = chip?.querySelector('.ai-status-text');
  if (text) text.textContent = isConfigured ? 'Connected' : 'Not configured';
  dot?.classList.toggle('active', isConfigured);
  const modelDisplay = document.getElementById('ai-model-display');
  if (modelDisplay) modelDisplay.textContent = isConfigured ? aiService.getModel() : '-';
  document.querySelectorAll('.ai-tool-card').forEach(btn => (btn as HTMLButtonElement).disabled = !isConfigured);
  updateStatsDisplay();
}

function updateStatsDisplay(): void {
  const tokensEl = document.getElementById('ai-tokens');
  const requestsEl = document.getElementById('ai-requests');
  if (tokensEl) tokensEl.textContent = aiStats.tokens > 1000 ? (aiStats.tokens / 1000).toFixed(1) + 'k' : String(aiStats.tokens);
  if (requestsEl) requestsEl.textContent = String(aiStats.requests);
}

function incrementAIStats(tokens: number): void {
  aiStats.tokens += tokens;
  aiStats.requests += 1;
  persistStats();
  updateStatsDisplay();
}

function showMsg(text: string, type: string = 'info'): void {
  const msgEl = document.getElementById('ai-msg');
  if (msgEl) { msgEl.textContent = text; msgEl.className = 'ai-msg show ' + type; setTimeout(() => { msgEl.className = 'ai-msg'; }, 3000); }
}

function setInputValue(id: string, value: string): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.value = value;
}

function getInputValue(id: string): string {
  const el = document.getElementById(id) as HTMLInputElement | null;
  return el?.value?.trim() ?? '';
}

function initAIPage(): void {
  document.getElementById('btn-save-ai')?.addEventListener('click', saveAIConfig);
  document.getElementById('btn-test-ai')?.addEventListener('click', () => testAIConnection());
  document.getElementById('btn-toggle-key')?.addEventListener('click', toggleApiKeyVisibility);
  document.getElementById('btn-fetch-models')?.addEventListener('click', () => fetchModels());
  document.getElementById('btn-ai-format')?.addEventListener('click', () => handleAIAction('format'));
  document.getElementById('btn-ai-explain')?.addEventListener('click', () => handleAIAction('explain'));
  document.getElementById('btn-ai-summarize')?.addEventListener('click', () => handleAIAction('summarize'));
  document.getElementById('btn-ai-translate')?.addEventListener('click', () => handleAIAction('translate'));

  const modelSelect = document.getElementById('ai-model-select') as HTMLSelectElement | null;
  modelSelect?.addEventListener('change', (e) => {
    const target = e.target as HTMLSelectElement;
    const customInput = document.getElementById('ai-model-custom');
    if (target.value === 'custom') {
      if (customInput) { customInput.style.display = 'block'; (customInput as HTMLInputElement).focus(); }
    } else {
      if (customInput) customInput.style.display = 'none';
      aiService.saveConfig({ model: target.value });
    }
  });

  loadAIConfig();
  updateStatsDisplay();
  console.log('[AI] Page initialized');
}

registerPageInit('ai', initAIPage);