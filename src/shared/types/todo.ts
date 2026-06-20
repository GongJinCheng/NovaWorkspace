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
  /** 排序权重（看板拖拽用），数值越大越靠前 */
  sortOrder?: number;
  /** 任务来源：手动、AI 或文档 */
  sourceType?: 'manual' | 'ai' | 'document';
  /** 来源文档绝对路径 */
  sourceFilePath?: string;
  /** 来源文档相对当前工作区的路径，用于项目迁移后仍能定位 */
  sourceRelativePath?: string;
  /** 来源显示标题 */
  sourceTitle?: string;
  /** 来源行号，后续用于精准定位 */
  sourceLine?: number;
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
