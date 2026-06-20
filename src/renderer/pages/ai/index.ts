/**
 * AI Page - AI assistant with conversational chat + quick tools
 * Now with streaming responses for typewriter effect.
 * Features: Markdown rendering, code highlighting, chat history persistence.
 */
import { aiService, type ChatMessage } from './ai-service';
import type { AIImageAttachment, AIMessageContent, AIModelCapabilities, AIProviderConfig } from '../../../shared/types/ai';
import { AI_CAPABILITY_LABELS, normalizeAIModelCapabilities, providerSupportsCapability, stripReasoningBlocks } from '../../../shared/utils/ai-capabilities';
import { registerPageInit } from '../../app/router';
import { aiStats } from '../../app/index';
import { renderMarkdown } from '../../utils/markdown-renderer';
import { renderMermaidBlocks } from '../files/markdown-preview';
import type { Conversation, ChatHistoryMessage } from '../../../shared/types/chat-history';
import { getCurrentWorkspaceRoot } from '../../services/workspace-context';

window.aiService = aiService;

// Chat state
const chatHistory: ChatMessage[] = [];
let isGenerating = false;
let aiPageBound = false;
let pendingImages: AIImageAttachment[] = [];
let pendingFiles: Array<{ path: string; name: string }> = [];

// Chat history / conversation state
let currentConversationId: string | null = null;
let currentConversationTitle: string = '';
let currentConversationCreatedAt: string = '';
let conversationMessages: ChatHistoryMessage[] = [];
let historyPanelOpen = false;
let historyLoaded = false;
let loadedWorkspaceRoot: string | null = null;


function persistStats(): void {
  localStorage.setItem('ai-stats', JSON.stringify(aiStats));
}

// Chat UI
function appendMessage(
  role: 'user' | 'assistant' | 'system',
  content: string,
  images: AIImageAttachment[] = []
): HTMLElement {
  const container = document.getElementById('ai-chat-messages');
  if (!container) return document.createElement('div');

  const welcome = container.querySelector('.ai-chat-welcome');
  if (welcome) welcome.remove();

  const bubble = document.createElement('div');
  bubble.className = 'ai-msg-bubble ai-msg-' + role;

  if (role === 'assistant') {
    renderAssistantBubble(bubble, content);
  } else if (role === 'user') {
    renderUserBubble(bubble, content, images);
  } else {
    bubble.textContent = content;
  }

  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
  return bubble;
}

