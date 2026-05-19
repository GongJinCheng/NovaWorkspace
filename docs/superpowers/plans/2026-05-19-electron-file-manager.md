# Electron 文件管理器/笔记应用实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有的 Electron UI 壳改造成一个功能完整的文件管理器和 Markdown 笔记应用，支持文件浏览、文本编辑、多标签页

**Architecture:** 左侧文件树 + 右侧 Monaco Editor 的经典布局，通过 IPC 桥接实现主进程（文件系统操作）和渲染进程（UI）的通信

**Tech Stack:** Electron 35 + Monaco Editor + Node.js fs/promises + 原生 HTML/CSS/JS

---

## 文件结构

```
electron-app/
├── main.js              # 主进程：窗口管理、文件系统 IPC 处理
├── preload.js           # 预加载：安全暴露 API 给渲染进程
├── index.html           # 页面结构
├── styles.css           # 样式
├── renderer.js          # 渲染进程：UI 逻辑、编辑器初始化
├── file-tree.js         # 文件树组件逻辑
├── editor-manager.js    # 编辑器管理器（多标签页）
├── package.json         # 项目配置
└── .npmrc               # 镜像配置
```

---

## Task 1: 项目配置和依赖安装

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 更新 package.json 添加 Monaco Editor 依赖**

```json
{
  "name": "electron-file-manager",
  "version": "1.0.0",
  "description": "A file manager and note-taking app built with Electron",
  "main": "main.js",
  "scripts": {
    "start": "electron ."
  },
  "devDependencies": {
    "electron": "^35.0.0"
  },
  "dependencies": {
    "monaco-editor": "^0.52.0"
  }
}
```

- [ ] **Step 2: 安装依赖**

Run: `cd /d C:\Users\GJC\Documents\Codex\electron-app && npm install`
Expected: Monaco Editor installed successfully

- [ ] **Step 3: 验证安装**

Run: `dir node_modules\monaco-editor`
Expected: monaco-editor 目录存在

---

## Task 2: 主进程 - 文件系统 IPC 处理

**Files:**
- Modify: `main.js`

- [ ] **Step 1: 添加文件系统操作的 IPC 处理器**

在 `main.js` 中添加以下 IPC 处理器：

```javascript
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');

// ... 现有代码 ...

// 文件系统操作
ipcMain.handle('read-directory', async (event, dirPath) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.map(entry => ({
      name: entry.name,
      path: path.join(dirPath, entry.name),
      isDirectory: entry.isDirectory()
    }));
  } catch (error) {
    throw new Error(`无法读取目录: ${error.message}`);
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    throw new Error(`无法读取文件: ${error.message}`);
  }
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    await fs.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    throw new Error(`无法写入文件: ${error.message}`);
  }
});

ipcMain.handle('create-file', async (event, dirPath, fileName) => {
  try {
    const filePath = path.join(dirPath, fileName);
    await fs.writeFile(filePath, '', 'utf-8');
    return filePath;
  } catch (error) {
    throw new Error(`无法创建文件: ${error.message}`);
  }
});

ipcMain.handle('create-directory', async (event, parentPath, dirName) => {
  try {
    const dirPath = path.join(parentPath, dirName);
    await fs.mkdir(dirPath);
    return dirPath;
  } catch (error) {
    throw new Error(`无法创建目录: ${error.message}`);
  }
});

ipcMain.handle('delete-item', async (event, itemPath) => {
  try {
    await fs.rm(itemPath, { recursive: true, force: true });
    return true;
  } catch (error) {
    throw new Error(`无法删除: ${error.message}`);
  }
});

ipcMain.handle('rename-item', async (event, oldPath, newName) => {
  try {
    const dir = path.dirname(oldPath);
    const newPath = path.join(dir, newName);
    await fs.rename(oldPath, newPath);
    return newPath;
  } catch (error) {
    throw new Error(`无法重命名: ${error.message}`);
  }
});

ipcMain.handle('get-home-dir', () => {
  return app.getPath('home');
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});
```

- [ ] **Step 2: 验证代码语法**

Run: `node -c main.js`
Expected: 无语法错误

---

## Task 3: 预加载脚本 - IPC 桥接

**Files:**
- Modify: `preload.js`

