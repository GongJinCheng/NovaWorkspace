/**
 * AI Page - AI assistant with conversational chat + quick tools
 */
import { aiService, type ChatMessage } from './ai-service';
import { registerPageInit } from '../../app/router';
import { aiStats } from '../../app/index';

(window as any).aiService = aiService;

// ── Chat state ──
const chatHistory: ChatMessage[] = [];
let isGenerating = false;

// ── Tool action labels ──
const ACTION_LABELS: Record<string, { loading: string; success: string }> = {
  format:    { loading: '格式化中...', success: '✓ 格式化完成' },
  explain:   { loading: '解释中...',   success: '✓ 解释完成' },
  summarize: { loading: '总结中...',   success: '✓ 总结完成' },
  translate: { loading: '翻译中...',   success: '✓ 翻译完成' },
};

function persistStats(): void {
  localStorage.setItem('ai-stats', JSON.stringify(aiStats));
}

// ── Chat UI ──

function appendMessage(role: 'user' | 'assistant' | 'system', content: string): HTMLElement {
  const container = document.getElementById('ai-chat-messages');
  if (!container) return document.createElement('div');

  // Remove welcome screen on first message
  const welcome = container.querySelector('.ai-chat-welcome');
  if (welcome) welcome.remove();

  const bubble = document.createElement('div');
  bubble.className = 'ai-msg-bubble ai-msg-' + role;
  bubble.textContent = content;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
  return bubble;
}

function appendLoadingIndicator(): HTMLElement {
  const container = document.getElementById('ai-chat-messages');
  if (!container) return document.createElement('div');

  const el = document.createElement('div');
  el.className = 'ai-msg-loading';
  el.innerHTML =
    '<div class="ai-loading-dots"><span></span><span></span><span></span></div>' +
    '<span>正在思考...</span>';
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

function removeLoadingIndicator(el: HTMLElement): void {
  el.remove();
}

async function sendMessage(text: string): Promise<void> {
  if (!text.trim() || isGenerating) return;
  if (!aiService.isConfigured()) {
    appendMessage('system', '请先在右侧配置 API Key');
    return;
  }

  const input = document.getElementById('ai-chat-input') as HTMLTextAreaElement;
  if (input) {
    input.value = '';
    input.style.height = 'auto';
  }

  appendMessage('user', text.trim());
  chatHistory.push({ role: 'user', content: text.trim() });

  isGenerating = true;
  updateSendButton();
  const loadingEl = appendLoadingIndicator();

  try {
    const systemMsg: ChatMessage = {
      role: 'system',
      content: '你是一个专业的编程助手，帮助用户分析代码、翻译文档、回答技术问题。请用中文回复。'
    };
    const messages = [systemMsg, ...chatHistory];

    const result = await aiService.chat(messages, { temperature: 0.7 });

    removeLoadingIndicator(loadingEl);
    appendMessage('assistant', result);
    chatHistory.push({ role: 'assistant', content: result });

    incrementAIStats(Math.ceil((text.length + result.length) / 4));
  } catch (err) {
    removeLoadingIndicator(loadingEl);
    const errMsg = err instanceof Error ? err.message : String(err);
    appendMessage('system', '请求失败: ' + errMsg);
  } finally {
    isGenerating = false;
    updateSendButton();
  }
}

function updateSendButton(): void {
  const btn = document.getElementById('btn-ai-send') as HTMLButtonElement;
  if (btn) btn.disabled = isGenerating;
}

function clearChat(): void {
  chatHistory.length = 0;
  const container = document.getElementById('ai-chat-messages');
  if (!container) return;
  container.innerHTML =
    '<div class="ai-chat-welcome">' +
    '<div class="ai-chat-welcome-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93L12 22"/><path d="M12 2a4 4 0 0 0-4 4c0 1.95 1.4 3.58 3.25 3.93"/><path d="M12 2v20"/></svg></div>' +
    '<h3>AI 助手</h3>' +
    '<p>我可以帮你分析代码、翻译文档、回答问题。</p>' +
    '<div class="ai-chat-suggestions">' +
    '<button class="ai-suggestion" data-msg="帮我解释一下这段代码">解释代码</button>' +
    '<button class="ai-suggestion" data-msg="将以下内容翻译成英文">翻译内容</button>' +
    '<button class="ai-suggestion" data-msg="总结一下这段内容的要点">内容摘要</button>' +
    '</div></div>';
  bindSuggestions();
}

function bindSuggestions(): void {
  document.querySelectorAll('.ai-suggestion').forEach(el => {
    el.addEventListener('click', () => {
      const msg = (el as HTMLElement).dataset.msg;
      if (msg) sendMessage(msg);
    });
  });
}

// ── Input handling ──

function initChatInput(): void {
  const input = document.getElementById('ai-chat-input') as HTMLTextAreaElement;
  const sendBtn = document.getElementById('btn-ai-send');

  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input.value);
      }
    });
    input.addEventListener('input', () => {
      // Auto-resize
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });
  }

  sendBtn?.addEventListener('click', () => {
    if (input) sendMessage(input.value);
  });

  document.getElementById('btn-ai-clear')?.addEventListener('click', clearChat);
}