async function sendMessage(text: string): Promise<void> {
  const inputText = text.trim();
  if (isGenerating) return;

  const hasImageInput = pendingImages.length > 0 || extractLocalImagePaths(inputText).length > 0;

  await aiService.reloadConfig().catch(() => undefined);
  if (!aiService.isConfigured()) {
    appendMessage('system', '请先在右侧或设置页配置 AI 模型，并点击“保存配置”。配置完成后回到这里会自动刷新。');
    return;
  }

  const activeProvider = aiService.getActiveProvider();
  const visionSupported = supportsImageInput(activeProvider);
  if (hasImageInput && !visionSupported) {
    const label = activeProvider ? `${activeProvider.name} / ${activeProvider.defaultModel}` : aiService.getModel();
    appendMessage('system', '当前模型「' + label + '」不支持图片输入，我不能直接识别这张图片。请切换到支持视觉/多模态的模型，或者移除图片后只发送文字内容。');
    showMsg('当前模型不支持图片输入，请切换多模态模型或移除图片', 'warn');
    return;
  }

  const images = [...pendingImages];
  await attachImagesFromLocalPaths(inputText, images);
  if (!inputText && images.length === 0) return;

  const input = document.getElementById('ai-chat-input') as HTMLTextAreaElement;
  if (input) {
    input.value = '';
    input.style.height = 'auto';
  }
  pendingImages = [];
  renderPendingImages();

  // 读取待引用文件，拼入文件内容作为 AI 上下文
  let fileContext = '';
  const fileNames: string[] = [];
  for (const file of pendingFiles) {
    try {
      const content = await window.electronAPI.fs.readFile(file.path);
      fileContext += '--- FILE: ' + file.name + ' ---\n' + content + '\n--- END FILE ---\n\n';
      fileNames.push(file.name);
    } catch (error) {
      appendMessage('system', '无法读取文件：' + file.name + ' - ' + (error instanceof Error ? error.message : String(error)));
    }
  }
  pendingFiles = [];
  renderPendingFiles();

  const combinedText = fileContext + (inputText || (images.length > 0 ? '（已发送图片）' : '（已引用文件）'));
  const displayText = fileNames.length > 0
    ? '📎 ' + fileNames.join(', ') + (inputText ? '\n\n' + inputText : '')
    : (inputText || (images.length > 0 ? '（已发送图片）' : '（已引用文件）'));

  appendMessage('user', displayText, images);
  const userContent = buildUserMessageContent(combinedText, images);
  chatHistory.push({ role: 'user', content: userContent });

  isGenerating = true;
  updateSendButton();

  const container = document.getElementById('ai-chat-messages');
  const bubble = appendMessage('assistant', '');
  bubble.classList.add('streaming');

  try {
    const systemMsg: ChatMessage = {
      role: 'system',
      content: '你是一个专业的编程助手，帮助用户分析代码、翻译文档、回答技术问题。请用中文回复。用户提供图片时，请结合图片内容作答。'
    };
    const messages = visionSupported
      ? [systemMsg, ...chatHistory]
      : [systemMsg, ...chatHistory].map(toTextOnlyMessage);

    let streamed = '';
    const result = await aiService.chatStream(messages, { temperature: 0.7, timeout: 60000 }, (chunk) => {
      streamed += chunk;
      renderAssistantBubble(bubble, streamed);
      if (container) container.scrollTop = container.scrollHeight;
    });

    bubble.classList.remove('streaming');
    renderAssistantBubble(bubble, result);
    chatHistory.push({ role: 'assistant', content: stripReasoningBlocks(result) });
    incrementAIStats(Math.ceil((estimateMessageLength(userContent) + result.length) / 4));

    // Save to conversation history
    conversationMessages.push(
      { role: 'user', content: displayText, timestamp: new Date().toISOString() },
      { role: 'assistant', content: stripReasoningBlocks(result), timestamp: new Date().toISOString() }
    );
    if (!currentConversationTitle) {
      currentConversationTitle = inputText.slice(0, 40) || 'New Conversation';
    }
    void saveCurrentConversation();
  } catch (err) {
    bubble.classList.remove('streaming');
    bubble.textContent = '';
    const errMsg = err instanceof Error ? err.message : String(err);
    appendMessage('system', '请求失败：' + formatFriendlyAiError(errMsg));
  } finally {
    isGenerating = false;
    updateSendButton();
  }
}

function buildUserMessageContent(text: string, images: AIImageAttachment[]): AIMessageContent {
  if (images.length === 0) return text;
  return [
    { type: 'text', text: text || '请分析这张图片。' },
    ...images.map((image) => ({ type: 'image_url' as const, image_url: { url: image.dataUrl } })),
  ];
}

function supportsImageInput(provider: AIProviderConfig | null): boolean {
  return providerSupportsCapability(provider, 'vision');
}

function toTextOnlyMessage(message: ChatMessage): ChatMessage {
  const content = message.content;
  if (typeof content === 'string') return message;
  if (!Array.isArray(content)) return { ...message, content: '' };

  const textParts: string[] = [];
  let omittedImages = 0;
  for (const part of content) {
    if (part.type === 'text' && part.text.trim()) textParts.push(part.text.trim());
    if (part.type === 'image_url') omittedImages += 1;
  }
  if (omittedImages > 0) {
    textParts.push(`（已省略 ${omittedImages} 张历史图片：当前模型不支持图片输入。）`);
  }
  return { ...message, content: textParts.join('\n') };
}

function estimateMessageLength(content: AIMessageContent): number {
  if (typeof content === 'string') return content.length;
  return content.reduce((sum, part) => sum + (part.type === 'text' ? part.text.length : 1200), 0);
}

