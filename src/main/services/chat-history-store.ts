import fs from 'fs/promises';
import path from 'path';
import type { Conversation, ConversationsData } from '@shared/types/chat-history';
import { generateId } from '@shared/utils/id';

const EMPTY_DATA: ConversationsData = { conversations: [] };

type StoreBucket = {
  cachedData: ConversationsData | null;
  writeQueue: Promise<void>;
};

const buckets = new Map<string, StoreBucket>();

/** Read conversations for a workspace. */
export async function readConversations(workspaceRoot?: string | null): Promise<ConversationsData> {
  const bucket = getBucket(workspaceRoot);
  if (bucket.cachedData) return cloneData(bucket.cachedData);

  try {
    const filePath = getConversationsDataPath(workspaceRoot);
    const data = await fs.readFile(filePath, 'utf-8');
    bucket.cachedData = normalizeData(JSON.parse(data) as ConversationsData);
  } catch {
    bucket.cachedData = { conversations: [] };
  }

  return cloneData(bucket.cachedData);
}

/** Save a conversation (upsert by id). */
export async function saveConversation(
  conversation: Conversation,
  workspaceRoot?: string | null
): Promise<Conversation> {
  const data = await getMutableData(workspaceRoot);
  const idx = data.conversations.findIndex(c => c.id === conversation.id);

  if (idx >= 0) {
    data.conversations[idx] = { ...conversation, updatedAt: new Date().toISOString() };
  } else {
    data.conversations.unshift({ ...conversation, updatedAt: new Date().toISOString() });
  }

  // Keep at most 100 conversations per workspace
  if (data.conversations.length > 100) {
    data.conversations = data.conversations.slice(0, 100);
  }

  await enqueueAtomicWrite(getBucket(workspaceRoot), data, workspaceRoot);
  return { ...data.conversations.find(c => c.id === conversation.id)! };
}

/** Delete a conversation by id. */
export async function deleteConversation(
  conversationId: string,
  workspaceRoot?: string | null
): Promise<boolean> {
  const data = await getMutableData(workspaceRoot);
  const before = data.conversations.length;
  data.conversations = data.conversations.filter(c => c.id !== conversationId);
  if (data.conversations.length !== before) {
    await enqueueAtomicWrite(getBucket(workspaceRoot), data, workspaceRoot);
  }
  return true;
}

/** List conversations (light metadata only, no messages). */
export async function listConversations(
  workspaceRoot?: string | null
): Promise<Array<{ id: string; title: string; createdAt: string; updatedAt: string; messageCount: number }>> {
  const data = await readConversations(workspaceRoot);
  return data.conversations.map(c => ({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    messageCount: c.messages.length,
  }));
}

/** Get a single conversation with full messages. */
export async function getConversation(
  conversationId: string,
  workspaceRoot?: string | null
): Promise<Conversation | null> {
  const data = await readConversations(workspaceRoot);
  return data.conversations.find(c => c.id === conversationId) || null;
}

/** Create a new empty conversation. */
export function createNewConversation(): Conversation {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    title: 'New Conversation',
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ── Internal helpers ──────────────────────────────────────────────

async function getMutableData(workspaceRoot?: string | null): Promise<ConversationsData> {
  const bucket = getBucket(workspaceRoot);
  if (!bucket.cachedData) {
    await readConversations(workspaceRoot);
  }
  bucket.cachedData = bucket.cachedData || { conversations: [] };
  return bucket.cachedData;
}

function getBucket(workspaceRoot?: string | null): StoreBucket {
  const key = getBucketKey(workspaceRoot);
  const existing = buckets.get(key);
  if (existing) return existing;
  const bucket: StoreBucket = { cachedData: null, writeQueue: Promise.resolve() };
  buckets.set(key, bucket);
  return bucket;
}

function getBucketKey(workspaceRoot?: string | null): string {
  return workspaceRoot && typeof workspaceRoot === 'string' && workspaceRoot.trim()
    ? path.resolve(workspaceRoot)
    : '__global__';
}

function getConversationsDataPath(workspaceRoot?: string | null): string {
  if (workspaceRoot && typeof workspaceRoot === 'string' && workspaceRoot.trim()) {
    return path.join(workspaceRoot, '.nova', 'conversations.json');
  }
  // Fallback: app-level userData (same pattern as todo-store)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'conversations.json');
}

function enqueueAtomicWrite(bucket: StoreBucket, data: ConversationsData, workspaceRoot?: string | null): Promise<void> {
  const snapshot = JSON.stringify(normalizeData(data), null, 2);
  bucket.writeQueue = bucket.writeQueue.then(() => atomicWrite(snapshot, workspaceRoot));
  return bucket.writeQueue;
}

async function atomicWrite(serializedData: string, workspaceRoot?: string | null): Promise<void> {
  const dataPath = getConversationsDataPath(workspaceRoot);
  const dir = path.dirname(dataPath);
  const tempPath = `${dataPath}.${process.pid}.tmp`;

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tempPath, serializedData, 'utf-8');
  await fs.rename(tempPath, dataPath);
}

function normalizeData(data: ConversationsData): ConversationsData {
  return {
    conversations: Array.isArray(data?.conversations) ? data.conversations.map(c => ({
      id: c.id || generateId(),
      title: c.title || 'Untitled',
      messages: Array.isArray(c.messages) ? c.messages : [],
      createdAt: c.createdAt || new Date().toISOString(),
      updatedAt: c.updatedAt || new Date().toISOString(),
    })) : [],
  };
}

function cloneData(data: ConversationsData): ConversationsData {
  return {
    conversations: data.conversations.map(c => ({
      ...c,
      messages: c.messages.map(m => ({ ...m })),
    })),
  };
}
