/**
 * Settings Page — 设置页面
 * Adds AI provider management while keeping the original theme controls.
 */

import { registerPageInit } from '../../app/router';
import { getThemeMode, setThemeMode } from '../../app/theme';
import { AI_PROVIDER_PRESETS } from '../../../shared/constants/ai-providers';
import { showConfirmDialog } from '../../components/modal';
import { MASKED_API_KEY } from '../../../shared/constants/app';
import type { AIModelCapabilities, AIProviderConfig, AIProviderType, AISettings } from '../../../shared/types/ai';
import {
  AI_CAPABILITY_LABELS,
  describeAIModelCapabilities,
  inferAIModelCapabilities,
  normalizeAIModelCapabilities,
} from '../../../shared/utils/ai-capabilities';
import { aiService } from '../ai/ai-service';
import { escHtml } from '../../utils/escape';
import { ipcClient } from '../../services/ipc-client';

let settingsPageBound = false;
let currentAISettings: AISettings | null = null;
let editingProviderId: string | null = null;
const CAPABILITY_KEYS: Array<keyof AIModelCapabilities> = ['vision', 'files', 'reasoning', 'tools'];

function initSettingsPage(): void {
  ensureAISettingsSection();
  bindSettingsPageOnce();
  initThemeSelector();
  void renderAIProviderSettings();
  console.log('[Settings] 页面初始化完成');
}

function bindSettingsPageOnce(): void {
  if (settingsPageBound) return;
  settingsPageBound = true;

  const page = document.getElementById('page-settings');
  page?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const actionEl = target?.closest('[data-ai-settings-action]') as HTMLElement | null;
    const action = actionEl?.dataset.aiSettingsAction;
    if (!action) return;

    const providerId = actionEl.dataset.providerId || '';
    switch (action) {
      case 'new-provider':
        selectProviderForEdit(createProviderFromPreset('deepseek'));
        break;
      case 'edit-provider':
        selectProviderForEdit(getProvider(providerId));
        break;
      case 'delete-provider':
        void deleteProvider(providerId);
        break;
      case 'set-default-provider':
        void setDefaultProvider(providerId);
        break;
      case 'save-provider':
        void saveProviderFromForm();
        break;
      case 'reset-provider-form':
        selectProviderForEdit(createProviderFromPreset('deepseek'));
        break;
      case 'test-provider':
        void testProviderFromForm();
        break;
      case 'fetch-provider-models':
        void fetchModelsFromForm();
        break;
      case 'infer-provider-capabilities':
        applyInferredCapabilitiesToForm(true);
        break;
    }
  });

  page?.addEventListener('change', (event) => {
    const target = event.target as HTMLSelectElement | HTMLInputElement | null;
    if (target?.id === 'settings-ai-preset') {
      selectProviderForEdit(createProviderFromPreset(target.value as AIProviderType));
    }
  });
}

function initThemeSelector(): void {
  const currentMode = getThemeMode();
  const radios = document.querySelectorAll('input[name="theme-mode"]') as NodeListOf<HTMLInputElement>;
  radios.forEach(radio => {
    radio.checked = radio.value === currentMode;
    if (radio.dataset.bound === 'true') return;
    radio.dataset.bound = 'true';
    radio.addEventListener('change', () => {
      if (radio.checked) {
        setThemeMode(radio.value as 'light' | 'dark' | 'system');
      }
    });
  });
}