function renderUserBubble(bubble: HTMLElement, text: string, images: AIImageAttachment[]): void {
  const imageHtml = images.length
    ? '<div class="ai-msg-images">' + images.map((image) =>
        '<figure class="ai-msg-image"><img src="' + escAttr(image.dataUrl) + '" alt="' + escAttr(image.name) + '"><figcaption>' + escHTML(image.name) + '</figcaption></figure>'
      ).join('') + '</div>'
    : '';
  bubble.innerHTML = (text ? '<div class="ai-msg-text">' + textToHtml(text) + '</div>' : '') + imageHtml;
}

function renderAssistantBubble(bubble: HTMLElement, content: string): void {
  bubble.innerHTML = renderReasoningAwareText(content);
  bindCodeCopyButtons(bubble);
  // Render Mermaid diagrams asynchronously (if any mermaid code blocks exist)
  void renderMermaidBlocks(bubble);
}

function renderReasoningAwareText(content: string): string {
  const source = content || '';
  const blocks: string[] = [];
  let cursor = 0;
  const regex = /<think>([\s\S]*?)(?:<\/think>|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source))) {
    if (match.index > cursor) {
      blocks.push('<div class="md-content">' + renderMarkdown(source.slice(cursor, match.index)) + '</div>');
    }
    const thinking = match[1] || '';
    if (thinking.trim()) {
      blocks.push('<details class="ai-think"><summary>思考过程（默认隐藏）</summary><pre>' + escHTML(thinking.trim()) + '</pre></details>');
    }
    cursor = regex.lastIndex;
  }

  if (cursor < source.length) {
    blocks.push('<div class="md-content">' + renderMarkdown(source.slice(cursor)) + '</div>');
  }

  return blocks.join('') || '<span class="ai-stream-placeholder">正在生成...</span>';
}

function bindCodeCopyButtons(container: HTMLElement): void {
  container.querySelectorAll('.md-code-copy').forEach(btn => {
    if ((btn as HTMLElement).dataset.bound) return;
    (btn as HTMLElement).dataset.bound = '1';
    btn.addEventListener('click', () => {
      const code = (btn as HTMLElement).dataset.code || '';
      if (code) {
        navigator.clipboard.writeText(code).then(() => {
          btn.classList.add('copied');
          setTimeout(() => btn.classList.remove('copied'), 1500);
        }).catch(() => { /* ignore */ });
      }
    });
  });
}

function textToHtml(text: string): string {
  return escHTML(text).replace(/\n/g, '<br>');
}



async function attachImagesFromLocalPaths(text: string, images: AIImageAttachment[]): Promise<void> {
  if (!text) return;
  const existing = new Set(images.map(image => image.path || image.name));
  const paths = extractLocalImagePaths(text);
  for (const filePath of paths) {
    if (existing.has(filePath)) continue;
    try {
      const image = await window.electronAPI.fs.readImageAsDataUrl(filePath);
      images.push(image);
      existing.add(filePath);
    } catch (error) {
      appendMessage('system', '无法读取本地图片：' + (error instanceof Error ? error.message : String(error)));
    }
  }
}

function extractLocalImagePaths(text: string): string[] {
  const result = new Set<string>();
  const windows = /[a-zA-Z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]+\.(?:png|jpe?g|webp|gif|bmp)/gi;
  const unix = /(?:~|\/)(?:[^\0\r\n"'<>|]+\/)*[^\0\r\n"'<>|]+\.(?:png|jpe?g|webp|gif|bmp)/gi;
  for (const match of text.matchAll(windows)) result.add(match[0]);
  for (const match of text.matchAll(unix)) result.add(match[0]);
  return Array.from(result);
}

async function addImageFiles(files: FileList | File[]): Promise<void> {
  const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name));
  if (imageFiles.length > 0 && !(await ensureImageInputAvailable())) return;
  if (imageFiles.length === 0) return;

  const remainingSlots = Math.max(0, 6 - pendingImages.length);
  for (const file of imageFiles.slice(0, remainingSlots)) {
    try {
      pendingImages.push(await readBrowserImageFile(file));
    } catch (error) {
      showMsg('图片读取失败：' + (error instanceof Error ? error.message : String(error)), 'error');
    }
  }

  if (imageFiles.length > remainingSlots) showMsg('一次最多附加 6 张图片', 'warn');
  renderPendingImages();
}

