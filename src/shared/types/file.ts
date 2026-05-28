/**
 * 文件操作相关类型定义
 */

/** 文件/目录条目 */
export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

/** 对话框结果 */
export interface DialogResult {
  canceled: boolean;
  filePaths: string[];
}

/** 最近项目 */
export interface RecentProject {
  name: string;
  path: string;
  lastOpened: string;
}
/** 最近 Markdown 文档 */
export interface RecentMarkdownFile {
  name: string;
  path: string;
  workspacePath: string;
  workspaceName: string;
  modifiedAt: string;
  size: number;
}


/** Markdown/File backup entry stored under .nova/history */
export interface FileBackupEntry {
  id: string;
  filePath: string;
  fileName: string;
  backupPath: string;
  reason: string;
  createdAt: string;
  size: number;
}


/** 全局搜索结果 */
export interface WorkspaceSearchResult {
  type: 'file' | 'content';
  name: string;
  path: string;
  workspacePath: string;
  workspaceName: string;
  line?: number;
  snippet?: string;
  modifiedAt?: string;
}


/** 导出格式 */
export type ExportDocumentFormat = 'markdown' | 'html' | 'pdf';

/** 文档导出输入 */
export interface ExportDocumentInput {
  format: ExportDocumentFormat;
  defaultFileName: string;
  title?: string;
  markdown?: string;
  html?: string;
}

/** 文档导出结果 */
export interface ExportDocumentResult {
  canceled: boolean;
  filePath?: string;
}
