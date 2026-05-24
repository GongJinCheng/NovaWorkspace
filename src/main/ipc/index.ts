import { registerWindowHandlers } from './window.handlers';
import { registerFsHandlers } from './fs.handlers';
import { registerTodoHandlers } from './todo.handlers';
import { registerRecentHandlers } from './recent.handlers';

/** 注册所有 IPC handlers */
export function registerAllHandlers(): void {
  registerWindowHandlers();
  registerFsHandlers();
  registerTodoHandlers();
  registerRecentHandlers();
}