- [ ] **Step 1: 更新 preload.js 暴露文件系统 API**

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  minimize: () => ipcRenderer.send('minimize'),
  maximize: () => ipcRenderer.send('maximize'),
  close: () => ipcRenderer.send('close'),
  
  // 文件系统操作
  readDirectory: (dirPath) => ipcRenderer.invoke('read-directory', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  createFile: (dirPath, fileName) => ipcRenderer.invoke('create-file', dirPath, fileName),
  createDirectory: (parentPath, dirName) => ipcRenderer.invoke('create-directory', parentPath, dirName),
  deleteItem: (itemPath) => ipcRenderer.invoke('delete-item', itemPath),
  renameItem: (oldPath, newName) => ipcRenderer.invoke('rename-item', oldPath, newName),
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options)
});
```

- [ ] **Step 2: 验证代码语法**

Run: `node -c preload.js`
Expected: 无语法错误

---

## Task 4: UI 布局重构

**Files:**
- Modify: `index.html`
- Modify: `styles.css`

- [ ] **Step 1: 更新 index.html 布局**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>文件管理器</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="titlebar">
    <div class="titlebar-drag">
      <span class="app-logo"></span>
      <span class="app-title">文件管理器</span>
    </div>
    <div class="titlebar-controls">
      <button class="ctrl-btn minimize" id="btn-min">
        <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" rx="0.5" fill="currentColor"/></svg>
      </button>
      <button class="ctrl-btn maximize" id="btn-max">
        <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" rx="1.5" stroke="currentColor" fill="none"/></svg>
      </button>
      <button class="ctrl-btn close" id="btn-close">
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1L9 9M9 1L1 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      </button>
    </div>
  </div>

  <div class="app-container">
    <!-- 左侧文件树 -->
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          <span>资源管理器</span>
        </div>
        <div class="sidebar-actions">
          <button class="icon-btn" id="btn-new-file" title="新建文件">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
          </button>
          <button class="icon-btn" id="btn-new-folder" title="新建文件夹">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
          </button>
          <button class="icon-btn" id="btn-open-folder" title="打开文件夹">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><path d="M12 11v6"/><path d="m9 14 3-3 3 3"/></svg>
          </button>
        </div>
      </div>
      <div class="file-tree" id="file-tree">
        <!-- 文件树将通过 JS 动态生成 -->
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          <p>打开文件夹开始</p>
        </div>
      </div>
    </aside>

    <!-- 右侧编辑器区域 -->
    <main class="editor-area">
      <!-- 标签页栏 -->
      <div class="tabs-bar" id="tabs-bar">
        <div class="tabs-list" id="tabs-list">
          <!-- 标签页通过 JS 动态生成 -->
        </div>
      </div>
      
      <!-- 编辑器容器 -->
      <div class="editor-container" id="editor-container">
        <div class="welcome-screen">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
          <h2>欢迎使用文件管理器</h2>
          <p>打开文件夹或创建新文件开始</p>
          <div class="shortcuts">
            <div class="shortcut">
              <kbd>Ctrl</kbd> + <kbd>O</kbd>
              <span>打开文件夹</span>
            </div>
            <div class="shortcut">
              <kbd>Ctrl</kbd> + <kbd>N</kbd>
              <span>新建文件</span>
            </div>
            <div class="shortcut">
              <kbd>Ctrl</kbd> + <kbd>S</kbd>
              <span>保存文件</span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 状态栏 -->
      <div class="status-bar" id="status-bar">
        <div class="status-left">
          <span class="status-item" id="status-encoding">UTF-8</span>
          <span class="status-item" id="status-line-ending">LF</span>
        </div>
        <div class="status-right">
          <span class="status-item" id="status-cursor">行 1, 列 1</span>
          <span class="status-item" id="status-language">纯文本</span>
        </div>
      </div>
    </main>
  </div>

  <!-- Monaco Editor 的 AMD 加载器 -->
  <script src="node_modules/monaco-editor/min/vs/loader.js"></script>
  <script src="file-tree.js"></script>
  <script src="editor-manager.js"></script>
  <script src="renderer.js"></script>
</body>
</html>
```

- [ ] **Step 2: 更新 styles.css 添加新布局样式**

