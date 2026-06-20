import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import type { CreateKnowledgeInput } from '@shared/types/knowledge';
import * as knowledgeService from '../services/knowledge-service';

export function registerKnowledgeHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.KNOWLEDGE.LIST,
    async (_event, workspaceRoot?: string | null) => {
      return await knowledgeService.listItems(workspaceRoot);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.KNOWLEDGE.GET,
    async (_event, itemId: string, workspaceRoot?: string | null) => {
      return await knowledgeService.getItem(itemId, workspaceRoot);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.KNOWLEDGE.CREATE,
    async (_event, input: CreateKnowledgeInput, workspaceRoot?: string | null) => {
      return await knowledgeService.createItem(input, workspaceRoot);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.KNOWLEDGE.DELETE,
    async (_event, itemId: string, workspaceRoot?: string | null) => {
      return await knowledgeService.deleteItem(itemId, workspaceRoot);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.KNOWLEDGE.GET_TEXT,
    async (_event, itemId: string, workspaceRoot?: string | null) => {
      return await knowledgeService.getText(itemId, workspaceRoot);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.KNOWLEDGE.UPDATE_SUMMARY,
    async (_event, itemId: string, summary: string, workspaceRoot?: string | null) => {
      return await knowledgeService.updateSummary(itemId, summary, workspaceRoot);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.KNOWLEDGE.IMPORT_PDF,
    async (_event, filePath: string, workspaceRoot?: string | null) => {
      return await knowledgeService.importPdf(filePath, workspaceRoot);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.KNOWLEDGE.IMPORT_WEB,
    async (_event, url: string, workspaceRoot?: string | null) => {
      return await knowledgeService.importWeb(url, workspaceRoot);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.KNOWLEDGE.GET_STATS,
    async (_event, workspaceRoot?: string | null) => {
      return await knowledgeService.getStats(workspaceRoot);
    }
  );
}
