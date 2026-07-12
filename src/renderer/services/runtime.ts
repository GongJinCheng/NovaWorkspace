/**
 * Typed in-renderer runtime registry.
 *
 * Replaces the `window.__*` global mutable couplings (declared previously in
 * globals.d.ts) with a module-scoped, strongly-typed service locator. Modules
 * publish shared singletons / cross-page action handlers via `setRuntime`,
 * and consume them via `getRuntime`. This removes ambient `Window` pollution
 * and gives every cross-module reference a compile-time type.
 *
 * The existing `bus` (event-based decoupling) is re-exported here so callers
 * can import both from one place.
 */

import type { FileTree } from '../pages/files/file-tree';
import type { EditorManager } from '../pages/files/editor-manager';
import type { FilesStore } from '../pages/files/files-store';
import type { AIService } from '../pages/ai/ai-service';
import { bus, BusEvents } from './bus';

export type RuntimeExportFormat = 'markdown' | 'html' | 'pdf';

export interface RuntimeRegistry {
  /** 文件树实例 */
  fileTree?: FileTree;
  /** 编辑器管理器实例 */
  editorManager?: EditorManager;
  /** 文件存储实例 */
  filesStore?: FilesStore;
  /** AI 服务实例 */
  aiService?: AIService;

  /** 打开工作区根目录 */
  openWorkspaceRoot?: (rootPath: string, options?: { restoreSession?: boolean }) => Promise<void>;
  /** 弹出文件夹选择并打开 */
  chooseWorkspaceFolder?: () => Promise<void>;
  /** 通过路径打开文件 */
  openFilePath?: (filePath: string) => Promise<void>;
  /** 获取当前活动文件快照 */
  getActiveFileSnapshot?: () => ReturnType<EditorManager['getActiveFileSnapshot']> | null;

  /** 新建文件 */
  handleNewFile?: () => void;
  /** 从模板新建文件 */
  handleNewFileFromTemplate?: (templateId: string) => void;
  /** 运行文件管理器内置 AI 工作流 */
  runFileAIWorkflow?: (workflowId: string) => void | Promise<void>;

  /** 打开指定待办任务 */
  openTodoTask?: (taskId: string) => Promise<void>;
  /** 打开指定知识库条目 */
  openKnowledgeItem?: (itemId: string) => Promise<void>;
  /** 聚焦待办快速输入框 */
  focusTodoQuickInput?: () => void;
  /** 导出项目报告 */
  exportProjectReport?: (format: RuntimeExportFormat) => void;
  /** 打开全局命令面板 */
  openCommandPalette?: () => void;
  /** 启动首次使用引导 */
  startOnboarding?: () => void;

  /** AI Studio 草稿/发送助手 */
  novaAiSendMessage?: (text: string) => Promise<string>;
  novaAiSetDraft?: (text: string) => void;
}

const registry: RuntimeRegistry = {};

export function setRuntime<K extends keyof RuntimeRegistry>(key: K, value: RuntimeRegistry[K]): void {
  registry[key] = value;
}

export function getRuntime<K extends keyof RuntimeRegistry>(key: K): RuntimeRegistry[K] | undefined {
  return registry[key];
}

export { bus, BusEvents };
