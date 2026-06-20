/**
 * Renderer 进程全局变量声明
 *
 * 这些变量通过 window.__xxx 挂载，用于跨模块通信。
 * 声明后可在代码中直接使用 window.__xxx，无需 (window as any)。
 */

export {};

declare global {
  interface Window {
    /** 打开全局命令面板 */
    __openCommandPalette: () => void;

    /** 导出项目报告 */
    __exportProjectReport: (format: 'markdown' | 'pdf') => void;

    /** 打开指定待办任务 */
    __openTodoTask: (taskId: string) => Promise<void>;
    __openKnowledgeItem: (itemId: string) => Promise<void>;

    /** 聚焦待办快速输入框 */
    __focusTodoQuickInput: () => void;

    /** 文件树实例 */
    __fileTree: import('./pages/files/file-tree').FileTree | undefined;

    /** 编辑器管理器实例 */
    __editorManager: import('./pages/files/editor-manager').EditorManager | undefined;

    /** 文件存储实例 */
    __filesStore: import('./pages/files/files-store').FilesStore | undefined;

    /** 打开工作区根目录 */
    __openWorkspaceRoot: () => Promise<void>;

    /** 弹出文件夹选择并打开 */
    __chooseWorkspaceFolder: () => Promise<void>;

    /** 通过路径打开文件 */
    __openFilePath: (filePath: string) => Promise<void>;

    /** 获取当前活动文件快照 */
    __getActiveFileSnapshot: () => ReturnType<import('./pages/files/editor-manager').EditorManager['getActiveFileSnapshot']> | null;

    /** 新建文件 */
    __handleNewFile: () => void;

    /** 从模板新建文件 */
    __handleNewFileFromTemplate: (templateId: string) => void;

    /** AI 服务实例 */
    aiService: import('./pages/ai/ai-service').AIService;
  }
}
