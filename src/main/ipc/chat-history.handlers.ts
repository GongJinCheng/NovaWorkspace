import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import type { Conversation } from '@shared/types/chat-history';
import * as chatHistoryStore from '../services/chat-history-store';

export function registerChatHistoryHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CHAT_HISTORY.LIST, async (_event, workspaceRoot?: string | null) => {
    return await chatHistoryStore.listConversations(workspaceRoot);
  });

  ipcMain.handle(IPC_CHANNELS.CHAT_HISTORY.GET, async (_event, conversationId: string, workspaceRoot?: string | null) => {
    return await chatHistoryStore.getConversation(conversationId, workspaceRoot);
  });

  ipcMain.handle(IPC_CHANNELS.CHAT_HISTORY.SAVE, async (_event, conversation: Conversation, workspaceRoot?: string | null) => {
    return await chatHistoryStore.saveConversation(conversation, workspaceRoot);
  });

  ipcMain.handle(IPC_CHANNELS.CHAT_HISTORY.DELETE, async (_event, conversationId: string, workspaceRoot?: string | null) => {
    return await chatHistoryStore.deleteConversation(conversationId, workspaceRoot);
  });
}