// ── Sidebar toggle ──

function initSidebarToggle(): void {
  const sidebar = document.getElementById('ai-sidebar');
  const toggleBtn = document.getElementById('btn-ai-toggle-panel');
  const configToggle = document.getElementById('ai-config-toggle');
  const configBody = document.getElementById('ai-config-body');

  toggleBtn?.addEventListener('click', () => {
    sidebar?.classList.toggle('hidden');
  });

  configToggle?.addEventListener('click', () => {
    configBody?.classList.toggle('collapsed');
    const arrow = configToggle.querySelector('svg');
    if (arrow) {
      arrow.style.transform = configBody?.classList.contains('collapsed') ? 'rotate(-90deg)' : '';
    }
  });
}

// ── Config management ──

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
  showMsg('配置已保存', 'success');
  updateAIStatus();
}

async function testAIConnection(): Promise<void> {
  if (!aiService.isConfigured()) { showMsg('请先填写 API Key', 'warn'); return; }
  showMsg('正在测试连接...', 'info');
  try {
    const models = await aiService.fetchModels();
    showMsg('连接成功！发现 ' + models.length + ' 个模型', 'success');
    populateModelSelector(models);
  } catch (err: unknown) {
    showMsg('连接失败: ' + (err instanceof Error ? err.message : String(err)), 'error');
  }
}