在现有样式基础上添加：

```css
/* === Editor Area === */
.editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-base);
}

/* === Tabs Bar === */
.tabs-bar {
  height: 38px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  padding: 0 8px;
  overflow-x: auto;
}

.tabs-list {
  display: flex;
  gap: 2px;
  height: 100%;
  align-items: end;
}

.tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-bottom: none;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--text-secondary);
  transition: all 0.15s ease;
  white-space: nowrap;
  max-width: 200px;
}

.tab:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tab.active {
  background: var(--bg-base);
  color: var(--text-primary);
  border-bottom-color: var(--bg-base);
}

.tab.modified::after {
  content: '●';
  color: var(--orange);
  font-size: 10px;
}

.tab-close {
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  opacity: 0;
  transition: all 0.15s;
}

.tab:hover .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

/* === Editor Container === */
.editor-container {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.welcome-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  animation: fadeIn 0.5s ease;
}

.welcome-screen h2 {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-secondary);
}

.welcome-screen p {
  font-size: 14px;
  color: var(--text-tertiary);
}

.shortcuts {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 24px;
}

.shortcut {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--text-secondary);
}

.shortcut kbd {
  font-family: inherit;
  font-size: 11px;
  padding: 3px 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  color: var(--text-primary);
}

/* === Status Bar === */
.status-bar {
  height: 24px;
  background: var(--bg-surface);
  border-top: 1px solid var(--border-subtle);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 12px;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.status-left,
.status-right {
  display: flex;
  gap: 16px;
}

.status-item {
  cursor: default;
}

/* === File Tree === */
.file-tree {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--text-tertiary);
  font-size: 13px;
}

.tree-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  transition: all 0.1s ease;
  user-select: none;
}

.tree-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tree-item.selected {
  background: var(--accent-soft);
  color: var(--accent-hover);
}

.tree-item-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tree-item-icon svg {
  width: 14px;
  height: 14px;
}

.tree-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-item-arrow {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  transition: transform 0.15s ease;
}

.tree-item-arrow.expanded {
  transform: rotate(90deg);
}

.tree-children {
  padding-left: 16px;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

---

## Task 5: 文件树组件

**Files:**
- Create: `file-tree.js`

- [ ] **Step 1: 创建文件树组件**

```javascript
// file-tree.js

class FileTree {
  constructor(container, onFileSelect) {
    this.container = container;
    this.onFileSelect = onFileSelect;
    this.selectedItem = null;
    this.expandedDirs = new Set();
  }

  async loadDirectory(dirPath, parentElement = null) {
    try {
      const entries = await window.electronAPI.readDirectory(dirPath);
      
      // 排序：文件夹在前，文件在后，按名称排序
      entries.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      if (!parentElement) {
        this.container.innerHTML = '';
        this.rootPath = dirPath;
      }

      const fragment = document.createDocumentFragment();

      entries.forEach(entry => {
        const item = this.createTreeItem(entry);
        fragment.appendChild(item);
      });

      if (parentElement) {
        const childrenDiv = parentElement.querySelector('.tree-children');
        if (childrenDiv) {
          childrenDiv.appendChild(fragment);
        }
      } else {
        this.container.appendChild(fragment);
      }
    } catch (error) {
      console.error('加载目录失败:', error);
    }
  }

