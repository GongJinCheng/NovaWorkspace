import { ipcMain } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { workspaceStore } from '../services/workspace-store';
import * as todoStore from '../services/todo-store';
import { getAISettings } from '../services/settings-store';
import { setActiveWorkspaceRoot } from '../utils/active-workspace';
import type { OpenWorkspaceInput, SaveWorkspaceSessionInput, ProjectMeta, ProjectOverview, ProjectActivityItem, ProjectRecentDocument, UpdateProjectMetaInput } from '@shared/types/workspace';

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'release', 'build', 'out', '.next', '.cache', 'coverage']);

export function registerWorkspaceHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.WORKSPACE.LIST, async () => {
    return workspaceStore.list();
  });

  ipcMain.handle(IPC_CHANNELS.WORKSPACE.OPEN, async (_event, input: OpenWorkspaceInput) => {
    const workspace = await workspaceStore.open(input);
    setActiveWorkspaceRoot(workspace.rootPath);
    await ensureProjectMeta(workspace.rootPath, input.name || workspace.name).catch(() => null);
    return workspace;
  });

  ipcMain.handle(IPC_CHANNELS.WORKSPACE.REMOVE, async (_event, rootPath: string) => {
    return workspaceStore.remove(rootPath);
  });

  ipcMain.handle(IPC_CHANNELS.WORKSPACE.CLEAR, async () => {
    return workspaceStore.clear();
  });

  ipcMain.handle(IPC_CHANNELS.WORKSPACE.GET_SESSION, async (_event, rootPath: string) => {
    return workspaceStore.getSession(rootPath);
  });

  ipcMain.handle(IPC_CHANNELS.WORKSPACE.SAVE_SESSION, async (_event, input: SaveWorkspaceSessionInput) => {
    return workspaceStore.saveSession(input);
  });

  ipcMain.handle(IPC_CHANNELS.WORKSPACE.GET_PROJECT_META, async (_event, rootPath: string) => {
    return ensureProjectMeta(rootPath);
  });

  ipcMain.handle(IPC_CHANNELS.WORKSPACE.UPDATE_PROJECT_META, async (_event, input: UpdateProjectMetaInput) => {
    const rootPath = path.resolve(input.rootPath);
    const current = await ensureProjectMeta(rootPath);
    const next: ProjectMeta = {
      ...current,
      name: typeof input.name === 'string' && input.name.trim() ? input.name.trim() : current.name,
      description: typeof input.description === 'string' ? input.description.trim() : current.description,
      updatedAt: new Date().toISOString(),
    };
    await writeProjectMeta(rootPath, next);
    await workspaceStore.open({ rootPath, name: next.name }).catch(() => null);
    return next;
  });

  ipcMain.handle(IPC_CHANNELS.WORKSPACE.GET_PROJECT_OVERVIEW, async (_event, rootPath: string) => {
    return buildProjectOverview(rootPath);
  });
}

