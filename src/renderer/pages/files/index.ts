/**
 * Files Page - orchestrates file tree, editor tabs, and file operations.
 */
import { FileTree } from './file-tree';
import { EditorManager } from './editor-manager';
import { FilesStore } from './files-store';
import { ipcClient } from '../../services/ipc-client';
import { registerPageInit, PageId } from '../../app/router';
import { showInputPrompt } from '../../components/modal';

const store = new FilesStore();
let fileTree: FileTree | null = null;
let editorManager: EditorManager | null = null;

function getTargetDir(): string | null {
  return fileTree?.getCreateTargetDir() ?? store.getCreateTargetDir();
}

async function handleNewFile(): Promise<void> {
  console.debug('[Files] new-file click');
  const dir = getTargetDir();
  if (!dir) {
    alert('请先打开一个文件夹');
    return;
  }

  const name = await showInputPrompt('New File', '输入文件名');
  if (!name?.trim()) return;

  try {
    const filePath = await ipcClient.fs.createFile(dir, name.trim());
    console.log('[Files] Created file:', filePath);
    await fileTree?.render();
    if (editorManager && filePath) {
      await editorManager.openFile(filePath, name.trim());
    }
  } catch (err) {
    console.error('[Files] Create file failed:', err);
    alert('创建文件失败: ' + (err instanceof Error ? err.message : String(err)));
  }
}

async function handleNewFolder(): Promise<void> {
  console.debug('[Files] new-folder click');
  const dir = getTargetDir();
  if (!dir) {
    alert('请先打开一个文件夹');
    return;
  }

  const name = await showInputPrompt('New Folder', '输入文件夹名');
  if (!name?.trim()) return;

  try {
    await ipcClient.fs.createDirectory(dir, name.trim());
    console.log('[Files] Created directory in:', dir);
    await fileTree?.render();
  } catch (err) {
    console.error('[Files] Create directory failed:', err);
    alert('创建文件夹失败: ' + (err instanceof Error ? err.message : String(err)));
  }
}

function bindFilesToolbar(): void {
  document.getElementById('btn-open-folder')?.addEventListener('click', () => {
    console.debug('[Files] open-folder click');
    fileTree?.openFolder();
  });
  document.getElementById('btn-open-folder-files')?.addEventListener('click', () => {
    console.debug('[Files] open-folder-files click');
    fileTree?.openFolder();
  });
  document.getElementById('btn-new-file')?.addEventListener('click', () => handleNewFile());
  document.getElementById('btn-new-folder')?.addEventListener('click', () => handleNewFolder());
  document.getElementById('btn-ai-format-toolbar')?.addEventListener('click', async () => {
    console.debug('[Files] AI format toolbar click');
    const aiService = (window as any).aiService;
    if (!aiService?.isConfigured?.()) { alert('请先配置 AI'); return; }
    const activePath = store.getActiveFilePath();
    if (!activePath || !editorManager) { alert('请先打开一个文件'); return; }
    const editorData = editorManager.getEditorByPath(activePath);
    if (!editorData) return;
    const content = editorData.model.getValue();
    if (!content.trim()) { alert('文件内容为空'); return; }

    const btn = document.getElementById('btn-ai-format-toolbar') as HTMLButtonElement | null;
    const originalHTML = btn?.innerHTML || '';
    if (btn) { btn.disabled = true; btn.innerHTML = '...'; btn.classList.add('loading'); }

    try {
      const result = await aiService.formatMarkdown(content);
      editorData.model.setValue(result);
      if (btn) { btn.innerHTML = 'ok'; btn.classList.remove('loading'); btn.classList.add('success'); }
      setTimeout(() => {
        if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; btn.classList.remove('success'); btn.title = 'AI Format'; }
      }, 2000);
    } catch (err) {
      console.error('[Files] AI format failed:', err);
      alert('AI 格式化失败: ' + (err instanceof Error ? err.message : String(err)));
      if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; btn.classList.remove('loading'); }
    }
  });
}

function initFilesPage(): void {
  if (fileTree) return;

  const treeContainer = document.getElementById('file-tree');
  const editorContainer = document.getElementById('editor-container');
  const tabsList = document.getElementById('tabs-list');

  if (!treeContainer || !editorContainer || !tabsList) return;

  fileTree = new FileTree(treeContainer);
  editorManager = new EditorManager(editorContainer, tabsList);
  editorManager.attachStore(store);

  (window as any).__fileTree = fileTree;
  (window as any).__editorManager = editorManager;
  (window as any).__filesStore = store;

  fileTree.onFileSelect = (filePath, fileName) => {
    editorManager?.openFile(filePath, fileName);
  };

  fileTree.onFolderSelect = (folderPath) => {
    store.setSelectedFolder(folderPath);
  };

  fileTree.onFileRenamed = (oldPath, newPath, isDir) => {
    if (isDir) {
      const targets = store.getState().openTabs.filter((tabPath) => tabPath.startsWith(oldPath));
      for (const target of targets) {
        const relative = target.slice(oldPath.length);
        const updatedPath = newPath + relative;
        const updatedName = updatedPath.split(/[/\\\\]/).pop() || target;
        editorManager?.renameTab(target, updatedPath, updatedName);
      }
      return;
    }

    const fileName = newPath.split(/[/\\\\]/).pop() || '';
    editorManager?.renameTab(oldPath, newPath, fileName);
  };

  fileTree.onFileDeleted = (itemPath, isDir) => {
    if (isDir) {
      const deletedPaths = store.closeFilesUnderDir(itemPath);
      editorManager?.closeTabsForDeletedPaths(deletedPaths);
      return;
    }

    editorManager?.closeTab(itemPath, { force: true });
  };

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      editorManager?.saveFile();
    }
  });

  const workspaceRoot = fileTree.getWorkspaceRoot();
  if (workspaceRoot) store.setWorkspaceRoot(workspaceRoot);

  console.log('[Files] page initialized');
}

bindFilesToolbar();
(window as any).__handleNewFile = handleNewFile;

registerPageInit('files' as PageId, initFilesPage);

export { initFilesPage, fileTree, editorManager, store };