  createTreeItem(entry) {
    const item = document.createElement('div');
    item.className = 'tree-item';
    item.dataset.path = entry.path;
    item.dataset.isDirectory = entry.isDirectory;

    const indent = this.getIndentLevel(item);
    item.style.paddingLeft = `${12 + indent * 16}px`;

    if (entry.isDirectory) {
      item.innerHTML = `
        <span class="tree-item-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
        </span>
        <span class="tree-item-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </span>
        <span class="tree-item-name">${entry.name}</span>
        <div class="tree-children"></div>
      `;

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDirectory(item, entry);
      });
    } else {
      item.innerHTML = `
        <span class="tree-item-arrow" style="visibility: hidden">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
        </span>
        <span class="tree-item-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
        </span>
        <span class="tree-item-name">${entry.name}</span>
      `;

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectItem(item);
        this.onFileSelect(entry.path, entry.name);
      });
    }

    return item;
  }

  async toggleDirectory(item, entry) {
    const arrow = item.querySelector('.tree-item-arrow');
    const childrenDiv = item.querySelector('.tree-children');

    if (this.expandedDirs.has(entry.path)) {
      // 收起
      this.expandedDirs.delete(entry.path);
      arrow.classList.remove('expanded');
      childrenDiv.innerHTML = '';
    } else {
      // 展开
      this.expandedDirs.add(entry.path);
      arrow.classList.add('expanded');
      await this.loadDirectory(entry.path, item);
    }
  }

  selectItem(item) {
    if (this.selectedItem) {
      this.selectedItem.classList.remove('selected');
    }
    this.selectedItem = item;
    item.classList.add('selected');
  }

  getIndentLevel(element) {
    let level = 0;
    let parent = element.parentElement;
    while (parent && parent !== this.container) {
      if (parent.classList.contains('tree-children')) {
        level++;
      }
      parent = parent.parentElement;
    }
    return level;
  }
}
```

- [ ] **Step 2: 验证代码语法**

Run: `node -c file-tree.js`
Expected: 无语法错误

---

## Task 6: 编辑器管理器

**Files:**
- Create: `editor-manager.js`

- [ ] **Step 1: 创建编辑器管理器**

```javascript
// editor-manager.js

class EditorManager {
  constructor(container, tabsList, statusBar) {
    this.container = container;
    this.tabsList = tabsList;
    this.statusBar = statusBar;
    this.editors = new Map(); // path -> { editor, model, tab }
    this.activeEditor = null;
    this.monaco = null;
  }

  async init() {
    // 加载 Monaco Editor
    return new Promise((resolve) => {
      require.config({ paths: { vs: 'node_modules/monaco-editor/min/vs' } });
      require(['vs/editor/editor.main'], (monaco) => {
        this.monaco = monaco;
        
        // 定义深色主题
        monaco.editor.defineTheme('custom-dark', {
          base: 'vs-dark',
          inherit: true,
          rules: [],
          colors: {
            'editor.background': '#0a0a0f',
            'editor.foreground': '#f0f0f5',
            'editor.lineHighlightBackground': '#111118',
            'editor.selectionBackground': '#2a2a3a',
            'editorCursor.foreground': '#6366f1'
          }
        });
        
        resolve(monaco);
      });
    });
  }

  async openFile(filePath, fileName) {
    // 如果文件已经打开，切换到该标签页
    if (this.editors.has(filePath)) {
      this.switchToTab(filePath);
      return;
    }

    try {
      // 读取文件内容
      const content = await window.electronAPI.readFile(filePath);
      
      // 检测语言
      const language = this.detectLanguage(fileName);
      
      // 创建 Monaco 模型
      const model = this.monaco.editor.createModel(content, language);
      
      // 创建编辑器实例
      this.container.innerHTML = '';
      const editor = this.monaco.editor.create(this.container, {
        model: model,
        theme: 'custom-dark',
        fontSize: 14,
        fontFamily: "'Plus Jakarta Sans', -apple-system, system-ui, sans-serif",
        minimap: { enabled: false },
        padding: { top: 16, bottom: 16 },
        lineNumbers: 'on',
        roundedSelection: true,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        wordWrap: 'on'
      });

      // 创建标签页
      const tab = this.createTab(filePath, fileName);
      this.tabsList.appendChild(tab);

      // 保存编辑器引用
      this.editors.set(filePath, { editor, model, tab, fileName });
      this.activeEditor = filePath;

      // 监听内容变化
      model.onDidChangeContent(() => {
        tab.classList.add('modified');
        this.updateStatusBar(editor);
      });

      // 监听光标位置变化
      editor.onDidChangeCursorPosition(() => {
        this.updateStatusBar(editor);
      });

      // 更新状态栏
      this.updateStatusBar(editor);
      this.updateLanguageStatus(language);

    } catch (error) {
      console.error('打开文件失败:', error);
    }
  }

