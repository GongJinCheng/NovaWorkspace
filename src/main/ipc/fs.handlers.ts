import { ipcMain, dialog, app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { getMainWindow } from '../windows/main-window';

export function registerFsHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.FS.READ_DIR, async (_event, dirPath: string) => {
    try {
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
      return await fs.readFile(filePath, 'utf-8');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法读取文件: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.WRITE_FILE, async (_event, filePath: string, content: string) => {
    try {
      await fs.writeFile(filePath, content, 'utf-8');
      return true;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法写入文件: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.CREATE_FILE, async (_event, dirPath: string, fileName: string) => {
    try {
      const filePath = path.join(dirPath, fileName);
      await fs.writeFile(filePath, '', 'utf-8');
      return filePath;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法创建文件: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.CREATE_DIR, async (_event, parentPath: string, dirName: string) => {
    try {
      const dirPath = path.join(parentPath, dirName);
      await fs.mkdir(dirPath);
      return dirPath;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法创建目录: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.DELETE_ITEM, async (_event, itemPath: string) => {
    try {
      await fs.rm(itemPath, { recursive: true, force: true });
      return true;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('无法删除: ' + msg);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS.RENAME_ITEM, async (_event, oldPath: string, newName: string) => {
    try {
      const dir = path.dirname(oldPath);
      const newPath = path.join(dir, newName);
      await fs.rename(oldPath, newPath);
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

}
