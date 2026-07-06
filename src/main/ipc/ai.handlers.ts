import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import type { AIChatRequest, AIProviderConfig } from '@shared/types/ai';
import * as settingsStore from '../services/settings-store';
import * as aiService from '../services/ai-service';

const streamControllers = new Map<string, AbortController>();

export function registerAIHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AI.GET_SETTINGS, async () => {
    return await settingsStore.getAISettings();
  });

  ipcMain.handle(IPC_CHANNELS.AI.SAVE_PROVIDER, async (_event, provider: AIProviderConfig) => {
    return await settingsStore.saveAIProvider(provider);
  });

  ipcMain.handle(IPC_CHANNELS.AI.DELETE_PROVIDER, async (_event, providerId: string) => {
    return await settingsStore.deleteAIProvider(providerId);
  });

  ipcMain.handle(IPC_CHANNELS.AI.SET_DEFAULT_PROVIDER, async (_event, providerId: string) => {
    return await settingsStore.setDefaultAIProvider(providerId);
  });

  ipcMain.handle(IPC_CHANNELS.AI.CHAT, async (_event, request: AIChatRequest) => {
    return await aiService.chat(request);
  });

  ipcMain.handle(IPC_CHANNELS.AI.FETCH_MODELS, async (_event, providerId?: string) => {
    return await aiService.fetchModels(providerId);
  });

  ipcMain.handle(IPC_CHANNELS.AI.TEST_CONNECTION, async (_event, providerId?: string) => {
    return await aiService.testConnection(providerId);
  });

  ipcMain.on(IPC_CHANNELS.AI.STREAM_START, (event, requestId: string, request: AIChatRequest) => {
    const controller = new AbortController();
    streamControllers.set(requestId, controller);

    // 窗口关闭即中止请求，避免向已销毁的 webContents 持续推送
    event.sender.once('destroyed', () => controller.abort());

    const safeSend = (channel: string, ...args: unknown[]): void => {
      if (!event.sender.isDestroyed()) event.sender.send(channel, requestId, ...args);
    };

    void aiService.chatStream(request, {
      onChunk: (chunk) => safeSend(IPC_CHANNELS.AI.STREAM_CHUNK, chunk),
      onDone: (fullText) => {
        streamControllers.delete(requestId);
        safeSend(IPC_CHANNELS.AI.STREAM_DONE, fullText);
      },
      onError: (error) => {
        streamControllers.delete(requestId);
        safeSend(IPC_CHANNELS.AI.STREAM_ERROR, error.message);
      },
    }, controller.signal);
  });

  ipcMain.on(IPC_CHANNELS.AI.STREAM_CANCEL, (_event, requestId: string) => {
    const controller = streamControllers.get(requestId);
    if (controller) {
      controller.abort();
      streamControllers.delete(requestId);
    }
  });
}
