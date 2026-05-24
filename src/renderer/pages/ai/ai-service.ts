/**
 * AIService - AI service wrapper (OpenAI compatible)
 * Exported as singleton
 */

import { Logger } from '../../../shared/utils/logger';

const aiLog = new Logger('AIService');

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

class AIService {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor() {
    this.apiKey = localStorage.getItem('ai-api-key') || '';
    this.baseUrl = localStorage.getItem('ai-base-url') || 'https://api.openai.com/v1';
    this.model = localStorage.getItem('ai-model') || 'gpt-3.5-turbo';
  }

  saveConfig(config: { apiKey?: string; baseUrl?: string; model?: string }): void {
    if (config.apiKey !== undefined) { this.apiKey = config.apiKey; localStorage.setItem('ai-api-key', this.apiKey); }
    if (config.baseUrl !== undefined) { this.baseUrl = config.baseUrl; localStorage.setItem('ai-base-url', this.baseUrl); }
    if (config.model !== undefined) { this.model = config.model; localStorage.setItem('ai-model', this.model); }
  }

  isConfigured(): boolean { return !!this.apiKey; }
  getModel(): string { return this.model; }
  getBaseUrl(): string { return this.baseUrl; }
  getApiKey(): string { return this.apiKey; }

  async chat(messages: ChatMessage[], options: { model?: string; temperature?: number; max_tokens?: number; signal?: AbortSignal; timeout?: number } = {}): Promise<string> {
    if (!this.isConfigured()) throw new Error('请先配置 AI API Key');
    aiLog.debug('Starting chat request');
    const url = this.baseUrl + '/chat/completions';
    const body = { model: options.model || this.model, messages, temperature: options.temperature || 0.7, max_tokens: options.max_tokens || 4096, stream: false };

    const controller = new AbortController();
    const signal = options.signal || controller.signal;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutMs = options.timeout || 30000;

    if (timeoutMs > 0) {
      timer = setTimeout(() => controller.abort(), timeoutMs);
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.apiKey },
        body: JSON.stringify(body),
        signal,
      });
      if (timer) clearTimeout(timer);
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const apiErr = error.error?.message || 'API 请求失败: ' + response.status;
      aiLog.error('Chat request failed: ' + apiErr);
      throw new Error(apiErr);
      }
      const data = await response.json();
      return data.choices[0].message.content;
    } catch (err: any) {
      if (timer) clearTimeout(timer);
      if (err.name === 'AbortError') { aiLog.warn('Request aborted or timed out'); throw new Error('请求超时或已取消'); }
      throw err;
    }
  }

  async chatStream(messages: ChatMessage[], options: { model?: string; temperature?: number; max_tokens?: number } = {}, onChunk: (text: string) => void): Promise<string> {
    if (!this.isConfigured()) throw new Error('请先配置 AI API Key');
    const url = this.baseUrl + '/chat/completions';
    const body = { model: options.model || this.model, messages, temperature: options.temperature || 0.7, max_tokens: options.max_tokens || 4096, stream: true };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.apiKey },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error('API 请求失败: ' + response.status);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') return fullText;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) { fullText += content; onChunk(content); }
        } catch { /* ignore parse errors */ }
      }
    }
    return fullText;
  }

  async formatMarkdown(content: string, signal?: AbortSignal): Promise<string> {
    return this.chat([{ role: 'system', content: 'Format and clean up the following Markdown. Keep content, only fix formatting. Output the cleaned content only.' }, { role: 'user', content }], { temperature: 0.3, signal, timeout: 25000 });
  }

  async explainCode(code: string): Promise<string> {
    return this.chat([{ role: 'system', content: 'Explain the following code concisely.' }, { role: 'user', content: code }]);
  }

  async summarize(content: string): Promise<string> {
    return this.chat([{ role: 'system', content: 'Summarize the following content concisely.' }, { role: 'user', content }], { temperature: 0.5 });
  }

  async translate(content: string, targetLang: string = 'Chinese'): Promise<string> {
    return this.chat([{ role: 'system', content: 'Translate the following content to ' + targetLang + '. Keep original formatting.' }, { role: 'user', content }], { temperature: 0.3 });
  }

  async fetchModels(): Promise<string[]> {
    if (!this.apiKey || !this.baseUrl) throw new Error('请先填写 API Key 和 Base URL');
    const url = this.baseUrl + '/models';
    const response = await fetch(url, { headers: { 'Authorization': 'Bearer ' + this.apiKey } });
    if (!response.ok) throw new Error('获取模型列表失败: ' + response.status);
    const data = await response.json();
    if (data.data && Array.isArray(data.data)) return data.data.map((m: any) => m.id).sort();
    return [];
  }
}

export const aiService = new AIService();