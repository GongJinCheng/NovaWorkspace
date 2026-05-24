/**
 * AI Page - AI assistant with conversational chat + quick tools
 * Now with streaming responses for typewriter effect.
 */
import { aiService, type ChatMessage } from './ai-service';
import { registerPageInit } from '../../app/router';
import { aiStats } from '../../app/index';

(window as any).aiService = aiService;

// Chat state
const chatHistory: ChatMessage[] = [];
let isGenerating = false;

// Tool action labels
const ACTION_LABELS: Record<string, { loading: string; success: string }> = {
  format:    { loading: '\u683C\u5F0F\u5316\u4E2D...', success: '\u2705 \u683C\u5F0F\u5316\u5B8C\u6210' },
  explain:   { loading: '\u89E3\u91CA\u4E2D...',   success: '\u2705 \u89E3\u91CA\u5B8C\u6210' },
  summarize: { loading: '\u603B\u7ED3\u4E2D...',   success: '\u2705 \u603B\u7ED3\u5B8C\u6210' },
  translate: { loading: '\u7FFB\u8BD1\u4E2D...',   success: '\u2705 \u7FFB\u8BD1\u5B8C\u6210' },
};

function persistStats(): void {
  localStorage.setItem('ai-stats', JSON.stringify(aiStats));
}

// Chat UI

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
    '<span>\u6B63\u5728\u601D\u8003..</span>';
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
    appendMessage('system', '\u8BF7\u5148\u5728\u53F3\u4FA7\u914D\u7F6E API Key');
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

  const container = document.getElementById('ai-chat-messages');
  const bubble = appendMessage('assistant', '');
  bubble.classList.add('streaming');

  try {
    const systemMsg: ChatMessage = {
      role: 'system',
      content: '\u4F60\u662F\u4E00\u4E2A\u4E13\u4E1A\u7684\u7F16\u7A0B\u52A9\u624B\uFF0C\u5E2E\u52A9\u7528\u6237\u5206\u6790\u4EE3\u7801\u3001\u7FFB\u8BD1\u6587\u6863\u3001\u56DE\u7B54\u6280\u672F\u95EE\u9898\u3002\u8BF7\u7528\u4E2D\u6587\u56DE\u590D\u3002'
    };
    const messages = [systemMsg, ...chatHistory];

    const result = await aiService.chatStream(messages, { temperature: 0.7 }, (chunk) => {
      bubble.textContent += chunk;
      if (container) container.scrollTop = container.scrollHeight;
    });

    bubble.classList.remove('streaming');
    chatHistory.push({ role: 'assistant', content: result });
    incrementAIStats(Math.ceil((text.length + result.length) / 4));
  } catch (err) {
    bubble.classList.remove('streaming');
    const errMsg = err instanceof Error ? err.message : String(err);
    bubble.textContent = '';
    appendMessage('system', '\u8BF7\u6C42\u5931\u8D25: ' + errMsg);
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
    '<h3>AI \u52A9\u624B</h3>' +
    '<p>\u6211\u53EF\u4EE5\u5E2E\u4F60\u5206\u6790\u4EE3\u7801\u3001\u7FFB\u8BD1\u6587\u6863\u3001\u56DE\u7B54\u95EE\u9898\u3002</p>' +
    '<div class="ai-chat-suggestions">' +
    '<button class="ai-suggestion" data-msg="\u5E2E\u6211\u89E3\u91CA\u4E00\u4E0B\u8FD9\u6BB5\u4EE3\u7801">\u89E3\u91CA\u4EE3\u7801</button>' +
    '<button class="ai-suggestion" data-msg="\u5C06\u4EE5\u4E0B\u5185\u5BB9\u7FFB\u8BD1\u6210\u82F1\u6587">\u7FFB\u8BD1\u5185\u5BB9</button>' +
    '<button class="ai-suggestion" data-msg="\u603B\u7ED3\u4E00\u4E0B\u8FD9\u6BB5\u5185\u5BB9\u7684\u8981\u70B9">\u5185\u5BB9\u6458\u8981</button>' +
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

function initChatInput(): void {
  const input = document.getElementById('ai-chat-input') as HTMLTextAreaElement | null;
  const sendBtn = document.getElementById('btn-ai-send');
  const clearBtn = document.getElementById('btn-ai-clear');

  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input.value);
      }
    });

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });
  }

  sendBtn?.addEventListener('click', () => {
    if (input) sendMessage(input.value);
  });

  clearBtn?.addEventListener('click', clearChat);
}

