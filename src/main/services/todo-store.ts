import fs from 'fs/promises';
import { TodoData, TodoTask, TodoCategory } from '@shared/types/todo';
import { generateId } from '@shared/utils/id';
import { getTodoDataPath } from '../utils/paths';

const EMPTY_DATA: TodoData = { categories: [], tasks: [] };

/** 读取待办数据 */
export async function readTodos(): Promise<TodoData> {
  try {
    const data = await fs.readFile(getTodoDataPath(), 'utf-8');
    return JSON.parse(data) as TodoData;
  } catch {
    return { ...EMPTY_DATA };
  }
}

/** 写入待办数据 */
export async function writeTodos(data: TodoData): Promise<void> {
  await fs.writeFile(getTodoDataPath(), JSON.stringify(data, null, 2), 'utf-8');
}

/** 添加任务 */
export async function addTask(task: Omit<TodoTask, 'id' | 'createdAt' | 'completed'>): Promise<TodoTask> {
  const data = await readTodos();
  const newTask: TodoTask = {
    ...task,
    id: generateId(),
    createdAt: new Date().toISOString(),
    completed: false,
  };
  data.tasks.push(newTask);
  await writeTodos(data);
  return newTask;
}

/** 更新任务 */
export async function updateTask(taskId: string, updates: Partial<TodoTask>): Promise<TodoTask | null> {
  const data = await readTodos();
  const idx = data.tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return null;
  Object.assign(data.tasks[idx], updates);
  await writeTodos(data);
  return data.tasks[idx];
}

/** 删除任务 */
export async function deleteTask(taskId: string): Promise<boolean> {
  const data = await readTodos();
  data.tasks = data.tasks.filter(t => t.id !== taskId);
  await writeTodos(data);
  return true;
}

/** 添加分类 */
export async function addCategory(category: Omit<TodoCategory, 'id'>): Promise<TodoCategory> {
  const data = await readTodos();
  const newCategory: TodoCategory = { ...category, id: generateId() };
  data.categories.push(newCategory);
  await writeTodos(data);
  return newCategory;
}

/** 删除分类 */
export async function deleteCategory(categoryId: string): Promise<boolean> {
  const data = await readTodos();
  data.categories = data.categories.filter(c => c.id !== categoryId);
  await writeTodos(data);
  return true;
}

/** 检查即将到期的提醒 */
export async function checkReminders(): Promise<TodoTask[]> {
  const data = await readTodos();
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 60 * 1000);
  const alerts = data.tasks.filter(t => {
    if (t.completed || t.reminded || !t.dueDate) return false;
    const due = new Date(t.dueDate);
    return due > now && due <= soon;
  });
  for (const t of alerts) t.reminded = true;
  if (alerts.length > 0) await writeTodos(data);
  return alerts;
}
