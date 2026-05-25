import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { OpenWorkspaceInput, SaveWorkspaceSessionInput, Workspace, WorkspaceSession } from '@shared/types/workspace';

const MAX_WORKSPACES = 50;

interface WorkspaceStoreData {
  workspaces: Workspace[];
  sessions: Record<string, WorkspaceSession>;
}

const DEFAULT_DATA: WorkspaceStoreData = {
  workspaces: [],
  sessions: {},
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getDataPath(): string {
  return path.join(app.getPath('userData'), 'workspaces.json');
}

function getWorkspaceId(rootPath: string): string {
  return crypto.createHash('sha1').update(path.resolve(rootPath).toLowerCase()).digest('hex').slice(0, 16);
}

function getWorkspaceName(rootPath: string): string {
  return path.basename(rootPath) || rootPath;
}

function normalizeData(raw: unknown): WorkspaceStoreData {
  if (!raw || typeof raw !== 'object') return clone(DEFAULT_DATA);
  const data = raw as Partial<WorkspaceStoreData>;
  return {
    workspaces: Array.isArray(data.workspaces) ? data.workspaces.filter(Boolean) as Workspace[] : [],
    sessions: data.sessions && typeof data.sessions === 'object' ? data.sessions as Record<string, WorkspaceSession> : {},
  };
}

async function readData(): Promise<WorkspaceStoreData> {
  try {
    const raw = await fs.readFile(getDataPath(), 'utf-8');
    return normalizeData(JSON.parse(raw));
  } catch {
    return clone(DEFAULT_DATA);
  }
}

let writeQueue: Promise<void> = Promise.resolve();

function queueWrite(data: WorkspaceStoreData): Promise<void> {
  const snapshot = clone(data);
  writeQueue = writeQueue.then(async () => {
    const filePath = getDataPath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmpPath = filePath + '.tmp';
    await fs.writeFile(tmpPath, JSON.stringify(snapshot, null, 2), 'utf-8');
    await fs.rename(tmpPath, filePath);
  });
  return writeQueue;
}

export class WorkspaceStore {
  async list(): Promise<Workspace[]> {
    const data = await readData();
    return clone(data.workspaces).sort((a, b) => new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime());
  }

  async open(input: OpenWorkspaceInput): Promise<Workspace> {
    const rootPath = path.resolve(input.rootPath);
    const now = new Date().toISOString();
    const data = await readData();
    const id = getWorkspaceId(rootPath);
    const existingIndex = data.workspaces.findIndex((workspace) => workspace.id === id || workspace.rootPath === rootPath);
    const existing = existingIndex >= 0 ? data.workspaces[existingIndex] : null;
    const workspace: Workspace = {
      id,
      name: input.name?.trim() || existing?.name || getWorkspaceName(rootPath),
      rootPath,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      lastOpened: now,
    };

    if (existingIndex >= 0) {
      data.workspaces.splice(existingIndex, 1);
    }
    data.workspaces.unshift(workspace);
    if (data.workspaces.length > MAX_WORKSPACES) {
      const removed = data.workspaces.splice(MAX_WORKSPACES);
      for (const item of removed) delete data.sessions[item.id];
    }

    if (!data.sessions[id]) {
      data.sessions[id] = {
        workspaceId: id,
        rootPath,
        openTabs: [],
        activeFilePath: null,
        selectedFolderPath: rootPath,
        favorites: [],
        updatedAt: now,
      };
    }

    await queueWrite(data);
    return clone(workspace);
  }

  async remove(rootPath: string): Promise<Workspace[]> {
    const normalizedRoot = path.resolve(rootPath);
    const data = await readData();
    const id = getWorkspaceId(normalizedRoot);
    data.workspaces = data.workspaces.filter((workspace) => workspace.id !== id && workspace.rootPath !== normalizedRoot);
    delete data.sessions[id];
    await queueWrite(data);
    return this.list();
  }

  async clear(): Promise<Workspace[]> {
    await queueWrite(clone(DEFAULT_DATA));
    return [];
  }

  async getSession(rootPath: string): Promise<WorkspaceSession | null> {
    const normalizedRoot = path.resolve(rootPath);
    const id = getWorkspaceId(normalizedRoot);
    const data = await readData();
    const session = data.sessions[id];
    return session ? clone(session) : null;
  }

  async saveSession(input: SaveWorkspaceSessionInput): Promise<WorkspaceSession> {
    const rootPath = path.resolve(input.rootPath);
    const now = new Date().toISOString();
    const data = await readData();
    const id = getWorkspaceId(rootPath);
    const session: WorkspaceSession = {
      workspaceId: id,
      rootPath,
      openTabs: Array.from(new Set(input.openTabs || [])),
      activeFilePath: input.activeFilePath || null,
      selectedFolderPath: input.selectedFolderPath || rootPath,
      favorites: Array.from(new Set(input.favorites || [])),
      updatedAt: now,
    };

    data.sessions[id] = session;

    const workspaceIndex = data.workspaces.findIndex((workspace) => workspace.id === id || workspace.rootPath === rootPath);
    if (workspaceIndex >= 0) {
      data.workspaces[workspaceIndex] = {
        ...data.workspaces[workspaceIndex],
        updatedAt: now,
      };
    } else {
      data.workspaces.unshift({
        id,
        name: getWorkspaceName(rootPath),
        rootPath,
        createdAt: now,
        updatedAt: now,
        lastOpened: now,
      });
    }

    await queueWrite(data);
    return clone(session);
  }
}

export const workspaceStore = new WorkspaceStore();