// Sidebar toggle

function initSidebarToggle(): void {
  const toggleBtn = document.getElementById('btn-toggle-ai-sidebar');
  const sidebar = document.getElementById('ai-sidebar');
  if (!toggleBtn || !sidebar) return;

  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    const icon = toggleBtn.querySelector('svg');
    if (icon) {
      icon.style.transform = sidebar.classList.contains('collapsed') ? 'rotate(180deg)' : '';
    }
  });
}

// AI Config

function loadAIConfig(): void {
  const apiKey = aiService.getApiKey();
  const baseUrl = aiService.getBaseUrl();
  const model = aiService.getModel();

  setInputValue('ai-api-key', apiKey);
  setInputValue('ai-base-url', baseUrl);

  const modelSelect = document.getElementById('ai-model-select') as HTMLSelectElement | null;
  if (modelSelect) {
    const option = Array.from(modelSelect.options).find(o => o.value === model);
    if (option) {
      modelSelect.value = model;
    } else {
      modelSelect.value = 'custom';
      const customInput = document.getElementById('ai-model-custom') as HTMLInputElement | null;
      if (customInput) {
        customInput.style.display = 'block';
        customInput.value = model;
      }
    }
  }

  updateAIStatus();
}

function saveAIConfig(): void {
  const apiKey = getInputValue('ai-api-key');
  const baseUrl = getInputValue('ai-base-url');
  const modelSelect = document.getElementById('ai-model-select') as HTMLSelectElement | null;
  let model = modelSelect?.value || 'gpt-3.5-turbo';

  if (model === 'custom') {
    model = getInputValue('ai-model-custom') || 'gpt-3.5-turbo';
  }

  aiService.saveConfig({ apiKey, baseUrl, model });
  updateAIStatus();
  showMsg('\u914D\u7F6E\u5DF2\u4FDD\u5B58', 'success');
}

async function testAIConnection(): Promise<void> {
  if (!aiService.isConfigured()) {
    showMsg('\u8BF7\u5148\u586B\u5199 API Key', 'error');
    return;
  }

  const btn = document.getElementById('btn-test-ai') as HTMLButtonElement | null;
  if (btn) { btn.disabled = true; btn.textContent = '\u6D4B\u8BD5\u4E2D...'; }

  try {
    const result = await aiService.chat(
      [{ role: 'user', content: 'Say "connection ok" in 3 words or less.' }],
      { max_tokens: 20 }
    );
    showMsg('\u8FDE\u63A5\u6210\u529F: ' + result.slice(0, 50), 'success');
  } catch (err) {
    showMsg('\u8FDE\u63A5\u5931\u8D25: ' + (err instanceof Error ? err.message : String(err)), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '\u6D4B\u8BD5\u8FDE\u63A5'; }
  }
}

