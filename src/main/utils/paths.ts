import path from 'path';
import { app } from 'electron';

/** 获取待办数据文件路径 */
export function getTodoDataPath(): string {
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
