/**
 * 待办任务数据类型定义
 */

/** 子任务 */
export interface Subtask {
  id: string;
  text: string;
  done: boolean;
}

/** 优先级 */
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

/** 待办任务 */
export interface TodoTask {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  categoryId: string;
  dueDate: string;
  subtasks: Subtask[];
  completed: boolean;
  reminded: boolean;
  createdAt: string;
  completedAt?: string;
}

/** 待办分类 */
export interface TodoCategory {
  id: string;
  name: string;
  color: string;
}

/** 待办数据（持久化结构） */
export interface TodoData {
  categories: TodoCategory[];
  tasks: TodoTask[];
}

/** 创建任务时的输入（不含自动生成字段） */
export type CreateTaskInput = Omit<TodoTask, 'id' | 'createdAt' | 'completed'>;

/** 更新任务时的输入 */
export type UpdateTaskInput = Partial<TodoTask>;