function toggleApiKeyVisibility(): void {
  const input = document.getElementById('ai-api-key') as HTMLInputElement | null;
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function fetchModels(): Promise<void> {
  if (!aiService.isConfigured()) {
    showMsg('\u8BF7\u5148\u586B\u5199 API Key \u548C Base URL', 'error');
    return;
  }

  const btn = document.getElementById('btn-fetch-models') as HTMLButtonElement | null;
  if (btn) { btn.disabled = true; }

  try {
    const models = await aiService.fetchModels();
    const select = document.getElementById('ai-model-select') as HTMLSelectElement | null;
    if (select && models.length > 0) {
      // Keep first option (default) and custom, add fetched models
      const existing = new Set(Array.from(select.options).map(o => o.value));
      for (const model of models) {
        if (!existing.has(model) && model !== 'custom') {
          const opt = document.createElement('option');
          opt.value = model;
          opt.textContent = model;
          select.insertBefore(opt, select.querySelector('option[value="custom"]'));
        }
      }
      showMsg('\u83B7\u53D6\u5230 ' + models.length + ' \u4E2A\u6A21\u578B', 'success');
    }
  } catch (err) {
    showMsg('\u83B7\u53D6\u6A21\u578B\u5931\u8D25: ' + (err instanceof Error ? err.message : String(err)), 'error');
  } finally {
    if (btn) { btn.disabled = false; }
  }
}

// AI Tool Actions

async function handleAIAction(action: string): Promise<void> {
  if (!aiService.isConfigured()) {
    showMsg('\u8BF7\u5148\u914D\u7F6E AI', 'error');
    return;
  }

  const em = (window as any).__editorManager;
  const activePath = em?.activeEditor;
  if (!activePath) {
    showMsg('\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A\u6587\u4EF6', 'error');
    return;
  }

  const editorData = em?.getEditorByPath(activePath);
  if (!editorData) return;

  const content = editorData.model.getValue();
  if (!content.trim()) {
    showMsg('\u6587\u4EF6\u5185\u5BB9\u4E3A\u7A7A', 'error');
    return;
  }

  const labels = ACTION_LABELS[action];
  const toolbarBtn = document.getElementById('btn-ai-' + action) as HTMLButtonElement | null;
  const originalHTML = toolbarBtn?.innerHTML || '';

  if (toolbarBtn) {
    toolbarBtn.disabled = true;
    toolbarBtn.innerHTML = labels.loading;
    toolbarBtn.classList.add('loading');
  }

  try {
    let result: string;
    switch (action) {
      case 'format':
        result = await aiService.formatMarkdown(content);
        break;
      case 'explain':
        result = await aiService.explainCode(content);
        break;
      case 'summarize':
        result = await aiService.summarize(content);
        break;
      case 'translate':
        result = await aiService.translate(content);
        break;
      default:
        return;
    }

    showAIModal(labels.success, result, action === 'format' ? () => {
      editorData.model.setValue(result);
    } : undefined);

    incrementAIStats(Math.ceil((content.length + result.length) / 4));

    if (toolbarBtn) {
      toolbarBtn.innerHTML = labels.success;
      toolbarBtn.classList.remove('loading');
      toolbarBtn.classList.add('success');
    }
    setTimeout(() => {
      if (toolbarBtn) {
        toolbarBtn.disabled = false;
        toolbarBtn.innerHTML = originalHTML;
        toolbarBtn.classList.remove('success');
      }
    }, 2000);
  } catch (err) {
    showMsg('AI \u64CD\u4F5C\u5931\u8D25: ' + (err instanceof Error ? err.message : String(err)), 'error');
    if (toolbarBtn) {
      toolbarBtn.disabled = false;
      toolbarBtn.innerHTML = originalHTML;
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
    (onApply ? '<div class="ai-modal-actions"><button class="ai-save" id="ai-modal-apply"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> \u5E94\u7528\u5230\u6587\u4EF6</button></div>' : '') +
    '</div>';
  document.body.appendChild(modal);
  document.getElementById('ai-modal-close')?.addEventListener('click', () => modal.remove());
  if (onApply) {
    document.getElementById('ai-modal-apply')?.addEventListener('click', () => {
      onApply();
      modal.remove();
      appendMessage('system', '\u5DF2\u5C06\u7ED3\u679C\u5E94\u7528\u5230\u5F53\u524D\u6587\u4EF6');
    });
  }
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

// Status & Stats

function updateAIStatus(): void {
  const isConfigured = aiService.isConfigured();
  const chip = document.getElementById('ai-status-chip');
  const dot = chip?.querySelector('.ai-dot');
  const text = chip?.querySelector('.ai-status-text');
  if (text) text.textContent = isConfigured ? '\u5DF2\u8FDE\u63A5' : '\u672A\u914D\u7F6E';
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

// Init

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
  console.log('[AI] \u9875\u9762\u521D\u59CB\u5316\u5B8C\u6210');
}

registerPageInit('ai', initAIPage);