import path from 'path';
import { app } from 'electron';

/** 获取待办数据文件路径。
 * 有工作区时，待办保存到当前工作区的 .nova/todos.json；
 * 没有工作区时，退回到应用级全局 todos.json。
 */
export function getTodoDataPath(workspaceRoot?: string | null): string {
  if (workspaceRoot && typeof workspaceRoot === 'string' && workspaceRoot.trim()) {
    return path.join(workspaceRoot, '.nova', 'todos.json');
  }
  return path.join(app.getPath('userData'), 'todos.json');
}

/** 旧版本全局待办数据路径，用于后续迁移或无工作区场景。 */
export function getLegacyTodoDataPath(): string {
  return path.join(app.getPath('userData'), 'todos.json');
}

/** 获取设置数据文件路径 */
export function getSettingsDataPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

/** 获取 preload 脚本路径 */
export function getPreloadPath(): string {
  return path.join(__dirname, '..', 'preload', 'index.js');
}

/** 获取 index.html 路径 */
export function getIndexPath(): string {
  return path.join(__dirname, '..', '..', 'index.html');
}
