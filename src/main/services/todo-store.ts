import fs from 'fs/promises';
import path from 'path';
import { TodoData, TodoTask, TodoCategory } from '@shared/types/todo';
import { generateId } from '@shared/utils/id';
import { getTodoDataPath } from '../utils/paths';

const EMPTY_DATA: TodoData = { categories: [], tasks: [] };

let cachedData: TodoData | null = null;
let writeQueue: Promise<void> = Promise.resolve();

/** 读取待办数据。主进程缓存一份，避免每次点击都重新读磁盘。 */
export async function readTodos(): Promise<TodoData> {
  if (cachedData) return cloneData(cachedData);

  try {
    const data = await fs.readFile(getTodoDataPath(), 'utf-8');
    cachedData = normalizeData(JSON.parse(data) as TodoData);
  } catch {
    cachedData = { ...EMPTY_DATA, categories: [], tasks: [] };
  }

  return cloneData(cachedData);
}

/** 写入待办数据。使用队列 + 原子替换，减少并发写入造成的数据损坏风险。 */
export async function writeTodos(data: TodoData): Promise<void> {
  cachedData = normalizeData(data);
  await enqueueAtomicWrite(cachedData);
}

/** 添加任务 */
export async function addTask(task: Omit<TodoTask, 'id' | 'createdAt' | 'completed'>): Promise<TodoTask> {
  const data = await getMutableData();
  const newTask: TodoTask = {
    ...task,
    id: generateId(),
    createdAt: new Date().toISOString(),
    completed: false,
  };
  data.tasks.push(newTask);
  await enqueueAtomicWrite(data);
  return { ...newTask };
}

/** 更新任务 */
export async function updateTask(taskId: string, updates: Partial<TodoTask>): Promise<TodoTask | null> {
  const data = await getMutableData();
  const idx = data.tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return null;

  data.tasks[idx] = { ...data.tasks[idx], ...updates };
  await enqueueAtomicWrite(data);
  return { ...data.tasks[idx] };
}

/** 删除任务 */
export async function deleteTask(taskId: string): Promise<boolean> {
  const data = await getMutableData();
  const before = data.tasks.length;
  data.tasks = data.tasks.filter(t => t.id !== taskId);
  if (data.tasks.length !== before) {
    await enqueueAtomicWrite(data);
  }
  return true;
}

/** 添加分类 */
export async function addCategory(category: Omit<TodoCategory, 'id'>): Promise<TodoCategory> {
  const data = await getMutableData();
  const newCategory: TodoCategory = { ...category, id: generateId() };
  data.categories.push(newCategory);
  await enqueueAtomicWrite(data);
  return { ...newCategory };
}

/** 删除分类 */
export async function deleteCategory(categoryId: string): Promise<boolean> {
  const data = await getMutableData();
  const before = data.categories.length;
  data.categories = data.categories.filter(c => c.id !== categoryId);
  if (data.categories.length !== before) {
    await enqueueAtomicWrite(data);
  }
  return true;
}

/** 检查即将到期的提醒 */
export async function checkReminders(): Promise<TodoTask[]> {
  const data = await getMutableData();
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 60 * 1000);
  const alerts = data.tasks.filter(t => {
    if (t.completed || t.reminded || !t.dueDate) return false;
    const due = new Date(t.dueDate);
    return due > now && due <= soon;
  });

  for (const task of alerts) task.reminded = true;
  if (alerts.length > 0) await enqueueAtomicWrite(data);
  return alerts.map(task => ({ ...task }));
}

async function getMutableData(): Promise<TodoData> {
  if (!cachedData) {
    await readTodos();
  }
  cachedData = normalizeData(cachedData || EMPTY_DATA);
  return cachedData;
}

function enqueueAtomicWrite(data: TodoData): Promise<void> {
  const snapshot = JSON.stringify(normalizeData(data), null, 2);
  writeQueue = writeQueue.then(() => atomicWrite(snapshot));
  return writeQueue;
}

async function atomicWrite(serializedData: string): Promise<void> {
  const dataPath = getTodoDataPath();
  const dir = path.dirname(dataPath);
  const tempPath = `${dataPath}.${process.pid}.tmp`;

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tempPath, serializedData, 'utf-8');
  await fs.rename(tempPath, dataPath);
}

function normalizeData(data: TodoData): TodoData {
  return {
    categories: Array.isArray(data?.categories) ? data.categories : [],
    tasks: Array.isArray(data?.tasks) ? data.tasks : [],
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
