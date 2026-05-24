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