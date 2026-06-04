export type AIProviderType =
  | 'openai'
  | 'deepseek'
  | 'qwen'
  | 'kimi'
  | 'zhipu'
  | 'openrouter'
  | 'ollama'
  | 'custom';

export interface AIModelCapabilities {
  /** Whether this model accepts image input parts such as OpenAI-compatible image_url. */
  vision: boolean;
  /** Whether this model can consume file/document attachments. Nova currently keeps this as an explicit capability flag. */
  files: boolean;
  /** Whether this model may return reasoning_content or visible thinking blocks. */
  reasoning: boolean;
  /** Whether this model supports tool/function calling. Nova does not auto-send tools yet. */
  tools: boolean;
}

export interface AIProviderConfig {
  id: string;
  name: string;
  type: AIProviderType;
  baseUrl: string;
  apiKey?: string;
  defaultModel: string;
  capabilities: AIModelCapabilities;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AISettings {
  providers: AIProviderConfig[];
  defaultProviderId: string;
}

export interface AIImageAttachment {
  id?: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  size?: number;
  path?: string;
}

export type AIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export type AIMessageContent = string | AIContentPart[];

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: AIMessageContent;
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
