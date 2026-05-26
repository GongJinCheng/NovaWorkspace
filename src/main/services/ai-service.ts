import type {
  AIChatRequest,
  AIChatResponse,
  AIConnectionTestResult,
  AIMessage,
  AIModelInfo,
  AIProviderConfig,
} from '@shared/types/ai';
import { getAISettings, getDefaultAIProvider } from './settings-store';

type StreamCallbacks = {
  onChunk(chunk: string): void;
  onDone(fullText: string): void;
  onError(error: Error): void;
};

const DEFAULT_TIMEOUT = 30000;

export async function chat(request: AIChatRequest): Promise<AIChatResponse> {
  const provider = await resolveProvider(request.providerId);
  ensureProviderReady(provider);

  const timeout = request.timeout ?? DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const timer = timeout > 0 ? setTimeout(() => controller.abort(), timeout) : null;

  try {
    const response = await fetch(buildUrl(provider.baseUrl, '/chat/completions'), {
      method: 'POST',
      headers: buildHeaders(provider),
      body: JSON.stringify(buildChatBody(provider, request, false)),
      signal: controller.signal,
    });

    if (timer) clearTimeout(timer);
    await assertOk(response, 'AI 请求失败');

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content ?? '';

    return {
      content,
      model: data.model,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  } catch (error: any) {
    if (timer) clearTimeout(timer);
    if (error?.name === 'AbortError') throw new Error('请求超时或已取消');
    throw error;
  }
}

export async function chatStream(request: AIChatRequest, callbacks: StreamCallbacks, signal?: AbortSignal): Promise<void> {
  const provider = await resolveProvider(request.providerId);
  ensureProviderReady(provider);

  let fullText = '';

  try {
    const response = await fetch(buildUrl(provider.baseUrl, '/chat/completions'), {
      method: 'POST',
      headers: buildHeaders(provider),
      body: JSON.stringify(buildChatBody(provider, request, true)),
      signal,
    });

    await assertOk(response, 'AI 流式请求失败');

    if (!response.body) {
      throw new Error('当前运行环境不支持流式响应');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const payload = trimmed.slice(5).trim();
        if (!payload) continue;
        if (payload === '[DONE]') {
          callbacks.onDone(fullText);
          return;
        }

        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta;
          const content = delta?.content ?? delta?.reasoning_content ?? parsed.choices?.[0]?.message?.content;
          if (content) {
            fullText += content;
            callbacks.onChunk(content);
          }
        } catch {
          // Ignore partial/non-JSON server-sent event lines.
        }
      }
    }

    callbacks.onDone(fullText);
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      callbacks.onError(new Error('请求已取消'));
      return;
    }
    callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function fetchModels(providerId?: string): Promise<string[]> {
  const provider = await resolveProvider(providerId);
  ensureProviderReady(provider, false);

  const response = await fetch(buildUrl(provider.baseUrl, '/models'), {
    headers: buildHeaders(provider),
  });

  await assertOk(response, '获取模型列表失败');

  const data = await response.json() as any;
  if (!Array.isArray(data.data)) return [];

  return data.data
    .map((model: AIModelInfo | string) => typeof model === 'string' ? model : model.id)
    .filter(Boolean)
    .sort();
}

export async function testConnection(providerId?: string): Promise<AIConnectionTestResult> {
  try {
    const provider = await resolveProvider(providerId);
    ensureProviderReady(provider);

    const result = await chat({
      providerId: provider.id,
      messages: [{ role: 'user', content: 'Say "connection ok" in 3 words or less.' }],
      max_tokens: 20,
      temperature: 0,
      timeout: 20000,
    });

    return { ok: true, message: result.content || 'connection ok' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

async function resolveProvider(providerId?: string): Promise<AIProviderConfig> {
  if (!providerId) return await getDefaultAIProvider();

  const settings = await getAISettings();
  const provider = settings.providers.find(item => item.id === providerId);
  if (!provider) throw new Error('找不到指定的 AI 供应商');
  return provider;
}

function buildChatBody(provider: AIProviderConfig, request: AIChatRequest, stream: boolean): Record<string, unknown> {
  return {
    model: request.model || provider.defaultModel,
    messages: normalizeMessages(request.messages),
    temperature: request.temperature ?? 0.7,
    max_tokens: request.max_tokens ?? request.maxTokens ?? 4096,
    stream,
  };
}

function normalizeMessages(messages: AIMessage[]): AIMessage[] {
  return messages
    .filter(message => message && message.role && typeof message.content === 'string')
    .map(message => ({ role: message.role, content: message.content }));
}

function buildHeaders(provider: AIProviderConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;

  if (provider.type === 'openrouter') {
    headers['HTTP-Referer'] = 'https://nova.local';
    headers['X-Title'] = 'Nova';
  }

  return headers;
}

function buildUrl(baseUrl: string, pathname: string): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  let url = baseUrl.trim().replace(/\/+$/, '');

  // 很多国内中转平台会把完整 endpoint 直接给用户，例如：
  // https://example.com/v1/chat/completions
  // 这里统一还原成 base URL，避免拼成 /chat/completions/chat/completions。
  url = url.replace(/\/(chat\/completions|models)$/i, '');

  return `${url}${normalizedPath}`;
}

function ensureProviderReady(provider: AIProviderConfig, requireModel = true): void {
  if (!provider.enabled) throw new Error('当前 AI 供应商已禁用');
  if (!provider.baseUrl) throw new Error('请先配置 Base URL');
  if (requireModel && !provider.defaultModel) throw new Error('请先配置模型名称');
  if (provider.type !== 'ollama' && !provider.apiKey) throw new Error('请先配置 AI API Key');
}

async function assertOk(response: Response, fallbackMessage: string): Promise<void> {
  if (response.ok) return;

  const text = await response.text().catch(() => '');
  let message = `${fallbackMessage}: ${response.status}`;

  if (text) {
    try {
      const parsed = JSON.parse(text);
      message = parsed.error?.message || parsed.message || message;
    } catch {
      message = text.slice(0, 300) || message;
    }
  }

  throw new Error(message);
}
