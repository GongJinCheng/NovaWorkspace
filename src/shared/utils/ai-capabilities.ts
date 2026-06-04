import type { AIModelCapabilities, AIProviderConfig, AIProviderType } from '../types/ai';

export const DEFAULT_AI_MODEL_CAPABILITIES: AIModelCapabilities = {
  vision: false,
  files: false,
  reasoning: false,
  tools: false,
};

export const AI_CAPABILITY_LABELS: Record<keyof AIModelCapabilities, string> = {
  vision: '图片输入',
  files: '文件输入',
  reasoning: '思考过程',
  tools: '工具调用',
};

type CapabilityProviderLike = Partial<Pick<AIProviderConfig, 'name' | 'type' | 'baseUrl' | 'defaultModel'>> & {
  model?: string;
};

const KNOWN_VISION_MODEL_RULES = [
  /gpt-4o/i,
  /gpt-4\.1/i,
  /gpt-5/i,
  /\bo3\b/i,
  /\bo4(?:-mini)?\b/i,
  /gemini/i,
  /claude(?:-3|.*(?:sonnet|opus|haiku))/i,
  /qwen.*(?:vl|omni|vision)/i,
  /glm-?4v/i,
  /vision/i,
  /(?:^|[-_/])vl(?:$|[-_/])/i,
  /llava/i,
  /pixtral/i,
  /mllama/i,
  /internvl/i,
  /minicpm-v/i,
  /yi-vision/i,
  /step-1v/i,
  /doubao.*(?:vision|vl)/i,
  /hunyuan.*(?:vision|vl)/i,
  /mimo.*(?:vision|vl)/i,
];

const KNOWN_REASONING_MODEL_RULES = [
  /deepseek-(?:r1|reasoner)/i,
  /(?:^|[-_/])r1(?:$|[-_/])/i,
  /reason(?:er|ing)/i,
  /\bo1\b/i,
  /\bo3\b/i,
  /\bo4(?:-mini)?\b/i,
  /qwq/i,
  /qwen.*thinking/i,
  /glm-z1/i,
];

const KNOWN_TOOL_MODEL_RULES = [
  /gpt-4o/i,
  /gpt-4\.1/i,
  /gpt-5/i,
  /claude/i,
  /gemini/i,
  /qwen/i,
  /glm-4/i,
  /deepseek-chat/i,
];

const TEXT_ONLY_PROVIDER_RULES = [
  /deepseek/i,
  /moonshot/i,
  /kimi/i,
];

export function inferAIModelCapabilities(provider: CapabilityProviderLike | null | undefined): AIModelCapabilities {
  if (!provider) return { ...DEFAULT_AI_MODEL_CAPABILITIES };

  const model = String(provider.defaultModel || provider.model || '').trim();
  const type = String(provider.type || '').toLowerCase() as AIProviderType | string;
  const providerText = `${provider.name || ''} ${provider.type || ''} ${provider.baseUrl || ''}`.toLowerCase();

  const explicitVisionModel = testRules(KNOWN_VISION_MODEL_RULES, model);
  const knownTextOnlyProvider = testRules(TEXT_ONLY_PROVIDER_RULES, providerText);

  const vision = explicitVisionModel
    || (type === 'openai' && /gpt-4o|gpt-4\.1|gpt-5|\bo3\b|\bo4(?:-mini)?\b/i.test(model))
    || (type === 'zhipu' && /glm-?4v|vision/i.test(model));

  return {
    // 只有模型名明确体现视觉/多模态能力时才默认开启，避免把 image_url 发给纯文本模型。
    vision: knownTextOnlyProvider && !explicitVisionModel ? false : vision,
    // 当前 Nova 尚未实现通用文件上传协议，默认关闭；用户可在配置中手动开启用于后续扩展。
    files: false,
    reasoning: testRules(KNOWN_REASONING_MODEL_RULES, model),
    // 工具调用协议尚未接入业务侧，默认只做能力标记，不自动发 tools。
    tools: testRules(KNOWN_TOOL_MODEL_RULES, model) && type !== 'custom',
  };
}

export function normalizeAIModelCapabilities(
  capabilities: Partial<AIModelCapabilities> | null | undefined,
  provider?: CapabilityProviderLike | null
): AIModelCapabilities {
  const inferred = inferAIModelCapabilities(provider);
  return {
    vision: typeof capabilities?.vision === 'boolean' ? capabilities.vision : inferred.vision,
    files: typeof capabilities?.files === 'boolean' ? capabilities.files : inferred.files,
    reasoning: typeof capabilities?.reasoning === 'boolean' ? capabilities.reasoning : inferred.reasoning,
    tools: typeof capabilities?.tools === 'boolean' ? capabilities.tools : inferred.tools,
  };
}

export function providerSupportsCapability(
  provider: Pick<AIProviderConfig, 'capabilities' | 'defaultModel' | 'type' | 'name' | 'baseUrl'> | null | undefined,
  capability: keyof AIModelCapabilities
): boolean {
  if (!provider) return false;
  return normalizeAIModelCapabilities(provider.capabilities, provider)[capability] === true;
}

export function describeAIModelCapabilities(capabilities: AIModelCapabilities): string {
  const enabled = (Object.keys(AI_CAPABILITY_LABELS) as Array<keyof AIModelCapabilities>)
    .filter(key => capabilities[key])
    .map(key => AI_CAPABILITY_LABELS[key]);
  return enabled.length > 0 ? enabled.join('、') : '仅文本';
}

function testRules(rules: RegExp[], text: string): boolean {
  return rules.some(rule => rule.test(text));
}
