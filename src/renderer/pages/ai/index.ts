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
let aiPageBound = false;
let activeToolAction: string | null = null;
let toolResetTimer: number | null = null;

// Tool action labels
const ACTION_LABELS: Record<string, { loading: string; success: string }> = {
  format:    { loading: '格式化中...', success: '✅ 格式化完成' },
  explain:   { loading: '解释中...',   success: '✅ 解释完成' },
  summarize: { loading: '总结中...',   success: '✅ 总结完成' },
  translate: { loading: '翻译中...',   success: '✅ 翻译完成' },
};

function persistStats(): void {
  localStorage.setItem('ai-stats', JSON.stringify(aiStats));
}

// Chat UI
function appendMessage(role: 'user' | 'assistant' | 'system', content: string): HTMLElement {
  const container = document.getElementById('ai-chat-messages');
  if (!container) return document.createElement('div');

  const welcome = container.querySelector('.ai-chat-welcome');
  if (welcome) welcome.remove();

  const bubble = document.createElement('div');
  bubble.className = 'ai-msg-bubble ai-msg-' + role;
  bubble.textContent = content;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
  return bubble;
}

async function sendMessage(text: string): Promise<void> {
  if (!text.trim() || isGenerating) return;
  await aiService.reloadConfig().catch(() => undefined);
  if (!aiService.isConfigured()) {
    appendMessage('system', '请先在右侧或设置页配置 AI 模型，并点击“保存配置”。');
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
      content: '你是一个专业的编程助手，帮助用户分析代码、翻译文档、回答技术问题。请用中文回复。'
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
}

function initChatInput(): void {
  const input = document.getElementById('ai-chat-input') as HTMLTextAreaElement | null;
  const sendBtn = document.getElementById('btn-ai-send');
  const clearBtn = document.getElementById('btn-ai-clear');
  const messages = document.getElementById('ai-chat-messages');

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input.value);
    }
  });

  input?.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });

  sendBtn?.addEventListener('click', () => {
    if (input) void sendMessage(input.value);
  });

  clearBtn?.addEventListener('click', clearChat);

  messages?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const suggestion = target?.closest('.ai-suggestion') as HTMLElement | null;
    const msg = suggestion?.dataset.msg;
    if (msg) void sendMessage(msg);
  });
}