function ensureAISettingsSection(): void {
  const page = document.getElementById('page-settings');
  const settingsContent = page?.querySelector('.settings-page') as HTMLElement | null;
  if (!page || !settingsContent || document.getElementById('settings-ai-section')) return;

  const section = document.createElement('section');
  section.id = 'settings-ai-section';
  section.className = 'settings-section settings-ai-section';
  section.innerHTML =
    '<div class="settings-section-header">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93L12 22"/><path d="M12 2a4 4 0 0 0-4 4c0 1.95 1.4 3.58 3.25 3.93"/></svg>' +
    '<h3>AI 模型配置</h3>' +
    '</div>' +
    '<p class="settings-row-desc settings-ai-desc">集中管理 DeepSeek、通义千问、Kimi、智谱、Ollama 与自定义 OpenAI Compatible 接口。</p>' +
    '<div id="settings-ai-status" class="settings-ai-status"></div>' +
    '<div class="settings-ai-shell">' +
      '<div class="settings-ai-provider-strip-header">' +
        '<div><div class="settings-ai-strip-title">供应商</div><div class="settings-ai-strip-subtitle">选择一个供应商进行编辑，或新增新的模型接口。</div></div>' +
        '<button class="settings-mini-btn" data-ai-settings-action="new-provider">新增供应商</button>' +
      '</div>' +
      '<div id="settings-ai-provider-list" class="settings-ai-provider-list"></div>' +
      '<div class="settings-ai-form-panel">' +
        '<div class="settings-ai-panel-title"><span>配置详情</span><button class="settings-mini-btn ghost" data-ai-settings-action="reset-provider-form">重置表单</button></div>' +
        '<div class="settings-ai-form-grid">' +
          '<label>预设<select id="settings-ai-preset"></select></label>' +
          '<label>名称<input id="settings-ai-name" type="text" placeholder="例如 DeepSeek" /></label>' +
          '<label class="settings-ai-span-2">Base URL<input id="settings-ai-base-url" type="text" placeholder="https://api.example.com/v1" /></label>' +
          '<label class="settings-ai-span-2">API Key<input id="settings-ai-api-key" type="password" placeholder="Ollama 可留空" /></label>' +
          '<label>默认模型<input id="settings-ai-model" type="text" placeholder="例如 deepseek-chat" /></label>' +
          '<label class="settings-ai-enabled"><input id="settings-ai-enabled" type="checkbox" /> 启用当前供应商</label>' +
          '<div class="settings-ai-capabilities settings-ai-span-2">' +
            '<div class="settings-ai-capability-head">' +
              '<div><strong>模型能力</strong><span>发送前按这里校验，避免把图片发给纯文本模型。</span></div>' +
              '<button type="button" class="settings-mini-btn ghost" data-ai-settings-action="infer-provider-capabilities">按模型名识别</button>' +
            '</div>' +
            '<div class="settings-ai-capability-grid">' +
              '<label class="settings-ai-capability"><input id="settings-ai-cap-vision" type="checkbox" /> <span>支持图片输入</span><small>允许发送 image_url/base64 图片</small></label>' +
              '<label class="settings-ai-capability"><input id="settings-ai-cap-files" type="checkbox" /> <span>支持文件输入</span><small>预留文档/附件能力</small></label>' +
              '<label class="settings-ai-capability"><input id="settings-ai-cap-reasoning" type="checkbox" /> <span>支持思考过程</span><small>兼容 reasoning_content / think</small></label>' +
              '<label class="settings-ai-capability"><input id="settings-ai-cap-tools" type="checkbox" /> <span>支持工具调用</span><small>预留 tools/function calling</small></label>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="settings-ai-actions">' +
          '<button class="settings-action-btn primary" data-ai-settings-action="save-provider">保存配置</button>' +
          '<button class="settings-action-btn" data-ai-settings-action="test-provider">测试连接</button>' +
          '<button class="settings-action-btn" data-ai-settings-action="fetch-provider-models">获取模型</button>' +
        '</div>' +
        '<div id="settings-ai-models" class="settings-ai-models"></div>' +
      '</div>' +
    '</div>';

  settingsContent.appendChild(section);
  renderPresetOptions();
}

function renderPresetOptions(): void {
  const select = document.getElementById('settings-ai-preset') as HTMLSelectElement | null;
  if (!select) return;
  select.innerHTML = AI_PROVIDER_PRESETS.map(preset =>
    '<option value="' + escHtml(preset.type) + '">' + escHtml(preset.name) + '</option>'
  ).join('');
}

async function renderAIProviderSettings(): Promise<void> {
  currentAISettings = await aiService.getSettings();
  renderProviderList();

  const active = editingProviderId ? getProvider(editingProviderId) : getProvider(currentAISettings.defaultProviderId);
  selectProviderForEdit(active || currentAISettings.providers[0] || createProviderFromPreset('deepseek'), false);
}