  createTab(filePath, fileName) {
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.dataset.path = filePath;
    tab.innerHTML = `
      <span class="tab-name">${fileName}</span>
      <button class="tab-close" title="关闭">
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1L9 9M9 1L1 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      </button>
    `;

    tab.addEventListener('click', (e) => {
      if (!e.target.closest('.tab-close')) {
        this.switchToTab(filePath);
      }
    });

    tab.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(filePath);
    });

    return tab;
  }

  switchToTab(filePath) {
    const editorData = this.editors.get(filePath);
    if (!editorData) return;

    // 更新标签页状态
    this.tabsList.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    editorData.tab.classList.add('active');

    // 切换编辑器
    this.container.innerHTML = '';
    editorData.editor = this.monaco.editor.create(this.container, {
      model: editorData.model,
      theme: 'custom-dark',
      fontSize: 14,
      fontFamily: "'Plus Jakarta Sans', -apple-system, system-ui, sans-serif",
      minimap: { enabled: false },
      padding: { top: 16, bottom: 16 },
      lineNumbers: 'on',
      roundedSelection: true,
      scrollBeyondLastLine: false,
      automaticLayout: true,
      wordWrap: 'on'
    });

    this.activeEditor = filePath;
    this.updateStatusBar(editorData.editor);
    this.updateLanguageStatus(editorData.model.getLanguageId());
  }

  closeTab(filePath) {
    const editorData = this.editors.get(filePath);
    if (!editorData) return;

    // 销毁编辑器
    editorData.editor.dispose();
    editorData.model.dispose();
    editorData.tab.remove();
    this.editors.delete(filePath);

    // 如果关闭的是当前活动标签页
    if (this.activeEditor === filePath) {
      const remaining = Array.from(this.editors.keys());
      if (remaining.length > 0) {
        this.switchToTab(remaining[remaining.length - 1]);
      } else {
        this.activeEditor = null;
        this.container.innerHTML = `
          <div class="welcome-screen">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
            <h2>欢迎使用文件管理器</h2>
            <p>打开文件夹或创建新文件开始</p>
          </div>
        `;
      }
    }
  }

  async saveFile() {
    if (!this.activeEditor) return;

    const editorData = this.editors.get(this.activeEditor);
    if (!editorData) return;

    try {
      const content = editorData.model.getValue();
      await window.electronAPI.writeFile(this.activeEditor, content);
      editorData.tab.classList.remove('modified');
    } catch (error) {
      console.error('保存文件失败:', error);
    }
  }

  updateStatusBar(editor) {
    const position = editor.getPosition();
    const cursorStatus = document.getElementById('status-cursor');
    if (cursorStatus) {
      cursorStatus.textContent = `行 ${position.lineNumber}, 列 ${position.column}`;
    }
  }

  updateLanguageStatus(language) {
    const langStatus = document.getElementById('status-language');
    if (langStatus) {
      const langMap = {
        'javascript': 'JavaScript',
        'typescript': 'TypeScript',
        'html': 'HTML',
        'css': 'CSS',
        'json': 'JSON',
        'markdown': 'Markdown',
        'python': 'Python',
        'plaintext': '纯文本'
      };
      langStatus.textContent = langMap[language] || language;
    }
  }

  detectLanguage(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const langMap = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'html': 'html',
      'htm': 'html',
      'css': 'css',
      'scss': 'scss',
      'json': 'json',
      'md': 'markdown',
      'py': 'python',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'h': 'c'
    };
    return langMap[ext] || 'plaintext';
  }
}
```

- [ ] **Step 2: 验证代码语法**

Run: `node -c editor-manager.js`
Expected: 无语法错误

---

## Task 7: 主渲染进程

**Files:**
- Modify: `renderer.js`

- [ ] **Step 1: 重写 renderer.js 整合所有组件**

```javascript
// renderer.js

let fileTree;
let editorManager;
let currentRootPath = null;

// 初始化应用
async function initApp() {
  // 初始化编辑器
  const editorContainer = document.getElementById('editor-container');
  const tabsList = document.getElementById('tabs-list');
  const statusBar = document.getElementById('status-bar');
  
  editorManager = new EditorManager(editorContainer, tabsList, statusBar);
  await editorManager.init();

  // 初始化文件树
  const fileTreeContainer = document.getElementById('file-tree');
  fileTree = new FileTree(fileTreeContainer, (filePath, fileName) => {
    editorManager.openFile(filePath, fileName);
  });

  // 绑定事件
  bindEvents();
  
  // 绑定快捷键
  bindKeyboardShortcuts();
}

