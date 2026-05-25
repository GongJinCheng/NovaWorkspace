/**
 * AIService - renderer-side facade.
 *
 * The renderer keeps a small in-memory copy of the active provider for UI state,
 * but all API keys and model requests now live behind the preload/main-process API.
 */

import { Logger } from '../../../shared/utils/logger';
import type { AIMessage, AIProviderConfig, AISettings } from '../../../shared/types/ai';

const aiLog = new Logger('AIService');

export type ChatMessage = AIMessage;

type LegacyConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

class AIService {
  private settings: AISettings | null = null;
  private activeProvider: AIProviderConfig | null = null;
  private readyPromise: Promise<void>;

  constructor() {
    this.readyPromise = this.reloadConfig();
  }

  async ready(): Promise<void> {
    await this.readyPromise;
  }

  async reloadConfig(): Promise<void> {
    try {
      this.settings = await window.electronAPI.ai.getSettings();
      await this.migrateLegacyLocalStorageIfNeeded();
      this.activeProvider = this.getDefaultProviderFromSettings();
    } catch (error) {
      aiLog.error('Failed to load AI settings: ' + (error instanceof Error ? error.message : String(error)));
      this.settings = null;
      this.activeProvider = null;
    }
  }


  async getSettings(): Promise<AISettings> {
    await this.ready();
    return this.settings || await window.electronAPI.ai.getSettings();
  }

  getActiveProvider(): AIProviderConfig | null {
    return this.activeProvider ? { ...this.activeProvider } : null;
  }

  async saveProvider(provider: AIProviderConfig): Promise<AIProviderConfig> {
    const saved = await window.electronAPI.ai.saveProvider(provider);
    await this.reloadConfig();
    return saved;
  }

  async deleteProvider(providerId: string): Promise<boolean> {
    const result = await window.electronAPI.ai.deleteProvider(providerId);
    await this.reloadConfig();
    return result;
  }

  async setDefaultProvider(providerId: string): Promise<boolean> {
    const result = await window.electronAPI.ai.setDefaultProvider(providerId);
    await this.reloadConfig();
    return result;
  }

  async saveConfig(config: LegacyConfig): Promise<void> {
    await this.ready();

    const now = Date.now();
    const provider = this.activeProvider || this.createDefaultProvider();
    const nextProvider: AIProviderConfig = {
      ...provider,
      baseUrl: config.baseUrl !== undefined ? trimTrailingSlash(config.baseUrl) : provider.baseUrl,
      apiKey: config.apiKey !== undefined ? config.apiKey : provider.apiKey,
      defaultModel: config.model !== undefined ? config.model : provider.defaultModel,
      updatedAt: now,
    };

    const saved = await window.electronAPI.ai.saveProvider(nextProvider);
    await window.electronAPI.ai.setDefaultProvider(saved.id);

    this.clearLegacyLocalStorage();
    await this.reloadConfig();
  }

  isConfigured(): boolean {
    const provider = this.activeProvider;
    if (!provider || !provider.baseUrl || !provider.defaultModel) return false;
    if (provider.type === 'ollama') return true;
    return !!provider.apiKey;
  }

  getModel(): string {
    return this.activeProvider?.defaultModel || 'gpt-3.5-turbo';
  }

  getBaseUrl(): string {
    return this.activeProvider?.baseUrl || 'https://api.openai.com/v1';
  }

  getApiKey(): string {
    return this.activeProvider?.apiKey || '';
  }

  getProviderId(): string | undefined {
    return this.activeProvider?.id;
  }

  async chat(
    messages: ChatMessage[],
    options: { model?: string; temperature?: number; max_tokens?: number; signal?: AbortSignal; timeout?: number } = {}
  ): Promise<string> {
    await this.ready();
    if (!this.isConfigured()) throw new Error('请先配置 AI API Key');

    aiLog.debug('Starting chat request through main process');
    const response = await window.electronAPI.ai.chat({
      providerId: this.getProviderId(),
      model: options.model || this.getModel(),
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 4096,
      timeout: options.timeout,
      stream: false,
    });

    return response.content;
  }

  async chatStream(
    messages: ChatMessage[],
    options: { model?: string; temperature?: number; max_tokens?: number } = {},
    onChunk: (text: string) => void
  ): Promise<string> {
    await this.ready();
    if (!this.isConfigured()) throw new Error('请先配置 AI API Key');

    return await new Promise((resolve, reject) => {
      window.electronAPI.ai.chatStream(
        {
          providerId: this.getProviderId(),
          model: options.model || this.getModel(),
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.max_tokens ?? 4096,
          stream: true,
        },
        {
          onChunk,
          onDone: resolve,
          onError: (message) => reject(new Error(message)),
        }
      );
    });
  }