function renderProviderList(): void {
  const list = document.getElementById('settings-ai-provider-list');
  if (!list || !currentAISettings) return;

  const activeId = editingProviderId || currentAISettings.defaultProviderId;
  list.innerHTML = currentAISettings.providers.map(provider => {
    const isDefault = provider.id === currentAISettings?.defaultProviderId;
    const isActive = provider.id === activeId;
    const status = provider.enabled ? '启用' : '停用';
    return '<div class="settings-ai-provider-card ' + (isActive ? 'active' : '') + '">' +
      '<div class="settings-ai-provider-main" data-ai-settings-action="edit-provider" data-provider-id="' + escHtml(provider.id) + '">' +
        '<div class="settings-ai-provider-top">' +
          '<strong>' + escHtml(provider.name) + '</strong>' +
          (isDefault ? '<span class="settings-ai-default-badge">默认</span>' : '') +
        '</div>' +
        '<span>' + escHtml(provider.defaultModel || '-') + ' · ' + status + '</span>' +
        renderCapabilityBadges(provider) +
      '</div>' +
      '<div class="settings-ai-provider-actions">' +
        (!isDefault ? '<button data-ai-settings-action="set-default-provider" data-provider-id="' + escHtml(provider.id) + '">设为默认</button>' : '<button class="is-muted" data-ai-settings-action="edit-provider" data-provider-id="' + escHtml(provider.id) + '">正在使用</button>') +
        '<button data-ai-settings-action="delete-provider" data-provider-id="' + escHtml(provider.id) + '">删除</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function selectProviderForEdit(provider: AIProviderConfig | null, clearModels = true): void {
  if (!provider) return;
  editingProviderId = provider.id;
  if (currentAISettings) renderProviderList();
  setValue('settings-ai-preset', provider.type);
  setValue('settings-ai-name', provider.name);
  setValue('settings-ai-base-url', provider.baseUrl);
  setValue('settings-ai-api-key', (provider.apiKey && provider.apiKey !== MASKED_API_KEY) ? provider.apiKey : '');
  setValue('settings-ai-model', provider.defaultModel);
  const enabled = document.getElementById('settings-ai-enabled') as HTMLInputElement | null;
  if (enabled) enabled.checked = provider.enabled !== false;
  setCapabilityChecks(normalizeAIModelCapabilities(provider.capabilities, provider));
  if (clearModels) setModelsMessage('');
}

async function saveProviderFromForm(): Promise<void> {
  const presetType = getValue('settings-ai-preset') as AIProviderType;
  const existing = getProvider(editingProviderId || '');
  const now = Date.now();
  const providerDraft = {
    name: getValue('settings-ai-name') || getPreset(presetType)?.name || 'AI Provider',
    type: presetType,
    baseUrl: getValue('settings-ai-base-url'),
    defaultModel: getValue('settings-ai-model'),
  };

  const rawKey = getValue('settings-ai-api-key');
  const provider: AIProviderConfig = {
    id: existing?.id || 'provider-' + now.toString(36) + '-' + Math.random().toString(36).slice(2, 8),
    ...providerDraft,
    apiKey: rawKey.trim() ? rawKey.trim() : MASKED_API_KEY,
    capabilities: getCapabilitiesFromForm(providerDraft),
    enabled: (document.getElementById('settings-ai-enabled') as HTMLInputElement | null)?.checked !== false,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  if (!provider.baseUrl.trim()) {
    setStatus('请填写 Base URL', 'error');
    return;
  }
  if (!provider.defaultModel.trim()) {
    setStatus('请填写默认模型', 'error');
    return;
  }

  const saved = await aiService.saveProvider(provider);
  await aiService.setDefaultProvider(saved.id);
  currentAISettings = await aiService.getSettings();
  editingProviderId = saved.id;
  renderProviderList();
  selectProviderForEdit(saved, false);
  setStatus('AI 配置已保存，并设为默认供应商', 'success');
}

async function deleteProvider(providerId: string): Promise<void> {
  if (!providerId) return;
  const provider = getProvider(providerId);
  if (!provider) return;
  if (!(await showConfirmDialog({ title: '删除确认', message: '确定删除 “' + provider.name + '” 吗？' }))) return;

  await aiService.deleteProvider(providerId);
  currentAISettings = await aiService.getSettings();
  editingProviderId = currentAISettings.defaultProviderId;
  renderProviderList();
  selectProviderForEdit(getProvider(editingProviderId), false);
  setStatus('已删除供应商', 'success');
}

async function setDefaultProvider(providerId: string): Promise<void> {
  if (!providerId) return;
  await aiService.setDefaultProvider(providerId);
  currentAISettings = await aiService.getSettings();
  editingProviderId = providerId;
  renderProviderList();
  selectProviderForEdit(getProvider(providerId), false);
  setStatus('已切换默认供应商', 'success');
}

async function testProviderFromForm(): Promise<void> {
  const provider = await saveTemporaryProviderFromForm();
  if (!provider) return;
  const btn = document.querySelector('[data-ai-settings-action="test-provider"]') as HTMLButtonElement | null;
  const original = btn?.textContent || '测试连接';
  if (btn) { btn.disabled = true; btn.textContent = '测试中...'; }
  try {
    const result = await ipcClient.ai.testConnection(provider.id);
    setStatus(result.message, result.ok ? 'success' : 'error');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

async function fetchModelsFromForm(): Promise<void> {
  const provider = await saveTemporaryProviderFromForm();
  if (!provider) return;
  const btn = document.querySelector('[data-ai-settings-action="fetch-provider-models"]') as HTMLButtonElement | null;
  const original = btn?.textContent || '获取模型';
  if (btn) { btn.disabled = true; btn.textContent = '获取中...'; }
  try {
    const models = await ipcClient.ai.fetchModels(provider.id);
    if (models.length === 0) {
      setModelsMessage('没有获取到模型。');
    } else {
      setModelsMessage(models.slice(0, 30).map(model => '<button class="settings-model-chip" data-model="' + escHtml(model) + '">' + escHtml(model) + '</button>').join(''));
      const modelsEl = document.getElementById('settings-ai-models');
      modelsEl?.querySelectorAll('.settings-model-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const model = (chip as HTMLElement).dataset.model || '';
          setValue('settings-ai-model', model);
          applyInferredCapabilitiesToForm(false, model);
          setStatus('已选择模型，并按模型名预填能力；如中转平台能力不同，可手动调整。', 'info');
        }, { once: false });
      });
    }
    setStatus('获取到 ' + models.length + ' 个模型', 'success');
  } catch (error) {
    setStatus('获取模型失败: ' + (error instanceof Error ? error.message : String(error)), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

async function saveTemporaryProviderFromForm(): Promise<AIProviderConfig | null> {
  await saveProviderFromForm();
  return editingProviderId ? getProvider(editingProviderId) : null;
}

function getProvider(providerId: string | null): AIProviderConfig | null {
  if (!providerId || !currentAISettings) return null;
  return currentAISettings.providers.find(provider => provider.id === providerId) || null;
}

function createProviderFromPreset(type: AIProviderType): AIProviderConfig {
  const preset = getPreset(type) || AI_PROVIDER_PRESETS[0];
  const now = Date.now();
  return {
    id: '',
    name: preset.name,
    type: preset.type,
    baseUrl: preset.baseUrl,
    apiKey: '',
    defaultModel: preset.defaultModel,
    capabilities: inferAIModelCapabilities({
      name: preset.name,
      type: preset.type,
      baseUrl: preset.baseUrl,
      defaultModel: preset.defaultModel,
    }),
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

function getPreset(type: AIProviderType) {
  return AI_PROVIDER_PRESETS.find(preset => preset.type === type);
}

function getCapabilitiesFromForm(provider: Pick<AIProviderConfig, 'name' | 'type' | 'baseUrl' | 'defaultModel'>): AIModelCapabilities {
  const formCapabilities = CAPABILITY_KEYS.reduce((acc, key) => {
    const checkbox = document.getElementById(getCapabilityCheckboxId(key)) as HTMLInputElement | null;
    acc[key] = checkbox?.checked === true;
    return acc;
  }, {} as AIModelCapabilities);
  return normalizeAIModelCapabilities(formCapabilities, provider);
}

function setCapabilityChecks(capabilities: AIModelCapabilities): void {
  CAPABILITY_KEYS.forEach((key) => {
    const checkbox = document.getElementById(getCapabilityCheckboxId(key)) as HTMLInputElement | null;
    if (checkbox) checkbox.checked = capabilities[key] === true;
  });
}

function applyInferredCapabilitiesToForm(showStatus: boolean, modelOverride?: string): void {
  const presetType = getValue('settings-ai-preset') as AIProviderType;
  const provider = {
    name: getValue('settings-ai-name') || getPreset(presetType)?.name || 'AI Provider',
    type: presetType,
    baseUrl: getValue('settings-ai-base-url'),
    defaultModel: modelOverride || getValue('settings-ai-model'),
  };
  const capabilities = inferAIModelCapabilities(provider);
  setCapabilityChecks(capabilities);
  if (showStatus) {
    setStatus('已按模型名识别能力：' + describeAIModelCapabilities(capabilities) + '。自定义中转不一定准确，可手动调整。', 'info');
  }
}

function renderCapabilityBadges(provider: AIProviderConfig): string {
  const capabilities = normalizeAIModelCapabilities(provider.capabilities, provider);
  return '<div class="settings-ai-capability-badges">' + CAPABILITY_KEYS.map(key => {
    const on = capabilities[key] === true;
    return '<span class="settings-ai-capability-badge ' + (on ? 'on' : 'off') + '">' + escHtml(AI_CAPABILITY_LABELS[key]) + '</span>';
  }).join('') + '</div>';
}

function getCapabilityCheckboxId(key: keyof AIModelCapabilities): string {
  return 'settings-ai-cap-' + key;
}


function setStatus(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const el = document.getElementById('settings-ai-status');
  if (!el) return;
  el.textContent = message;
  el.className = 'settings-ai-status show ' + type;
  window.setTimeout(() => { el.className = 'settings-ai-status'; }, 3500);
}

function setModelsMessage(html: string): void {
  const el = document.getElementById('settings-ai-models');
  if (el) el.innerHTML = html;
}

function getValue(id: string): string {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  return el?.value?.trim() || '';
}

function setValue(id: string, value: string): void {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  if (el) el.value = value || '';
}

registerPageInit('settings', initSettingsPage);

export { initSettingsPage };