async function ensureProjectMeta(rootPathInput: string, fallbackName?: string): Promise<ProjectMeta> {
  const rootPath = path.resolve(rootPathInput);
  const metaPath = getProjectMetaPath(rootPath);
  const now = new Date().toISOString();
  try {
    const raw = await fs.readFile(metaPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ProjectMeta>;
    const meta: ProjectMeta = {
      name: parsed.name?.trim() || fallbackName || path.basename(rootPath) || rootPath,
      description: typeof parsed.description === 'string' ? parsed.description : await readReadmeDescription(rootPath),
      rootPath,
      createdAt: parsed.createdAt || now,
      updatedAt: parsed.updatedAt || now,
    };
    if (parsed.rootPath !== rootPath || !parsed.name || !parsed.createdAt) await writeProjectMeta(rootPath, meta);
    return meta;
  } catch {
    const meta: ProjectMeta = {
      name: fallbackName || path.basename(rootPath) || rootPath,
      description: await readReadmeDescription(rootPath),
      rootPath,
      createdAt: now,
      updatedAt: now,
    };
    await writeProjectMeta(rootPath, meta);
    return meta;
  }
}

function getProjectMetaPath(rootPath: string): string {
  return path.join(rootPath, '.nova', 'project.json');
}

async function writeProjectMeta(rootPath: string, meta: ProjectMeta): Promise<void> {
  const metaPath = getProjectMetaPath(rootPath);
  await fs.mkdir(path.dirname(metaPath), { recursive: true });
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
}

async function readReadmeDescription(rootPath: string): Promise<string> {
  for (const name of ['README.md', 'readme.md', 'Readme.md']) {
    try {
      const raw = await fs.readFile(path.join(rootPath, name), 'utf-8');
      const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const firstText = lines.find((line) => !line.startsWith('#') && !line.startsWith('>') && !line.startsWith('```'));
      if (firstText) return firstText.slice(0, 180);
    } catch { /* ignore */ }
  }
  return '';
}

async function buildProjectOverview(rootPathInput: string): Promise<ProjectOverview> {
  const rootPath = path.resolve(rootPathInput);
  const meta = await ensureProjectMeta(rootPath);
  const docs: ProjectRecentDocument[] = [];
  const activities: ProjectActivityItem[] = [];
  let totalFiles = 0;
  let totalMarkdown = 0;
  let lastEditedAt: string | null = null;

  async function walk(dirPath: string, depth: number): Promise<void> {
    if (depth > 7) return;
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try { entries = await fs.readdir(dirPath, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const itemPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await walk(itemPath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      totalFiles += 1;
      if (!entry.name.toLowerCase().endsWith('.md')) continue;
      totalMarkdown += 1;
      try {
        const stat = await fs.stat(itemPath);
        const modifiedAt = stat.mtime.toISOString();
        if (!lastEditedAt || new Date(modifiedAt).getTime() > new Date(lastEditedAt).getTime()) lastEditedAt = modifiedAt;
        docs.push({
          name: entry.name,
          path: itemPath,
          relativePath: path.relative(rootPath, itemPath),
          modifiedAt,
          size: stat.size,
        });
        activities.push({
          id: 'doc-' + itemPath,
          type: 'document',
          title: '编辑了 ' + entry.name,
          subtitle: path.relative(rootPath, itemPath),
          targetPath: itemPath,
          createdAt: modifiedAt,
        });
      } catch { /* ignore */ }
    }
  }

  await walk(rootPath, 0);
  docs.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

  const todoData = await todoStore.readTodos(rootPath).catch(() => ({ tasks: [], categories: [] }));
  const tasks = todoData.tasks || [];
  const now = new Date();
  const pendingTasks = tasks.filter((task) => !task.completed);
  for (const task of tasks.slice().sort((a, b) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime()).slice(0, 20)) {
    activities.push({
      id: 'todo-' + task.id,
      type: 'todo',
      title: (task.completed ? '完成了 ' : '创建了 ') + task.title,
      subtitle: task.sourceTitle ? '来源：' + task.sourceTitle : '待办任务',
      targetPath: task.sourceFilePath,
      createdAt: task.completedAt || task.createdAt,
    });
  }

  const history = await scanHistory(rootPath);
  activities.push(...history.activities);

  let ai = { providerName: null as string | null, model: null as string | null, configured: false };
  try {
    const settings = await getAISettings();
    const provider = settings.providers.find((item) => item.id === settings.defaultProviderId) || settings.providers.find((item) => item.enabled) || settings.providers[0];
    ai = { providerName: provider?.name || null, model: provider?.defaultModel || null, configured: Boolean(provider?.enabled && provider?.apiKey && provider?.defaultModel) };
  } catch { /* ignore */ }

  return {
    meta,
    documentStat: { totalMarkdown, totalFiles, lastEditedAt },
    todoStat: {
      total: tasks.length,
      pending: pendingTasks.length,
      completed: tasks.filter((task) => task.completed).length,
      overdue: pendingTasks.filter((task) => isOverdue(task, now)).length,
      today: pendingTasks.filter((task) => isDueToday(task, now)).length,
    },
    historyStat: history.stat,
    recentDocuments: docs.slice(0, 8),
    activities: activities
      .filter((item) => item.createdAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 16),
    ai,
  };
}

async function scanHistory(rootPath: string): Promise<{ stat: { totalVersions: number; lastVersionAt: string | null }; activities: ProjectActivityItem[] }> {
  const historyDir = path.join(rootPath, '.nova', 'history');
  let names: string[] = [];
  try { names = await fs.readdir(historyDir); } catch { return { stat: { totalVersions: 0, lastVersionAt: null }, activities: [] }; }
  const activities: ProjectActivityItem[] = [];
  let totalVersions = 0;
  let lastVersionAt: string | null = null;
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(historyDir, name), 'utf-8');
      const item = JSON.parse(raw) as { id?: string; reason?: string; fileName?: string; filePath?: string; createdAt?: string };
      if (!item.createdAt) continue;
      totalVersions += 1;
      if (!lastVersionAt || new Date(item.createdAt).getTime() > new Date(lastVersionAt).getTime()) lastVersionAt = item.createdAt;
      activities.push({
        id: 'history-' + (item.id || name),
        type: 'history',
        title: item.reason || '保存了历史版本',
        subtitle: item.fileName || (item.filePath ? path.basename(item.filePath) : '版本历史'),
        targetPath: item.filePath,
        createdAt: item.createdAt,
      });
    } catch { /* ignore */ }
  }
  return { stat: { totalVersions, lastVersionAt }, activities };
}

function isOverdue(task: { dueDate?: string }, now = new Date()): boolean {
  if (!task.dueDate) return false;
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return due < start;
}

function isDueToday(task: { dueDate?: string }, now = new Date()): boolean {
  if (!task.dueDate) return false;
  const due = new Date(task.dueDate);
  return !Number.isNaN(due.getTime()) && due.toDateString() === now.toDateString();
}
