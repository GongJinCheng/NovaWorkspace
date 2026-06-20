import { registerWindowHandlers } from './window.handlers';
import { registerFsHandlers } from './fs.handlers';
import { registerTodoHandlers } from './todo.handlers';
import { registerRecentHandlers } from './recent.handlers';
import { registerAIHandlers } from './ai.handlers';
import { registerWorkspaceHandlers } from './workspace.handlers';
import { registerUpdateHandlers } from './update.handlers';
import { registerChatHistoryHandlers } from './chat-history.handlers';
import { registerKnowledgeHandlers } from './knowledge.handlers';
import { registerFsWatchHandlers } from './fs-watch.handlers';

/** 注册所有 IPC handlers */
export function registerAllHandlers(): void {
  registerWindowHandlers();
  registerFsHandlers();
  registerTodoHandlers();
  registerRecentHandlers();
  registerWorkspaceHandlers();
  registerUpdateHandlers();
  registerAIHandlers();
  registerChatHistoryHandlers();
  registerKnowledgeHandlers();
  registerFsWatchHandlers();
}