import fs from 'fs/promises';
import path from 'path';
import { TodoData, TodoTask, TodoCategory } from '@shared/types/todo';
import { generateId } from '@shared/utils/id';
import { getTodoDataPath } from '../utils/paths';

const EMPTY_DATA: TodoData = { categories: [], tasks: [] };

type StoreBucket = {
  cachedData: TodoData | null;
  writeQueue: Promise<void>;
};

const buckets = new Map<string, StoreBucket>();

/** 读取待办数据。支持按工作区隔离；无工作区时使用全局待办。 */
export async function readTodos(workspaceRoot?: string | null): Promise<TodoData> {
  const bucket = getBucket(workspaceRoot);
  if (bucket.cachedData) return cloneData(bucket.cachedData);

  try {
    const data = await fs.readFile(getTodoDataPath(workspaceRoot), 'utf-8');
    bucket.cachedData = normalizeData(JSON.parse(data) as TodoData);
  } catch {
    bucket.cachedData = { ...EMPTY_DATA, categories: [], tasks: [] };
  }

  return cloneData(bucket.cachedData);
}

/** 写入待办数据。使用队列 + 原子替换，减少并发写入造成的数据损坏风险。 */
export async function writeTodos(data: TodoData, workspaceRoot?: string | null): Promise<void> {
  const bucket = getBucket(workspaceRoot);
  bucket.cachedData = normalizeData(data);
  await enqueueAtomicWrite(bucket, bucket.cachedData, workspaceRoot);
}

/** 添加任务 */
export async function addTask(task: Omit<TodoTask, 'id' | 'createdAt' | 'completed'>, workspaceRoot?: string | null): Promise<TodoTask> {
  const data = await getMutableData(workspaceRoot);
  const newTask: TodoTask = {
    ...task,
    sourceRelativePath: task.sourceRelativePath || makeRelativePath(workspaceRoot, task.sourceFilePath),
    id: generateId(),
    createdAt: new Date().toISOString(),
    completed: false,
  };
  data.tasks.push(newTask);
  await enqueueAtomicWrite(getBucket(workspaceRoot), data, workspaceRoot);
  return { ...newTask };
}

/** 更新任务 */
export async function updateTask(taskId: string, updates: Partial<TodoTask>, workspaceRoot?: string | null): Promise<TodoTask | null> {
  const data = await getMutableData(workspaceRoot);
  const idx = data.tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return null;

  data.tasks[idx] = {
    ...data.tasks[idx],
    ...updates,
    sourceRelativePath: updates.sourceRelativePath || makeRelativePath(workspaceRoot, updates.sourceFilePath) || data.tasks[idx].sourceRelativePath,
  };
  await enqueueAtomicWrite(getBucket(workspaceRoot), data, workspaceRoot);
  return { ...data.tasks[idx] };
}

/** 删除任务 */
export async function deleteTask(taskId: string, workspaceRoot?: string | null): Promise<boolean> {
  const data = await getMutableData(workspaceRoot);
  const before = data.tasks.length;
  data.tasks = data.tasks.filter(t => t.id !== taskId);
  if (data.tasks.length !== before) {
    await enqueueAtomicWrite(getBucket(workspaceRoot), data, workspaceRoot);
  }
  return true;
}

/** 添加分类 */
export async function addCategory(category: Omit<TodoCategory, 'id'>, workspaceRoot?: string | null): Promise<TodoCategory> {
  const data = await getMutableData(workspaceRoot);
  const newCategory: TodoCategory = { ...category, id: generateId() };
  data.categories.push(newCategory);
  await enqueueAtomicWrite(getBucket(workspaceRoot), data, workspaceRoot);
  return { ...newCategory };
}

/** 删除分类 */
export async function deleteCategory(categoryId: string, workspaceRoot?: string | null): Promise<boolean> {
  const data = await getMutableData(workspaceRoot);
  const before = data.categories.length;
  data.categories = data.categories.filter(c => c.id !== categoryId);
  if (data.categories.length !== before) {
    await enqueueAtomicWrite(getBucket(workspaceRoot), data, workspaceRoot);
  }
  return true;
}

/** 检查即将到期的提醒 */
export async function checkReminders(workspaceRoot?: string | null): Promise<TodoTask[]> {
  const data = await getMutableData(workspaceRoot);
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 60 * 1000);
  const alerts = data.tasks.filter(t => {
    if (t.completed || t.reminded || !t.dueDate) return false;
    const due = new Date(t.dueDate);
    return due > now && due <= soon;
  });

  for (const task of alerts) task.reminded = true;
  if (alerts.length > 0) await enqueueAtomicWrite(getBucket(workspaceRoot), data, workspaceRoot);
  return alerts.map(task => ({ ...task }));
}

/** 清空某个工作区缓存。切换工作区或调试时可用。 */
export function invalidateTodoCache(workspaceRoot?: string | null): void {
  buckets.delete(getBucketKey(workspaceRoot));
}

async function getMutableData(workspaceRoot?: string | null): Promise<TodoData> {
  const bucket = getBucket(workspaceRoot);
  if (!bucket.cachedData) {
    await readTodos(workspaceRoot);
  }
  bucket.cachedData = normalizeData(bucket.cachedData || EMPTY_DATA);
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

function enqueueAtomicWrite(bucket: StoreBucket, data: TodoData, workspaceRoot?: string | null): Promise<void> {
  const snapshot = JSON.stringify(normalizeData(data), null, 2);
  bucket.writeQueue = bucket.writeQueue.then(() => atomicWrite(snapshot, workspaceRoot));
  return bucket.writeQueue;
}

async function atomicWrite(serializedData: string, workspaceRoot?: string | null): Promise<void> {
  const dataPath = getTodoDataPath(workspaceRoot);
  const dir = path.dirname(dataPath);
  const tempPath = `${dataPath}.${process.pid}.tmp`;

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tempPath, serializedData, 'utf-8');
  await fs.rename(tempPath, dataPath);
}

function normalizeData(data: TodoData): TodoData {
  return {
    categories: Array.isArray(data?.categories) ? data.categories : [],
    tasks: Array.isArray(data?.tasks) ? data.tasks.map(task => ({
      ...task,
      subtasks: Array.isArray(task.subtasks) ? task.subtasks : [],
    })) : [],
  };
}

function cloneData(data: TodoData): TodoData {
  return {
    categories: data.categories.map(category => ({ ...category })),
    tasks: data.tasks.map(task => ({
      ...task,
      subtasks: Array.isArray(task.subtasks) ? task.subtasks.map(subtask => ({ ...subtask })) : [],
    })),
  };
}

function makeRelativePath(workspaceRoot?: string | null, filePath?: string): string | undefined {
  if (!workspaceRoot || !filePath) return undefined;
  try {
    const relative = path.relative(workspaceRoot, filePath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return undefined;
    return relative.replace(/\\/g, '/');
  } catch {
    return undefined;
  }
}