function bindEvents() {
  // 窗口控制
  document.getElementById('btn-min').addEventListener('click', () => {
    window.electronAPI.minimize();
  });

  document.getElementById('btn-max').addEventListener('click', () => {
    window.electronAPI.maximize();
  });

  document.getElementById('btn-close').addEventListener('click', () => {
    window.electronAPI.close();
  });

  // 打开文件夹
  document.getElementById('btn-open-folder').addEventListener('click', openFolder);

  // 新建文件
  document.getElementById('btn-new-file').addEventListener('click', createNewFile);

  // 新建文件夹
  document.getElementById('btn-new-folder').addEventListener('click', createNewFolder);
}

function bindKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+S: 保存
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      editorManager.saveFile();
    }

    // Ctrl+O: 打开文件夹
    if (e.ctrlKey && e.key === 'o') {
      e.preventDefault();
      openFolder();
    }

    // Ctrl+N: 新建文件
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      createNewFile();
    }

    // Ctrl+W: 关闭当前标签页
    if (e.ctrlKey && e.key === 'w') {
      e.preventDefault();
      if (editorManager.activeEditor) {
        editorManager.closeTab(editorManager.activeEditor);
      }
    }
  });
}

async function openFolder() {
  const result = await window.electronAPI.showOpenDialog({
    properties: ['openDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const dirPath = result.filePaths[0];
    currentRootPath = dirPath;
    await fileTree.loadDirectory(dirPath);
    
    // 更新标题栏
    document.querySelector('.app-title').textContent = dirPath.split('\\').pop();
  }
}

async function createNewFile() {
  if (!currentRootPath) {
    alert('请先打开一个文件夹');
    return;
  }

  const fileName = prompt('请输入文件名:');
  if (fileName) {
    try {
      const filePath = await window.electronAPI.createFile(currentRootPath, fileName);
      await fileTree.loadDirectory(currentRootPath);
      await editorManager.openFile(filePath, fileName);
    } catch (error) {
      alert('创建文件失败: ' + error.message);
    }
  }
}

async function createNewFolder() {
  if (!currentRootPath) {
    alert('请先打开一个文件夹');
    return;
  }

  const folderName = prompt('请输入文件夹名:');
  if (folderName) {
    try {
      await window.electronAPI.createDirectory(currentRootPath, folderName);
      await fileTree.loadDirectory(currentRootPath);
    } catch (error) {
      alert('创建文件夹失败: ' + error.message);
    }
  }
}

// 应用启动
document.addEventListener('DOMContentLoaded', initApp);
```

- [ ] **Step 2: 验证代码语法**

Run: `node -c renderer.js`
Expected: 无语法错误

---

## Task 8: 测试和验证

- [ ] **Step 1: 启动应用**

Run: `cd /d C:\Users\GJC\Documents\Codex\electron-app && npm start`
Expected: 应用启动，显示欢迎界面

- [ ] **Step 2: 测试打开文件夹**

1. 点击侧边栏的"打开文件夹"按钮
2. 选择一个包含文本文件的文件夹
3. 验证文件树正确显示

- [ ] **Step 3: 测试打开文件**

1. 在文件树中点击一个文本文件
2. 验证 Monaco Editor 正确加载并显示内容
3. 验证标签页正确创建

- [ ] **Step 4: 测试保存文件**

1. 修改文件内容
2. 按 Ctrl+S 保存
3. 验证标签页上的修改指示器消失

- [ ] **Step 5: 测试多标签页**

1. 打开多个文件
2. 切换标签页
3. 关闭标签页
4. 验证所有操作正常

- [ ] **Step 6: 测试快捷键**

- Ctrl+O: 打开文件夹
- Ctrl+N: 新建文件
- Ctrl+S: 保存文件
- Ctrl+W: 关闭标签页

---

## Assumptions and Defaults

- 默认打开用户主目录作为初始工作区
- Monaco Editor 使用深色主题，与应用整体风格一致
- 文件编码默认 UTF-8
- 换行符默认 LF
- 只支持纯文本文件，不支持二进制文件或图片
- 文件树展开状态在切换文件夹时重置