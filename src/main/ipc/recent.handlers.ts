import { ipcMain, app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import type { RecentProject } from '@shared/types/file';

const MAX_RECENT = 20;

function getDataPath(): string {
  return path.join(app.getPath('userData'), 'recent-projects.json');
}

async function loadRecent(): Promise<RecentProject[]> {
  try {
    const raw = await fs.readFile(getDataPath(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveRecent(list: RecentProject[]): Promise<void> {
  await fs.writeFile(getDataPath(), JSON.stringify(list, null, 2), 'utf-8');
}

export function registerRecentHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.RECENT.GET, async () => {
    return await loadRecent();
  });

  ipcMain.handle(IPC_CHANNELS.RECENT.ADD, async (_event, project: RecentProject) => {
    const list = await loadRecent();
    const existing = list.findIndex(p => p.path === project.path);
    if (existing !== -1) list.splice(existing, 1);
    list.unshift({ ...project, lastOpened: new Date().toISOString() });
    if (list.length > MAX_RECENT) list.length = MAX_RECENT;
    await saveRecent(list);
    return list;
  });

  ipcMain.handle(IPC_CHANNELS.RECENT.REMOVE, async (_event, projectPath: string) => {
    const list = await loadRecent();
    const filtered = list.filter(p => p.path !== projectPath);
    await saveRecent(filtered);
    return filtered;
  });

  ipcMain.handle(IPC_CHANNELS.RECENT.CLEAR, async () => {
    await saveRecent([]);
    return [];
  });
}