  async formatMarkdown(content: string, signal?: AbortSignal): Promise<string> {
    return this.chat([
      { role: 'system', content: 'Format and clean up the following Markdown. Keep content, only fix formatting. Output the cleaned content only.' },
      { role: 'user', content },
    ], { temperature: 0.3, signal, timeout: 25000 });
  }

  async formatDocument(content: string, fileName: string = ''): Promise<string> {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const isMarkdown = ['md', 'markdown', 'mdown', 'mkdn'].includes(ext);
    const isCode = ['ts', 'tsx', 'js', 'jsx', 'json', 'css', 'html', 'vue', 'svelte', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'cs', 'php', 'rb', 'sh', 'yml', 'yaml', 'xml'].includes(ext);

    const system = isMarkdown
      ? 'Format and clean up the following Markdown. Keep the original meaning and content. Only fix spacing, headings, lists, tables and code fences. Output the cleaned Markdown only.'
      : isCode
        ? 'Format the following code. Preserve behavior exactly. Only improve indentation, whitespace, and formatting. Output code only, without explanations or Markdown fences.'
        : 'Clean up and format the following document. Preserve meaning and content. Output the formatted content only.';

    return this.chat([
      { role: 'system', content: system },
      { role: 'user', content },
    ], { temperature: 0.2, timeout: 25000 });
  }

  async explainCode(code: string): Promise<string> {
    return this.chat([
      { role: 'system', content: 'Explain the following code concisely.' },
      { role: 'user', content: code },
    ]);
  }

  async summarize(content: string): Promise<string> {
    return this.chat([
      { role: 'system', content: 'Summarize the following content concisely.' },
      { role: 'user', content },
    ], { temperature: 0.5 });
  }

  async translate(content: string, targetLang: string = 'Chinese'): Promise<string> {
    return this.chat([
      { role: 'system', content: 'Translate the following content to ' + targetLang + '. Keep original formatting.' },
      { role: 'user', content },
    ], { temperature: 0.3 });
  }

  async fetchModels(): Promise<string[]> {
    await this.ready();
    if (!this.activeProvider?.baseUrl) throw new Error('请先填写 Base URL');
    if (this.activeProvider.type !== 'ollama' && !this.activeProvider.apiKey) throw new Error('请先填写 API Key');
    return await window.electronAPI.ai.fetchModels(this.activeProvider.id);
  }

  async testConnection(): Promise<string> {
    await this.ready();
    const result = await window.electronAPI.ai.testConnection(this.activeProvider?.id);
    if (!result.ok) throw new Error(result.message);
    return result.message;
  }

  private async migrateLegacyLocalStorageIfNeeded(): Promise<void> {
    const legacyApiKey = localStorage.getItem('ai-api-key') || '';
    const legacyBaseUrl = localStorage.getItem('ai-base-url') || '';
    const legacyModel = localStorage.getItem('ai-model') || '';
    if (!legacyApiKey && !legacyBaseUrl && !legacyModel) return;

    const provider = this.getDefaultProviderFromSettings() || this.createDefaultProvider();
    const migrated: AIProviderConfig = {
      ...provider,
      apiKey: legacyApiKey || provider.apiKey,
      baseUrl: trimTrailingSlash(legacyBaseUrl || provider.baseUrl),
      defaultModel: legacyModel || provider.defaultModel,
      updatedAt: Date.now(),
    };

    const saved = await window.electronAPI.ai.saveProvider(migrated);
    await window.electronAPI.ai.setDefaultProvider(saved.id);
    this.clearLegacyLocalStorage();
    this.settings = await window.electronAPI.ai.getSettings();
  }

  private getDefaultProviderFromSettings(): AIProviderConfig | null {
    const settings = this.settings;
    if (!settings) return null;
    return settings.providers.find(provider => provider.id === settings.defaultProviderId)
      || settings.providers.find(provider => provider.enabled)
      || settings.providers[0]
      || null;
  }

  private createDefaultProvider(): AIProviderConfig {
    const now = Date.now();
    return {
      id: 'default-openai-compatible',
      name: 'OpenAI Compatible',
      type: 'custom',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      defaultModel: 'gpt-3.5-turbo',
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  private clearLegacyLocalStorage(): void {
    localStorage.removeItem('ai-api-key');
    localStorage.removeItem('ai-base-url');
    localStorage.removeItem('ai-model');
  }
}

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export const aiService = new AIService();
