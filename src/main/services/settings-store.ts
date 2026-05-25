import fs from 'fs/promises';
import path from 'path';
import { getSettingsDataPath } from '../utils/paths';
import type { AIProviderConfig, AISettings } from '@shared/types/ai';

export interface AppSettings {
  ai: AISettings;
  appearance?: {
    themeMode?: 'light' | 'dark' | 'system';
  };
  updatedAt: number;
}

const DEFAULT_PROVIDER_ID = 'default-openai-compatible';

const DEFAULT_SETTINGS: AppSettings = {
  ai: {
    defaultProviderId: DEFAULT_PROVIDER_ID,
    providers: [
      {
        id: DEFAULT_PROVIDER_ID,
        name: 'OpenAI Compatible',
        type: 'custom',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        defaultModel: 'gpt-3.5-turbo',
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
  },
  appearance: { themeMode: 'system' },
  updatedAt: Date.now(),
};

let cachedSettings: AppSettings | null = null;
let writeQueue: Promise<void> = Promise.resolve();

export async function readSettings(): Promise<AppSettings> {
  if (cachedSettings) return cloneSettings(cachedSettings);

  try {
    const raw = await fs.readFile(getSettingsDataPath(), 'utf-8');
    cachedSettings = normalizeSettings(JSON.parse(raw));
  } catch {
    cachedSettings = cloneSettings(DEFAULT_SETTINGS);
    await enqueueWrite(cachedSettings);
  }

  return cloneSettings(cachedSettings);
}

export async function writeSettings(settings: AppSettings): Promise<AppSettings> {
  cachedSettings = normalizeSettings(settings);
  cachedSettings.updatedAt = Date.now();
  await enqueueWrite(cachedSettings);
  return cloneSettings(cachedSettings);
}

export async function getAISettings(): Promise<AISettings> {
  const settings = await readSettings();
  return cloneAISettings(settings.ai);
}

export async function saveAIProvider(provider: AIProviderConfig): Promise<AIProviderConfig> {
  const settings = await getMutableSettings();
  const now = Date.now();
  const normalized: AIProviderConfig = {
    ...provider,
    id: provider.id || createId('provider'),
    name: provider.name?.trim() || 'OpenAI Compatible',
    type: provider.type || 'custom',
    baseUrl: trimTrailingSlash(provider.baseUrl || ''),
    defaultModel: provider.defaultModel?.trim() || 'gpt-3.5-turbo',
    enabled: provider.enabled !== false,
    createdAt: provider.createdAt || now,
    updatedAt: now,
  };

  const index = settings.ai.providers.findIndex(item => item.id === normalized.id);
  if (index >= 0) {
    normalized.createdAt = settings.ai.providers[index].createdAt || normalized.createdAt;
    settings.ai.providers[index] = normalized;
  } else {
    settings.ai.providers.push(normalized);
  }

  if (!settings.ai.defaultProviderId || !settings.ai.providers.some(item => item.id === settings.ai.defaultProviderId)) {
    settings.ai.defaultProviderId = normalized.id;
  }

  await writeSettings(settings);
  return { ...normalized };
}

export async function deleteAIProvider(providerId: string): Promise<boolean> {
  const settings = await getMutableSettings();
  const before = settings.ai.providers.length;
  settings.ai.providers = settings.ai.providers.filter(provider => provider.id !== providerId);

  if (settings.ai.providers.length === 0) {
    settings.ai.providers = cloneAISettings(DEFAULT_SETTINGS.ai).providers;
  }

  if (settings.ai.defaultProviderId === providerId) {
    settings.ai.defaultProviderId = settings.ai.providers[0]?.id || DEFAULT_PROVIDER_ID;
  }

  if (settings.ai.providers.length !== before) {
    await writeSettings(settings);
  }

  return true;
}

export async function setDefaultAIProvider(providerId: string): Promise<boolean> {
  const settings = await getMutableSettings();
  const exists = settings.ai.providers.some(provider => provider.id === providerId);
  if (!exists) return false;

  settings.ai.defaultProviderId = providerId;
  await writeSettings(settings);
  return true;
}

export async function getDefaultAIProvider(): Promise<AIProviderConfig> {
  const settings = await readSettings();
  const provider = settings.ai.providers.find(item => item.id === settings.ai.defaultProviderId)
    || settings.ai.providers.find(item => item.enabled)
    || settings.ai.providers[0];

  if (!provider) {
    const defaults = cloneAISettings(DEFAULT_SETTINGS.ai);
    return defaults.providers[0];
  }

  return { ...provider };
}

async function getMutableSettings(): Promise<AppSettings> {
  if (!cachedSettings) await readSettings();
  cachedSettings = normalizeSettings(cachedSettings || DEFAULT_SETTINGS);
  return cachedSettings;
}

function enqueueWrite(settings: AppSettings): Promise<void> {
  const snapshot = JSON.stringify(normalizeSettings(settings), null, 2);
  writeQueue = writeQueue.then(() => atomicWrite(snapshot));
  return writeQueue;
}

async function atomicWrite(serializedSettings: string): Promise<void> {
  const settingsPath = getSettingsDataPath();
  const dir = path.dirname(settingsPath);
  const tempPath = `${settingsPath}.${process.pid}.tmp`;

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tempPath, serializedSettings, 'utf-8');
  await fs.rename(tempPath, settingsPath);
}

function normalizeSettings(value: unknown): AppSettings {
  const candidate = value as Partial<AppSettings> | null;
  const ai = normalizeAISettings(candidate?.ai);

  return {
    ai,
    appearance: candidate?.appearance || { themeMode: 'system' },
    updatedAt: typeof candidate?.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
  };
}

function normalizeAISettings(value: unknown): AISettings {
  const candidate = value as Partial<AISettings> | null;
  const providers = Array.isArray(candidate?.providers)
    ? candidate.providers.map(normalizeProvider).filter(Boolean) as AIProviderConfig[]
    : [];

  const normalizedProviders = providers.length > 0
    ? providers
    : cloneAISettings(DEFAULT_SETTINGS.ai).providers;

  const defaultProviderId = candidate?.defaultProviderId && normalizedProviders.some(item => item.id === candidate.defaultProviderId)
    ? candidate.defaultProviderId
    : normalizedProviders[0].id;

  return { providers: normalizedProviders, defaultProviderId };
}

function normalizeProvider(value: unknown): AIProviderConfig | null {
  const provider = value as Partial<AIProviderConfig> | null;
  if (!provider) return null;

  const now = Date.now();
  return {
    id: provider.id || createId('provider'),
    name: provider.name || 'OpenAI Compatible',
    type: provider.type || 'custom',
    baseUrl: trimTrailingSlash(provider.baseUrl || 'https://api.openai.com/v1'),
    apiKey: provider.apiKey || '',
    defaultModel: provider.defaultModel || 'gpt-3.5-turbo',
    enabled: provider.enabled !== false,
    createdAt: provider.createdAt || now,
    updatedAt: provider.updatedAt || now,
  };
}

function cloneSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    ai: cloneAISettings(settings.ai),
    appearance: settings.appearance ? { ...settings.appearance } : undefined,
  };
}

function cloneAISettings(settings: AISettings): AISettings {
  return {
    defaultProviderId: settings.defaultProviderId,
    providers: settings.providers.map(provider => ({ ...provider })),
  };
}

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