// Sidebar toggle
function initSidebarToggle(): void {
  const toggleBtn = document.getElementById('btn-ai-toggle-panel');
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
async function loadAIConfig(): Promise<void> {
  // Always read from the main-process settings store. Do not trust cached UI state,
  // otherwise changes from Settings page can leave this panel showing an old model.
  const settings = await aiService.getSettings();
  const activeProvider = aiService.getActiveProvider();
  const apiKey = aiService.getApiKey();
  const baseUrl = aiService.getBaseUrl();
  const model = aiService.getModel();

  setInputValue('ai-api-key', apiKey);
  setInputValue('ai-base-url', baseUrl);

  const modelSelect = document.getElementById('ai-model-select') as HTMLSelectElement | null;
  if (modelSelect) {
    renderModelOptions(modelSelect, model, settings.providers.map(provider => ({
      name: provider.name,
      model: provider.defaultModel,
    })));
  }

  const configTitle = document.getElementById('ai-config-toggle');
  if (configTitle && activeProvider) {
    configTitle.setAttribute('title', `当前默认供应商：${activeProvider.name} · ${activeProvider.defaultModel}`);
  }
  renderCurrentProviderInfo(activeProvider);

  await updateAIStatus();
}

async function saveAIConfig(): Promise<void> {
  const apiKey = getInputValue('ai-api-key');
  const baseUrl = getInputValue('ai-base-url');
  const modelSelect = document.getElementById('ai-model-select') as HTMLSelectElement | null;
  const selectedModel = modelSelect?.value?.trim() || '';
  const model = selectedModel && selectedModel !== 'custom' ? selectedModel : aiService.getModel();

  if (!baseUrl.trim()) {
    showMsg('请填写 Base URL', 'error');
    return;
  }
  if (!model.trim()) {
    showMsg('请先到设置页填写默认模型，或点击“获取”选择模型', 'error');
    return;
  }

  await aiService.saveConfig({ apiKey, baseUrl, model });
  await loadAIConfig();
  showMsg('配置已保存', 'success');
}

async function testAIConnection(): Promise<void> {
  await aiService.reloadConfig({ silent: true });
  if (!aiService.isConfigured()) {
    showMsg('请先填写 API Key', 'error');
    return;
  }

  const btn = document.getElementById('btn-test-ai') as HTMLButtonElement | null;
  const original = btn?.textContent || '测试连接';
  if (btn) { btn.disabled = true; btn.textContent = '测试中...'; }

  try {
    const result = await aiService.testConnection();
    showMsg('连接成功: ' + result.slice(0, 50), 'success');
  } catch (err) {
    showMsg('连接失败: ' + (err instanceof Error ? err.message : String(err)), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

function toggleApiKeyVisibility(): void {
  const input = document.getElementById('ai-api-key') as HTMLInputElement | null;
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function fetchModels(): Promise<void> {
  await aiService.reloadConfig({ silent: true });
  if (!aiService.isConfigured()) {
    showMsg('请先填写 API Key 和 Base URL', 'error');
    return;
  }

  const btn = document.getElementById('btn-fetch-models') as HTMLButtonElement | null;
  const original = btn?.textContent || '获取模型';
  if (btn) { btn.disabled = true; btn.textContent = '获取中...'; }

  try {
    const models = await aiService.fetchModels();
    const select = document.getElementById('ai-model-select') as HTMLSelectElement | null;
    if (select && models.length > 0) {
      const currentModel = aiService.getModel();
      const existing = new Set(Array.from(select.options).map(o => o.value));
      for (const model of models) {
        if (!existing.has(model) && model !== 'custom') {
          const opt = document.createElement('option');
          opt.value = model;
          opt.textContent = model;
          const customOption = select.querySelector('option[value="custom"]');
          if (customOption) select.insertBefore(opt, customOption);
          else select.appendChild(opt);
        }
      }
      ensureModelOption(select, currentModel);
      select.value = currentModel;
      showMsg('获取到 ' + models.length + ' 个模型', 'success');
      await loadAIConfig();
    }
  } catch (err) {
    showMsg('获取模型失败: ' + (err instanceof Error ? err.message : String(err)), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

// AI Tool Actions
async function handleAIAction(action: string): Promise<void> {
  await aiService.reloadConfig().catch(() => undefined);
  if (activeToolAction) {
    showMsg('AI 正在处理“' + ACTION_LABELS[activeToolAction].loading.replace('中...', '') + '”，请稍后', 'info');
    return;
  }
  if (!aiService.isConfigured()) {
    showMsg('请先在设置页配置 AI，并点击“保存配置”', 'error');
    return;
  }

  const em = (window as any).__editorManager;
  const activePath = em?.activeEditor;
  if (!activePath) {
    showMsg('请先打开一个文件', 'error');
    return;
  }

  const editorData = em?.getEditorByPath(activePath);
  if (!editorData) return;

  const content = editorData.model.getValue();
  if (!content.trim()) {
    showMsg('文件内容为空', 'error');
    return;
  }

  const labels = ACTION_LABELS[action];
  const toolbarBtn = document.getElementById('btn-ai-' + action) as HTMLButtonElement | null;
  const originalHTML = toolbarBtn?.dataset.originalHtml || toolbarBtn?.innerHTML || '';
  if (toolbarBtn && !toolbarBtn.dataset.originalHtml) toolbarBtn.dataset.originalHtml = originalHTML;

  activeToolAction = action;
  setToolButtonsDisabled(true, toolbarBtn);
  if (toolbarBtn) {
    toolbarBtn.innerHTML = labels.loading;
    toolbarBtn.classList.add('loading');
    toolbarBtn.classList.remove('success');
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
  } catch (err) {
    showMsg('AI 操作失败: ' + (err instanceof Error ? err.message : String(err)), 'error');
  } finally {
    activeToolAction = null;
    scheduleToolButtonReset(toolbarBtn, originalHTML);
  }
}

function setToolButtonsDisabled(disabled: boolean, activeButton?: HTMLButtonElement | null): void {
  document.querySelectorAll('.ai-tool-card').forEach((btn) => {
    const button = btn as HTMLButtonElement;
    button.disabled = disabled && button !== activeButton ? true : disabled;
  });
}

function scheduleToolButtonReset(activeButton: HTMLButtonElement | null, originalHTML: string): void {
  if (toolResetTimer) {
    window.clearTimeout(toolResetTimer);
    toolResetTimer = null;
  }

  toolResetTimer = window.setTimeout(() => {
    document.querySelectorAll('.ai-tool-card').forEach((btn) => {
      const button = btn as HTMLButtonElement;
      const original = button.dataset.originalHtml;
      button.disabled = false;
      button.classList.remove('loading', 'success');
      if (original) button.innerHTML = original;
    });
    if (activeButton && !activeButton.dataset.originalHtml) {
      activeButton.innerHTML = originalHTML;
    }
    void updateAIStatus();
  }, 700);
}

function escHTML(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showAIModal(title: string, content: string, onApply?: () => void): void {
  let modal = document.querySelector('.ai-modal') as HTMLElement | null;
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'ai-modal';
    modal.innerHTML =
      '<div class="ai-modal-content">' +
      '<div class="ai-modal-header"><h3 id="ai-modal-title"></h3>' +
      '<button class="ai-modal-close" id="ai-modal-close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>' +
      '<div class="ai-result" id="ai-modal-result"></div>' +
      '<div class="ai-modal-actions" id="ai-modal-actions"></div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal?.remove(); });
    modal.querySelector('#ai-modal-close')?.addEventListener('click', () => modal?.remove());
  }

  const titleEl = modal.querySelector('#ai-modal-title');
  const resultEl = modal.querySelector('#ai-modal-result');
  const actionsEl = modal.querySelector('#ai-modal-actions') as HTMLElement | null;
  if (titleEl) titleEl.textContent = title;
  if (resultEl) resultEl.innerHTML = escHTML(content);
  if (actionsEl) {
    actionsEl.innerHTML = onApply
      ? '<button class="ai-save" id="ai-modal-apply"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> 应用到文件</button>'
      : '';
    actionsEl.style.display = onApply ? 'flex' : 'none';
    const applyBtn = actionsEl.querySelector('#ai-modal-apply');
    applyBtn?.addEventListener('click', () => {
      onApply?.();
      modal?.remove();
      appendMessage('system', '已将结果应用到当前文件');
    }, { once: true });
  }
}

// Status & Stats
async function updateAIStatus(): Promise<void> {
  await aiService.ready();
  const isConfigured = aiService.isConfigured();
  const chip = document.getElementById('ai-status-chip');
  const dot = chip?.querySelector('.ai-dot');
  const text = chip?.querySelector('.ai-status-text');
  const activeProvider = aiService.getActiveProvider();
  if (text) text.textContent = isConfigured && activeProvider ? `${activeProvider.name} · ${aiService.getModel()}` : '未配置';
  dot?.classList.toggle('active', isConfigured);
  const modelDisplay = document.getElementById('ai-model-display');
  if (modelDisplay) modelDisplay.textContent = isConfigured ? aiService.getModel() : '-';
  document.querySelectorAll('.ai-tool-card').forEach(btn => (btn as HTMLButtonElement).disabled = !isConfigured || !!activeToolAction);
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
    window.setTimeout(() => { msgEl.className = 'ai-msg'; }, 3000);
  }
}



function renderCurrentProviderInfo(provider: ReturnType<typeof aiService.getActiveProvider>): void {
  const body = document.getElementById('ai-config-body');
  if (!body) return;
  let info = document.getElementById('ai-current-provider');
  if (!info) {
    info = document.createElement('div');
    info.id = 'ai-current-provider';
    info.className = 'ai-current-provider';
    body.insertBefore(info, body.firstChild);
  }

  if (!provider) {
    info.textContent = '当前未配置默认模型';
    return;
  }

  info.textContent = `当前默认：${provider.name} / ${provider.defaultModel}`;
}

function renderModelOptions(
  select: HTMLSelectElement,
  activeModel: string,
  providerModels: Array<{ name?: string; model?: string }> = []
): void {
  const previousOptions = Array.from(select.options)
    .map(option => ({ value: option.value, text: option.textContent || option.value }))
    .filter(option => option.value && option.value !== 'custom');

  const models = new Map<string, string>();

  const addModel = (model?: string, labelPrefix?: string) => {
    const value = (model || '').trim();
    if (!value) return;
    models.set(value, labelPrefix ? `${value}（${labelPrefix}）` : value);
  };

  addModel(activeModel, '当前默认');
  providerModels.forEach(provider => addModel(provider.model, provider.name));
  previousOptions.forEach(option => {
    if (!models.has(option.value)) models.set(option.value, option.text);
  });

  select.innerHTML = '';
  if (models.size === 0) {
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '-- 请先在设置页配置默认模型 --';
    select.appendChild(empty);
  } else {
    for (const [value, label] of models) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    }
  }

  const custom = document.createElement('option');
  custom.value = 'custom';
  custom.textContent = '自定义 / 手动输入请到设置页修改';
  select.appendChild(custom);

  if (activeModel) {
    ensureModelOption(select, activeModel);
    select.value = activeModel;
  } else {
    select.value = select.options[0]?.value || '';
  }
}

function ensureModelOption(select: HTMLSelectElement, model: string): void {
  if (!model) return;
  const exists = Array.from(select.options).some(option => option.value === model);
  if (exists) return;
  const option = document.createElement('option');
  option.value = model;
  option.textContent = model;
  const first = select.options[0];
  if (first && !first.value) {
    select.insertBefore(option, first.nextSibling);
  } else {
    select.appendChild(option);
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
function bindAIPageEventsOnce(): void {
  if (aiPageBound) return;
  aiPageBound = true;

  document.getElementById('btn-save-ai')?.addEventListener('click', () => { void saveAIConfig(); });
  document.getElementById('btn-test-ai')?.addEventListener('click', () => { void testAIConnection(); });
  document.getElementById('btn-toggle-key')?.addEventListener('click', toggleApiKeyVisibility);
  document.getElementById('btn-fetch-models')?.addEventListener('click', () => { void fetchModels(); });
  document.getElementById('btn-ai-format')?.addEventListener('click', () => { void handleAIAction('format'); });
  document.getElementById('btn-ai-explain')?.addEventListener('click', () => { void handleAIAction('explain'); });
  document.getElementById('btn-ai-summarize')?.addEventListener('click', () => { void handleAIAction('summarize'); });
  document.getElementById('btn-ai-translate')?.addEventListener('click', () => { void handleAIAction('translate'); });

  const modelSelect = document.getElementById('ai-model-select') as HTMLSelectElement | null;
  modelSelect?.addEventListener('change', (e) => {
    const target = e.target as HTMLSelectElement;
    const nextModel = target.value?.trim();
    if (nextModel && nextModel !== 'custom') {
      void aiService.saveConfig({ model: nextModel }).then(() => loadAIConfig());
    } else {
      void loadAIConfig();
    }
  });

  const refreshConfig = () => { void loadAIConfig(); };
  window.addEventListener('nova:ai-settings-updated', refreshConfig);
  window.addEventListener('nova:ai-settings-changed', refreshConfig);
  window.addEventListener('focus', refreshConfig);

  initChatInput();
  initSidebarToggle();
}

function initAIPage(): void {
  bindAIPageEventsOnce();
  void loadAIConfig();
  updateStatsDisplay();
  console.log('[AI] 页面初始化完成');
}

registerPageInit('ai', initAIPage);
