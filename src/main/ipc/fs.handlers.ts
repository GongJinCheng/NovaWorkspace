import { ipcMain, dialog, app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { getMainWindow } from '../windows/main-window';
import { handleExportDocument } from '../services/export-service';
import { getActiveWorkspaceRoot } from '../utils/active-workspace';
import {
  searchWorkspace as indexSearch,
  updateFileInIndex,
  removeFileFromIndex,
  renameFileInIndex,
} from '../services/search-index';


function normalizePathForCompare(value: string): string {
  return path.resolve(value).replace(/\\/g, '/').toLowerCase();
}

function ensureInsideWorkspace(workspaceRoot: string, targetPath: string): void {
  const root = normalizePathForCompare(workspaceRoot);
  const target = normalizePathForCompare(targetPath);
  if (target !== root && !target.startsWith(root + '/')) {
    throw new Error('目标文件不在当前工作区内');
  }
}

function safeHistoryName(filePath: string, workspaceRoot: string): string {
  const relative = path.relative(workspaceRoot, filePath) || path.basename(filePath);
  return relative.replace(/[\\/:*?"<>|]+/g, '__').replace(/\s+/g, '_');
}

function timestampForFileName(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

/**
 * Validates that the target path is inside the active workspace.
 * Silently skips when no workspace is active (e.g. before any workspace is opened).
 */
function ensureInsideActiveWorkspace(targetPath: string): void {
  const root = getActiveWorkspaceRoot();
  if (!root) throw new Error('请先打开一个工作区');
  ensureInsideWorkspace(root, targetPath);
}

/** 图片读取：允许工作区内或应用临时目录，避免任意文件读。 */
function ensureInsideActiveWorkspaceOrTemp(targetPath: string): void {
  const root = getActiveWorkspaceRoot();
  if (root) {
    try {
      ensureInsideWorkspace(root, targetPath);
      return;
    } catch {
      // 不在工作区内，继续尝试临时目录
    }
  }
  ensureInsideWorkspace(app.getPath('temp'), targetPath);
}


const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
};

function getImageMimeType(filePath: string): string | null {
  return IMAGE_MIME_BY_EXT[path.extname(filePath).toLowerCase()] || null;
}






export function registerFsHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.FS.READ_DIR, async (_event, dirPath: string) => {
    try {
      ensureInsideActiveWorkspace(dirPath);
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries.map(entry => ({
        name: entry.name,
        path: path.join(dirPath, entry.name),
        isDirectory: entry.isDirectory(),
      }));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法读取目录: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.READ_FILE, async (_event, filePath: string) => {
    try {
      ensureInsideActiveWorkspace(filePath);
      return await fs.readFile(filePath, 'utf-8');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法读取文件: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.WRITE_FILE, async (_event, filePath: string, content: string) => {
    try {
      ensureInsideActiveWorkspace(filePath);
      await fs.writeFile(filePath, content, 'utf-8');
      void updateFileInIndex(filePath);
      return true;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法写入文件: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.CREATE_FILE, async (_event, dirPath: string, fileName: string) => {
    try {
      const filePath = path.join(dirPath, fileName);
      ensureInsideActiveWorkspace(filePath);
      await fs.writeFile(filePath, '', 'utf-8');
      void updateFileInIndex(filePath);
      return filePath;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法创建文件: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.CREATE_DIR, async (_event, parentPath: string, dirName: string) => {
    try {
      const dirPath = path.join(parentPath, dirName);
      ensureInsideActiveWorkspace(dirPath);
      await fs.mkdir(dirPath);
      return dirPath;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法创建目录: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.DELETE_ITEM, async (_event, itemPath: string) => {
    try {
      ensureInsideActiveWorkspace(itemPath);
      await fs.rm(itemPath, { recursive: true, force: true });
      void removeFileFromIndex(itemPath);
      return true;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法删除: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.RENAME_ITEM, async (_event, oldPath: string, newName: string) => {
    try {
      ensureInsideActiveWorkspace(oldPath);
      const dir = path.dirname(oldPath);
      const newPath = path.join(dir, newName);
      await fs.rename(oldPath, newPath);
      void renameFileInIndex(oldPath, newPath);
      return newPath;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法重命名: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.GET_HOME, () => {
    return app.getPath('home');
  });

  ipcMain.handle(IPC_CHANNELS.FS.SHOW_OPEN_DIALOG, async (_event, options: Record<string, unknown>) => {
    const win = getMainWindow();
    if (!win) return { canceled: true, filePaths: [] };
    return await dialog.showOpenDialog(win, options as Electron.OpenDialogOptions);
  });

  ipcMain.handle(IPC_CHANNELS.FS.CREATE_SAMPLE_WORKSPACE, async () => {
    try {
      const baseDir = path.join(app.getPath('documents'), 'Nova 示例工作区');
      let workspacePath = baseDir;
      let suffix = 1;
      while (true) {
        try {
          await fs.access(workspacePath);
          suffix += 1;
          workspacePath = `${baseDir} ${suffix}`;
        } catch {
          break;
        }
      }

      await fs.mkdir(path.join(workspacePath, '资料'), { recursive: true });
      await fs.mkdir(path.join(workspacePath, '.nova'), { recursive: true });
      const now = new Date().toISOString();

      const files: Array<{ name: string; content: string }> = [
        {
          name: 'README.md',
          content: `# Nova 示例工作区\n\n欢迎使用 Nova。这个示例工作区用于演示完整工作流：\n\n1. 打开 Markdown 文档\n2. 使用 AI 总结、提取任务或改写内容\n3. 把 AI 输出一键生成待办\n4. 回到首页查看今天要推进的事项\n\n## 推荐体验流程\n\n- 打开 \`产品想法.md\`\n- 点击工具栏里的 **生成待办**\n- 确认创建任务\n- 切换到 **待办中心** 查看任务来源\n\n> 提示：AI 功能需要先在设置中配置模型。\n`,
        },
        {
          name: '今日计划.md',
          content: `# 今日计划\n\n## 今天优先完成\n\n- [ ] 配置一个 AI Provider\n- [ ] 体验 Markdown 预览和编辑\n- [ ] 从产品想法中提取 3 个待办\n- [ ] 回到首页查看今日工作台\n\n## 记录\n\n今天的目标是熟悉 Nova 的基本工作流，把文档、AI 和待办串起来。\n`,
        },
        {
          name: '产品想法.md',
          content: `# 产品想法：AI 深度工作台\n\n## 背景\n\n很多用户同时使用 Markdown、AI Chat、Todo、文件夹和浏览器收藏，但信息分散，工作流容易断。\n\n## 目标\n\n做一款本地优先的工作台，让用户可以在一个地方完成：\n\n- 写 Markdown 文档\n- 让 AI 理解当前文档\n- 从文档中生成待办任务\n- 追踪今天需要推进的事项\n\n## MVP 功能\n\n1. 本地工作区和文件树\n2. Markdown 编辑、预览和分屏模式\n3. AI 总结当前文档\n4. AI 从文档提取待办\n5. Todo 记录来源文档\n6. 首页显示今日待办和最近项目\n\n## 下一步\n\n需要先完成首次使用引导、示例工作区、当前文档问 AI、AI 生成 Todo 这四个体验闭环。\n`,
        },
        {
          name: '会议纪要.md',
          content: `# 会议纪要\n\n## 讨论内容\n\n- 首页需要从导航页升级为今日工作台。\n- AI 回复下面需要提供插入文档、复制、生成待办等操作。\n- Todo 详情里需要显示来源文档，方便用户回到上下文。\n- AI 配置要提供 DeepSeek、通义千问、Kimi、Ollama 等预设。\n\n## 决策\n\n先做本地单人工作台，不急着做账号、云同步和团队协作。\n\n## 行动项\n\n- 设计首次欢迎页\n- 增加示例工作区按钮\n- 实现当前文档问 AI\n- 实现 AI 输出生成 Todo\n`,
        },
        {
          name: path.join('资料', '使用说明.md'),
          content: `# 使用说明\n\n## 文件管理\n\n左侧选择工作区文件，右侧进行编辑。Markdown 文件支持编辑、预览和分屏。\n\n## AI\n\n配置模型后，可以对当前文档进行总结、生成大纲、改写选中内容、提取待办。\n\n## Todo\n\n待办可记录优先级、截止时间、子任务和来源文档。\n`,
        },
      ];

      for (const item of files) {
        const filePath = path.join(workspacePath, item.name);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, item.content, 'utf-8');
      }

      await fs.writeFile(path.join(workspacePath, '.nova', 'project.json'), JSON.stringify({
        name: 'Nova 示例工作区',
        description: '用于体验 Markdown + AI + Todo 闭环的示例项目',
        createdAt: now,
        lastOpened: now,
      }, null, 2), 'utf-8');

      return workspacePath;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法创建示例工作区: ' + msg);
    }
  });


  ipcMain.handle(IPC_CHANNELS.FS.SEARCH_WORKSPACE, async (_event, input: { rootPath: string; query: string; limit?: number; filter?: { ext?: string; type?: 'file' | 'content' } }) => {
    const rootPath = path.resolve(input.rootPath || '');
    const query = String(input.query || '').trim();
    const limit = Math.min(Math.max(Number(input.limit || 60), 10), 120);
    if (!rootPath || !query) return [];

    try {
      const results = await indexSearch(rootPath, query, limit, input.filter);
      // Map to the expected WorkspaceSearchResult shape (with backward compat)
      return results.map(r => ({
        type: r.type,
        name: r.name,
        path: r.path,
        workspacePath: r.workspacePath,
        workspaceName: r.workspaceName,
        line: r.matches[0]?.line,
        snippet: r.matches[0]?.snippet,
        modifiedAt: r.modifiedAt,
        ext: r.ext,
        relativePath: r.relativePath,
        size: r.size,
        matchCount: r.matchCount,
        matches: r.matches,
        score: r.score,
      }));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[Search] index search failed:', msg);
      return [];
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.GET_RECENT_MARKDOWN, async (_event, rootPaths?: string[]) => {
    const roots = Array.from(new Set((rootPaths || []).filter((item): item is string => typeof item === 'string' && item.trim().length > 0)));
    const results: Array<{ name: string; path: string; workspacePath: string; workspaceName: string; modifiedAt: string; size: number }> = [];
    const ignored = new Set(['node_modules', '.git', '.nova', 'dist', 'release', 'build', 'out', '.next', '.cache']);

    async function walk(rootPath: string, dirPath: string, depth: number): Promise<void> {
      if (depth > 4 || results.length > 200) return;
      let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
      try {
        entries = await fs.readdir(dirPath, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (results.length > 200) return;
        if (ignored.has(entry.name)) continue;
        const itemPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          await walk(rootPath, itemPath, depth + 1);
          continue;
        }
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;
        try {
          const stat = await fs.stat(itemPath);
          results.push({
            name: entry.name,
            path: itemPath,
            workspacePath: rootPath,
            workspaceName: path.basename(rootPath) || rootPath,
            modifiedAt: stat.mtime.toISOString(),
            size: stat.size,
          });
        } catch {
          // ignore inaccessible files
        }
      }
    }

    for (const rootPath of roots.slice(0, 6)) {
      await walk(rootPath, rootPath, 0);
    }

    return results
      .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
      .slice(0, 8);
  });



  ipcMain.handle(IPC_CHANNELS.FS.CREATE_BACKUP, async (_event, input: { workspaceRoot: string; filePath: string; content: string; reason?: string }) => {
    try {
      const workspaceRoot = path.resolve(input.workspaceRoot);
      const filePath = path.resolve(input.filePath);
      ensureInsideWorkspace(workspaceRoot, filePath);

      const now = new Date();
      const id = `${timestampForFileName(now)}-${Math.random().toString(36).slice(2, 8)}`;
      const historyDir = path.join(workspaceRoot, '.nova', 'history');
      await fs.mkdir(historyDir, { recursive: true });

      const safeName = safeHistoryName(filePath, workspaceRoot);
      const backupPath = path.join(historyDir, `${safeName}.${id}.bak`);
      const metadataPath = `${backupPath}.json`;
      const content = typeof input.content === 'string' ? input.content : '';
      await fs.writeFile(backupPath, content, 'utf-8');

      const stat = await fs.stat(backupPath);
      const entry = {
        id,
        filePath,
        fileName: path.basename(filePath),
        backupPath,
        reason: input.reason || '手动保存版本',
        createdAt: now.toISOString(),
        size: stat.size,
      };
      await fs.writeFile(metadataPath, JSON.stringify(entry, null, 2), 'utf-8');
      return entry;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法创建版本备份: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.LIST_BACKUPS, async (_event, input: { workspaceRoot: string; filePath: string }) => {
    try {
      const workspaceRoot = path.resolve(input.workspaceRoot);
      const filePath = path.resolve(input.filePath);
      ensureInsideWorkspace(workspaceRoot, filePath);
      const historyDir = path.join(workspaceRoot, '.nova', 'history');
      let entries: string[] = [];
      try {
        entries = await fs.readdir(historyDir);
      } catch {
        return [];
      }

      const result: Array<{ id: string; filePath: string; fileName: string; backupPath: string; reason: string; createdAt: string; size: number }> = [];
      for (const name of entries) {
        if (!name.endsWith('.json')) continue;
        const metadataPath = path.join(historyDir, name);
        try {
          const raw = await fs.readFile(metadataPath, 'utf-8');
          const item = JSON.parse(raw);
          if (normalizePathForCompare(item.filePath) !== normalizePathForCompare(filePath)) continue;
          result.push(item);
        } catch {
          // ignore broken metadata
        }
      }
      return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 50);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法读取版本历史: ' + msg);
    }
  });


  ipcMain.handle(IPC_CHANNELS.FS.READ_BACKUP, async (_event, input: { workspaceRoot: string; backupPath: string }) => {
    try {
      const workspaceRoot = path.resolve(input.workspaceRoot);
      const backupPath = path.resolve(input.backupPath);
      const historyDir = path.join(workspaceRoot, '.nova', 'history');
      const normalizedHistoryDir = normalizePathForCompare(historyDir);
      const normalizedBackup = normalizePathForCompare(backupPath);
      if (!normalizedBackup.startsWith(normalizedHistoryDir + '/')) {
        throw new Error('备份文件不在版本历史目录内');
      }
      const content = await fs.readFile(backupPath, 'utf-8');
      return { content };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法读取版本内容: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.DELETE_BACKUP, async (_event, input: { workspaceRoot: string; backupPath: string }) => {
    try {
      const workspaceRoot = path.resolve(input.workspaceRoot);
      const backupPath = path.resolve(input.backupPath);
      const historyDir = path.join(workspaceRoot, '.nova', 'history');
      const normalizedHistoryDir = normalizePathForCompare(historyDir);
      const normalizedBackup = normalizePathForCompare(backupPath);
      if (!normalizedBackup.startsWith(normalizedHistoryDir + '/')) {
        throw new Error('备份文件不在版本历史目录内');
      }

      const metadataPath = `${backupPath}.json`;
      await fs.rm(backupPath, { force: true });
      await fs.rm(metadataPath, { force: true });
      return true;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法删除历史版本: ' + msg);
    }
  });


  ipcMain.handle(IPC_CHANNELS.FS.RESTORE_BACKUP, async (_event, input: { workspaceRoot: string; filePath: string; backupPath: string }) => {
    try {
      const workspaceRoot = path.resolve(input.workspaceRoot);
      const filePath = path.resolve(input.filePath);
      const backupPath = path.resolve(input.backupPath);
      ensureInsideWorkspace(workspaceRoot, filePath);
      const historyDir = path.join(workspaceRoot, '.nova', 'history');
      const normalizedHistoryDir = normalizePathForCompare(historyDir);
      const normalizedBackup = normalizePathForCompare(backupPath);
      if (!normalizedBackup.startsWith(normalizedHistoryDir + '/')) {
        throw new Error('备份文件不在版本历史目录内');
      }
      const content = await fs.readFile(backupPath, 'utf-8');
      await fs.writeFile(filePath, content, 'utf-8');
      return { content, restoredAt: new Date().toISOString() };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法恢复版本: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.READ_IMAGE_AS_DATA_URL, async (_event, filePath: string) => {
    try {
      const target = path.resolve(filePath.replace(/^file:\/\//i, ''));
      ensureInsideActiveWorkspaceOrTemp(target);
      const mimeType = getImageMimeType(target);
      if (!mimeType) throw new Error('只支持 PNG、JPG、JPEG、WEBP、GIF、BMP 图片');

      const stat = await fs.stat(target);
      if (!stat.isFile()) throw new Error('目标不是文件');
      const maxBytes = 20 * 1024 * 1024;
      if (stat.size > maxBytes) throw new Error('图片超过 20MB，建议先压缩后再发送给 AI');

      const buffer = await fs.readFile(target);
      return {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name: path.basename(target),
        mimeType,
        dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
        size: stat.size,
        path: target,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法读取图片: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.COPY_FILE, async (_event, input: { sourcePath: string; targetPath: string }) => {
    try {
      const sourcePath = path.resolve(input.sourcePath);
      const targetPath = path.resolve(input.targetPath);
      ensureInsideActiveWorkspace(targetPath);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.copyFile(sourcePath, targetPath);
      void updateFileInIndex(targetPath);
      return { targetPath };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法复制文件: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.WRITE_BINARY, async (_event, input: { filePath: string; base64: string }) => {
    try {
      const filePath = path.resolve(input.filePath);
      ensureInsideActiveWorkspace(filePath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const buffer = Buffer.from(input.base64, 'base64');
      await fs.writeFile(filePath, buffer);
      void updateFileInIndex(filePath);
      return { filePath };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法写入二进制文件: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.EXPORT_DOCUMENT, async (_event, input) => {
    return await handleExportDocument(input);
  });


}
