export type AIProviderType =
  | 'openai'
  | 'deepseek'
  | 'qwen'
  | 'kimi'
  | 'zhipu'
  | 'openrouter'
  | 'ollama'
  | 'custom';

export interface AIProviderConfig {
  id: string;
  name: string;
  type: AIProviderType;
  baseUrl: string;
  apiKey?: string;
  defaultModel: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AISettings {
  providers: AIProviderConfig[];
  defaultProviderId: string;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIChatOptions {
  providerId?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface AIChatRequest extends AIChatOptions {
  messages: AIMessage[];
  stream?: boolean;
}

export interface AIChatResponse {
  content: string;
  model?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface AIModelInfo {
  id: string;
  name?: string;
}

export interface AIConnectionTestResult {
  ok: boolean;
  message: string;
}

export interface AIProviderPreset {
  type: AIProviderType;
  name: string;
  baseUrl: string;
  defaultModel: string;
  requiresApiKey: boolean;
}