function readBrowserImageFile(file: File): Promise<AIImageAttachment> {
  return new Promise((resolve, reject) => {
    const maxBytes = 20 * 1024 * 1024;
    if (file.size > maxBytes) {
      reject(new Error('图片超过 20MB'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('无法读取图片文件'));
    reader.onload = () => resolve({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name || 'clipboard-image.png',
      mimeType: file.type || 'image/png',
      dataUrl: String(reader.result || ''),
      size: file.size,
    });
    reader.readAsDataURL(file);
  });
}

async function pickLocalImages(): Promise<void> {
  if (!(await ensureImageInputAvailable())) return;
  try {
    const result = await window.electronAPI.fs.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    });
    if (result.canceled) return;
    const remainingSlots = Math.max(0, 6 - pendingImages.length);
    for (const filePath of result.filePaths.slice(0, remainingSlots)) {
      pendingImages.push(await window.electronAPI.fs.readImageAsDataUrl(filePath));
    }
    if (result.filePaths.length > remainingSlots) showMsg('一次最多附加 6 张图片', 'warn');
    renderPendingImages();
  } catch (error) {
    showMsg('选择图片失败：' + formatFriendlyAiError(error), 'error');
  }
}

function renderPendingImages(): void {
  const tray = document.getElementById('ai-attachments');
  if (!tray) return;
  tray.innerHTML = pendingImages.map((image, index) =>
    '<div class="ai-attachment" data-index="' + index + '">' +
      '<img src="' + escAttr(image.dataUrl) + '" alt="' + escAttr(image.name) + '">' +
      '<span>' + escHTML(image.name) + '</span>' +
      '<button type="button" data-action="remove-ai-image" data-index="' + index + '" title="移除图片">×</button>' +
    '</div>'
  ).join('');
  tray.hidden = pendingImages.length === 0;
}

async function pickProjectFiles(): Promise<void> {
  try {
    const result = await window.electronAPI.fs.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Text/Code Files', extensions: ['ts','tsx','js','jsx','vue','svelte','py','java','go','rs','c','cpp','h','cs','php','rb','sh','md','markdown','txt','json','yaml','yml','xml','html','css','scss','less','sql','graphql','dockerfile','makefile','toml','ini','env'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled) return;
    const existing = new Set(pendingFiles.map(f => f.path));
    for (const filePath of result.filePaths) {
      if (existing.has(filePath)) continue;
      const name = filePath.split(/[\\/]/).pop() || filePath;
      pendingFiles.push({ path: filePath, name });
    }
    renderPendingFiles();
  } catch (error) {
    showMsg('选择文件失败：' + formatFriendlyAiError(error), 'error');
  }
}

function renderPendingFiles(): void {
  const tray = document.getElementById('ai-file-attachments');
  if (!tray) return;
  tray.innerHTML = pendingFiles.map((file, index) =>
    '<div class="ai-file-attachment">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
        '<polyline points="14 2 14 8 20 8"/>' +
      '</svg>' +
      '<span>' + escHTML(file.name) + '</span>' +
      '<button type="button" data-action="remove-ai-file" data-index="' + index + '" title="移除文件">×</button>' +
    '</div>'
  ).join('');
  tray.hidden = pendingFiles.length === 0;
}

function updateSendButton(): void {
  const btn = document.getElementById('btn-ai-send') as HTMLButtonElement;
  if (btn) btn.disabled = isGenerating;
}