async function fetchModels(): Promise<void> {
  try {
    const models = await aiService.fetchModels();
    populateModelSelector(models);
    showMsg('找到 ' + models.length + ' 个模型', 'success');
  } catch (err: unknown) {
    showMsg('获取失败: ' + (err instanceof Error ? err.message : String(err)), 'error');
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
  customOpt.textContent = '-- 自定义 --';
  select.appendChild(customOpt);
}

function toggleApiKeyVisibility(): void {
  const input = document.getElementById('ai-api-key') as HTMLInputElement | null;
  if (input) input.type = input.type === 'password' ? 'text' : 'password';
}

// ── Tool actions ──

async function handleAIAction(action: string): Promise<void> {
  if (!aiService.isConfigured()) { appendMessage('system', '请先配置 API Key'); return; }
  const em = (window as any).__editorManager;
  if (!em?.activeEditor) { appendMessage('system', '请先在文件管理器中打开一个文件'); return; }
  const editorData = em.editors.get(em.activeEditor);
  if (!editorData) return;
  const content = editorData.model.getValue();
  if (!content.trim()) { appendMessage('system', '文件内容为空'); return; }

  const labels = ACTION_LABELS[action] || { loading: '处理中...', success: '✓ 完成' };

  const cardBtn = document.getElementById('btn-ai-' + action) as HTMLButtonElement | null;
  const toolbarBtn = document.getElementById('btn-ai-format-toolbar') as HTMLButtonElement | null;
  const originalCardHTML = cardBtn?.innerHTML || '';
  const originalToolbarHTML = toolbarBtn?.innerHTML || '';

  if (cardBtn) {
    cardBtn.disabled = true;
    cardBtn.innerHTML = '<span class="ai-spinner"></span> ' + labels.loading;
    cardBtn.classList.add('loading');
  }
  if (toolbarBtn && action === 'format') {
    toolbarBtn.disabled = true;
    toolbarBtn.classList.add('loading');
  }

  try {
    let result: string;
    let title: string;
    switch (action) {
      case 'format': title = '格式化结果'; result = await aiService.formatMarkdown(content); break;
      case 'explain': title = '代码解释'; result = await aiService.explainCode(content); break;
      case 'summarize': title = '内容摘要'; result = await aiService.summarize(content); break;
      case 'translate': title = '翻译结果'; result = await aiService.translate(content); break;
      default: return;
    }
    incrementAIStats(Math.ceil((content.length + result.length) / 4));

    // Show result in chat
    appendMessage('user', '[' + title + '] 请处理当前文件内容');
    appendMessage('assistant', result);

    if (cardBtn) {
      cardBtn.innerHTML = labels.success;
      cardBtn.classList.remove('loading');
      cardBtn.classList.add('success');
    }
    if (toolbarBtn && action === 'format') {
      toolbarBtn.classList.remove('loading');
      toolbarBtn.title = labels.success;
    }

    // For format action, offer to apply
    if (action === 'format') {
      showAIModal(title, result, () => {
        editorData.model.setValue(result);
      });
    } else {
      showAIModal(title, result);
    }

    setTimeout(() => {
      if (cardBtn) {
        cardBtn.disabled = false;
        cardBtn.innerHTML = originalCardHTML;
        cardBtn.classList.remove('success');
      }
      if (toolbarBtn && action === 'format') {
        toolbarBtn.disabled = false;
        toolbarBtn.innerHTML = originalToolbarHTML;
        toolbarBtn.classList.remove('loading');
        toolbarBtn.title = 'AI 格式化';
      }
    }, 2000);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    appendMessage('system', '操作失败: ' + errMsg);
    if (cardBtn) {
      cardBtn.disabled = false;
      cardBtn.innerHTML = originalCardHTML;
      cardBtn.classList.remove('loading');
    }
    if (toolbarBtn && action === 'format') {
      toolbarBtn.disabled = false;
      toolbarBtn.innerHTML = originalToolbarHTML;
      toolbarBtn.classList.remove('loading');
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
  modal.innerHTML =
    '<div class="ai-modal-content">' +
    '<div class="ai-modal-header"><h3>' + title + '</h3>' +
    '<button class="ai-modal-close" id="ai-modal-close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>' +
    '<div class="ai-result">' + escHTML(content) + '</div>' +
    (onApply ? '<div class="ai-modal-actions"><button class="ai-save" id="ai-modal-apply"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> 应用到文件</button></div>' : '') +
    '</div>';
  document.body.appendChild(modal);
  document.getElementById('ai-modal-close')?.addEventListener('click', () => modal.remove());
  if (onApply) {
    document.getElementById('ai-modal-apply')?.addEventListener('click', () => {
      onApply();
      modal.remove();
      appendMessage('system', '已将结果应用到当前文件');
    });
  }
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

// ── Status & Stats ──

function updateAIStatus(): void {
  const isConfigured = aiService.isConfigured();
  const chip = document.getElementById('ai-status-chip');
  const dot = chip?.querySelector('.ai-dot');
  const text = chip?.querySelector('.ai-status-text');
  if (text) text.textContent = isConfigured ? '已连接' : '未配置';
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
  if (msgEl) {
    msgEl.textContent = text;
    msgEl.className = 'ai-msg show ' + type;
    setTimeout(() => { msgEl.className = 'ai-msg'; }, 3000);
  }
}

function setInputValue(id: string, value: string): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.value = value;
}

function getInputValue(id: string): string {
  const el = document.getElementById(id) as HTMLInputElement | null;
  return el?.value?.trim() ?? '';
}

// ── Init ──

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

  initChatInput();
  initSidebarToggle();
  bindSuggestions();
  loadAIConfig();
  updateStatsDisplay();
  console.log('[AI] 页面初始化完成');
}

registerPageInit('ai', initAIPage);