/**
 * Todo 数据校验 Schema
 * 用于 main 进程验证 IPC 输入
 */
import { Priority } from '../types/todo';

const VALID_PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent'];

/** 校验任务标题 */
export function isValidTitle(title: unknown): title is string {
  return typeof title === 'string' && title.trim().length > 0 && title.length <= 500;
}

/** 校验优先级 */
export function isValidPriority(priority: unknown): priority is Priority {
  return typeof priority === 'string' && VALID_PRIORITIES.includes(priority as Priority);
}

/** 校验日期字符串 */
export function isValidDate(date: unknown): date is string {
  if (typeof date !== 'string' || date === '') return true; // 空日期允许
  return !isNaN(Date.parse(date));
}

/** 校验创建任务输入 */
export function validateCreateTaskInput(input: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!isValidTitle(input.title)) errors.push('title 无效');
  if (!isValidPriority(input.priority)) errors.push('priority 无效');
  if (!isValidDate(input.dueDate)) errors.push('dueDate 无效');
  return errors;
}