function clearChat(): void {
  chatHistory.length = 0;
  conversationMessages = [];
  currentConversationId = null;
  currentConversationTitle = '';
  currentConversationCreatedAt = '';
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
  const attachBtn = document.getElementById('btn-ai-attach-image');
  const attachments = document.getElementById('ai-attachments');
  const inputWrap = document.querySelector('.ai-chat-input-wrap') as HTMLElement | null;
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

  attachBtn?.addEventListener('click', () => { void pickLocalImages(); });

  const fileAttachBtn = document.getElementById('btn-ai-attach-file');
  fileAttachBtn?.addEventListener('click', () => { void pickProjectFiles(); });

  attachments?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const removeBtn = target?.closest('[data-action="remove-ai-image"]') as HTMLElement | null;
    if (!removeBtn) return;
    const index = Number(removeBtn.dataset.index || -1);
    if (index >= 0) {
      pendingImages.splice(index, 1);
      renderPendingImages();
    }
  });

  const fileAttachments = document.getElementById('ai-file-attachments');
  fileAttachments?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const removeBtn = target?.closest('[data-action="remove-ai-file"]') as HTMLElement | null;
    if (!removeBtn) return;
    const index = Number(removeBtn.dataset.index || -1);
    if (index >= 0) {
      pendingFiles.splice(index, 1);
      renderPendingFiles();
    }
  });

  input?.addEventListener('paste', (event) => {
    const files = Array.from(event.clipboardData?.items || [])
      .filter(item => item.kind === 'file')
      .map(item => item.getAsFile())
      .filter(Boolean) as File[];
    if (files.length > 0) {
      event.preventDefault();
      void addImageFiles(files);
    }
  });

  inputWrap?.addEventListener('dragover', (event) => {
    event.preventDefault();
    inputWrap.classList.add('dragover');
  });
  inputWrap?.addEventListener('dragleave', () => inputWrap.classList.remove('dragover'));
  inputWrap?.addEventListener('drop', (event) => {
    event.preventDefault();
    inputWrap.classList.remove('dragover');
    if (event.dataTransfer?.files?.length) void addImageFiles(event.dataTransfer.files);
  });

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
  updateImageInputState(activeProvider);

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
    showMsg('连接失败：' + formatFriendlyAiError(err), 'error');
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
    showMsg('获取模型失败：' + formatFriendlyAiError(err), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

function escHTML(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escAttr(str: string): string {
  return escHTML(str).replace(/`/g, '&#96;');
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

function formatFriendlyAiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');
  if (/timeout|超时|AbortError/i.test(message)) return '请求超时了。模型或中转服务可能响应较慢，请稍后重试。';
  if (/401|unauthorized|api key|apikey|密钥|鉴权/i.test(message)) return 'API Key 可能不正确或没有权限，请重新保存配置。';
  if (/404|model|模型/i.test(message)) return '模型名称可能不存在，请检查默认模型。';
  if (/network|fetch failed|ENOTFOUND|ECONNREFUSED|Failed to fetch/i.test(message)) return '网络连接失败，请检查 Base URL 是否可访问。';
  if (/image_url|图片输入|image.*unsupported|unsupported.*image|multimodal|vision|expected.*text|unknown variant/i.test(message)) return '当前模型或接口不支持图片输入。请切换到支持视觉/多模态的模型，或移除图片后只发送文字。';
  if (/余额|quota|insufficient|credit/i.test(message)) return '账号额度可能不足，请检查服务商余额或套餐。';
  return message || '未知错误，请检查 AI 配置。';
}

function showMsg(text: string, type: string = 'info'): void {
  const msgEl = document.getElementById('ai-msg');
  if (msgEl) {
    msgEl.textContent = text;
    msgEl.className = 'ai-msg show ' + type;
    window.setTimeout(() => { msgEl.className = 'ai-msg'; }, 3000);
  }
}




async function ensureImageInputAvailable(): Promise<boolean> {
  await aiService.reloadConfig({ silent: true }).catch(() => undefined);
  const provider = aiService.getActiveProvider();
  if (supportsImageInput(provider)) return true;

  const label = provider ? `${provider.name} / ${provider.defaultModel}` : aiService.getModel();
  showMsg('当前模型不支持图片输入，请先在设置页开启“图片输入”能力或切换视觉模型', 'warn');
  appendMessage('system', '当前模型「' + label + '」的能力表未开启“图片输入”，我不能直接识别图片。请切换到支持视觉/多模态的模型，或在设置页确认后开启图片输入能力。');
  return false;
}

function updateImageInputState(provider: AIProviderConfig | null): void {
  const attachBtn = document.getElementById('btn-ai-attach-image') as HTMLButtonElement | null;
  const input = document.getElementById('ai-chat-input') as HTMLTextAreaElement | null;
  const supported = supportsImageInput(provider);
  if (attachBtn) {
    attachBtn.classList.toggle('is-disabled', !supported);
    attachBtn.setAttribute('aria-disabled', supported ? 'false' : 'true');
    attachBtn.title = supported ? '选择本地图片 / 支持粘贴拖拽图片' : '当前模型能力表未开启图片输入';
  }
  if (input) {
    input.placeholder = supported
      ? '输入消息，支持粘贴/拖拽图片或本地图片路径...'
      : '输入消息...（当前模型不支持图片输入）';
  }
}

function renderCapabilityBadges(capabilities: AIModelCapabilities): string {
  const keys = Object.keys(AI_CAPABILITY_LABELS) as Array<keyof AIModelCapabilities>;
  return keys.map(key => {
    const on = capabilities[key] === true;
    return '<span class="ai-capability-badge ' + (on ? 'on' : 'off') + '">' + escHTML(AI_CAPABILITY_LABELS[key]) + '</span>';
  }).join('');
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

  const capabilities = normalizeAIModelCapabilities(provider.capabilities, provider);
  info.innerHTML =
    '<div class="ai-current-provider-line">当前默认：' + escHTML(provider.name) + ' / ' + escHTML(provider.defaultModel) + '</div>' +
    '<div class="ai-capability-badges">' + renderCapabilityBadges(capabilities) + '</div>';
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

// ── Chat History / Conversation Management ─────────────────────────

async function saveCurrentConversation(): Promise<void> {
  if (conversationMessages.length === 0) return;
  const now = new Date().toISOString();
  const isNew = !currentConversationId;
  const conversation: Conversation = {
    id: currentConversationId || generateConversationId(),
    title: currentConversationTitle || 'New Conversation',
    messages: conversationMessages,
    createdAt: isNew ? now : currentConversationCreatedAt || now,
    updatedAt: now,
  };
  if (isNew) {
    currentConversationId = conversation.id;
    currentConversationCreatedAt = now;
  }
  try {
    const workspaceRoot = getCurrentWorkspaceRoot();
    await window.electronAPI.chatHistory.save(conversation, workspaceRoot);
  } catch (err) {
    console.warn('[ChatHistory] Failed to save conversation:', err);
  }
}

function generateConversationId(): string {
  return 'conv-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

async function loadConversationHistory(): Promise<void> {
  const currentWorkspace = getCurrentWorkspaceRoot();

  // Skip if already loaded for the same workspace
  if (historyLoaded && loadedWorkspaceRoot === currentWorkspace) return;

  // Workspace changed — clear current conversation
  if (historyLoaded && loadedWorkspaceRoot !== currentWorkspace) {
    chatHistory.length = 0;
    conversationMessages = [];
    currentConversationId = null;
    currentConversationTitle = '';
    currentConversationCreatedAt = '';
    const container = document.getElementById('ai-chat-messages');
    if (container) {
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
  }

  loadedWorkspaceRoot = currentWorkspace;
  historyLoaded = true;

  try {
    const list = await window.electronAPI.chatHistory.list(currentWorkspace);
    if (list.length === 0) return;

    // Load the most recent conversation
    const latest = list[0];
    const conversation = await window.electronAPI.chatHistory.get(latest.id, currentWorkspace);
    if (!conversation || conversation.messages.length === 0) return;

    currentConversationId = conversation.id;
    currentConversationTitle = conversation.title;
    currentConversationCreatedAt = conversation.createdAt;
    conversationMessages = conversation.messages;

    // Restore chat UI and API context
    chatHistory.length = 0;
    const container = document.getElementById('ai-chat-messages');
    if (!container) return;

    const welcome = container.querySelector('.ai-chat-welcome');
    if (welcome) welcome.remove();

    for (const msg of conversation.messages) {
      if (msg.role === 'system') continue;
      const content = typeof msg.content === 'string' ? msg.content : '(image message)';
      appendMessage(msg.role, content);
      // Rebuild API context
      if (msg.role === 'user' && typeof msg.content === 'string') {
        chatHistory.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant' && typeof msg.content === 'string') {
        chatHistory.push({ role: 'assistant', content: msg.content });
      }
    }
  } catch (err) {
    console.warn('[ChatHistory] Failed to load history:', err);
  }
}

async function loadConversation(conversationId: string): Promise<void> {
  try {
    const workspaceRoot = getCurrentWorkspaceRoot();
    const conversation = await window.electronAPI.chatHistory.get(conversationId, workspaceRoot);
    if (!conversation) return;

    // Clear current state
    chatHistory.length = 0;
    conversationMessages = conversation.messages;
    currentConversationId = conversation.id;
    currentConversationTitle = conversation.title;
    currentConversationCreatedAt = conversation.createdAt;

    const container = document.getElementById('ai-chat-messages');
    if (!container) return;

    container.innerHTML = '';

    for (const msg of conversation.messages) {
      if (msg.role === 'system') continue;
      const content = typeof msg.content === 'string' ? msg.content : '(image message)';
      appendMessage(msg.role, content);
      if (msg.role === 'user' && typeof msg.content === 'string') {
        chatHistory.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant' && typeof msg.content === 'string') {
        chatHistory.push({ role: 'assistant', content: msg.content });
      }
    }

    closeHistoryPanel();
  } catch (err) {
    console.warn('[ChatHistory] Failed to load conversation:', err);
    showMsg('加载对话失败：' + (err instanceof Error ? err.message : String(err)), 'error');
  }
}

async function deleteConversation(conversationId: string): Promise<void> {
  try {
    const workspaceRoot = getCurrentWorkspaceRoot();
    await window.electronAPI.chatHistory.delete(conversationId, workspaceRoot);
    // If deleting current conversation, start fresh
    if (conversationId === currentConversationId) {
      clearChat();
    }
    await refreshHistoryPanel();
  } catch (err) {
    console.warn('[ChatHistory] Failed to delete:', err);
  }
}

function toggleHistoryPanel(): void {
  historyPanelOpen = !historyPanelOpen;
  const panel = document.getElementById('ai-history-panel');
  if (panel) {
    panel.style.display = historyPanelOpen ? 'flex' : 'none';
  }
  if (historyPanelOpen) {
    void refreshHistoryPanel();
  }
}

function closeHistoryPanel(): void {
  historyPanelOpen = false;
  const panel = document.getElementById('ai-history-panel');
  if (panel) panel.style.display = 'none';
}

async function refreshHistoryPanel(): Promise<void> {
  const listEl = document.getElementById('ai-history-list');
  if (!listEl) return;

  try {
    const workspaceRoot = getCurrentWorkspaceRoot();
    const list = await window.electronAPI.chatHistory.list(workspaceRoot);

    if (list.length === 0) {
      listEl.innerHTML = '<div class="ai-history-empty">暂无对话记录</div>';
      return;
    }

    listEl.innerHTML = list.map(item => {
      const isActive = item.id === currentConversationId;
      const timeStr = formatConversationTime(item.updatedAt);
      return '<div class="ai-history-item' + (isActive ? ' active' : '') + '" data-conv-id="' + escAttr(item.id) + '">' +
        '<div class="ai-history-item-info">' +
          '<div class="ai-history-item-title">' + escHTML(item.title) + '</div>' +
          '<div class="ai-history-item-meta">' + item.messageCount + ' messages · ' + timeStr + '</div>' +
        '</div>' +
        '<button class="ai-history-item-delete" data-delete-id="' + escAttr(item.id) + '" title="Delete">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
          '</svg>' +
        '</button>' +
      '</div>';
    }).join('');
  } catch (err) {
    listEl.innerHTML = '<div class="ai-history-empty">加载失败</div>';
  }
}

function formatConversationTime(isoStr: string): string {
  try {
    const date = new Date(isoStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return diffMin + ' min ago';
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return diffHour + ' hr ago';
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return diffDay + ' day ago';
    return date.toLocaleDateString('zh-CN');
  } catch {
    return '';
  }
}

function initHistoryPanel(): void {
  // Create history panel DOM
  const actionsArea = document.querySelector('.ai-chat-actions');
  if (!actionsArea || document.getElementById('ai-history-toggle-btn')) return;

  const toggleWrap = document.createElement('div');
  toggleWrap.className = 'ai-history-toggle';
  toggleWrap.style.position = 'relative';

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'icon-btn';
  toggleBtn.id = 'ai-history-toggle-btn';
  toggleBtn.title = '对话历史';
  toggleBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<circle cx="12" cy="12" r="10"/>' +
    '<polyline points="12 6 12 12 16 14"/>' +
    '</svg>';
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleHistoryPanel();
  });

  const panel = document.createElement('div');
  panel.id = 'ai-history-panel';
  panel.className = 'ai-history-panel';
  panel.style.display = 'none';
  panel.innerHTML =
    '<div class="ai-history-panel-header">' +
      '<span>对话历史</span>' +
      '<div class="ai-history-panel-actions">' +
        '<button id="ai-history-close" title="关闭">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>' +
    '</div>' +
    '<div class="ai-history-list" id="ai-history-list"></div>' +
    '<button class="ai-history-new-btn" id="ai-history-new">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
      '新建对话' +
    '</button>';

  toggleWrap.appendChild(toggleBtn);
  toggleWrap.appendChild(panel);
  actionsArea.insertBefore(toggleWrap, actionsArea.firstChild);

  // Bind events
  panel.querySelector('#ai-history-close')?.addEventListener('click', closeHistoryPanel);
  panel.querySelector('#ai-history-new')?.addEventListener('click', () => {
    clearChat();
    closeHistoryPanel();
  });

  // Delegate clicks on history list
  const listEl = panel.querySelector('#ai-history-list');
  listEl?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;

    // Delete button
    const deleteBtn = target.closest('[data-delete-id]') as HTMLElement | null;
    if (deleteBtn) {
      event.stopPropagation();
      const deleteId = deleteBtn.dataset.deleteId;
      if (deleteId) void deleteConversation(deleteId);
      return;
    }

    // Conversation item
    const item = target.closest('[data-conv-id]') as HTMLElement | null;
    if (item) {
      const convId = item.dataset.convId;
      if (convId) void loadConversation(convId);
    }
  });

  // Close panel when clicking outside
  document.addEventListener('click', (event) => {
    if (!historyPanelOpen) return;
    const target = event.target as HTMLElement;
    if (!target.closest('.ai-history-toggle')) {
      closeHistoryPanel();
    }
  });
}

// Init
function bindAIPageEventsOnce(): void {
  if (aiPageBound) return;
  aiPageBound = true;

  document.getElementById('btn-save-ai')?.addEventListener('click', () => { void saveAIConfig(); });
  document.getElementById('btn-test-ai')?.addEventListener('click', () => { void testAIConnection(); });
  document.getElementById('btn-toggle-key')?.addEventListener('click', toggleApiKeyVisibility);

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

let workspaceCheckInterval: ReturnType<typeof setInterval> | null = null;

function initAIPage(): void {
  bindAIPageEventsOnce();
  initHistoryPanel();
  void loadAIConfig();
  void loadConversationHistory();
  updateStatsDisplay();

  // Periodically check for workspace changes while on AI page
  if (workspaceCheckInterval) clearInterval(workspaceCheckInterval);
  workspaceCheckInterval = setInterval(() => {
    const currentWorkspace = getCurrentWorkspaceRoot();
    if (historyLoaded && currentWorkspace !== loadedWorkspaceRoot) {
      void loadConversationHistory();
    }
  }, 1000);

  console.log('[AI] 页面初始化完成');
}

registerPageInit('ai', initAIPage);
