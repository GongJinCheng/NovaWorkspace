// editor-manager.js

class EditorManager {
  constructor(container, tabsList, statusBar) {
    this.container = container;
    this.tabsList = tabsList;
    this.statusBar = statusBar;
    this.editors = new Map();
    this.activeEditor = null;
    this.monaco = null;
  }

  async init() {
    return new Promise((resolve) => {
      require.config({ paths: { vs: 'node_modules/monaco-editor/min/vs' } });
      require(['vs/editor/editor.main'], (monaco) => {
        this.monaco = monaco;
        
        // Dark theme
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
        
        // Light theme
        monaco.editor.defineTheme('custom-light', {
          base: 'vs',
          inherit: true,
          rules: [],
          colors: {
            'editor.background': '#fafafa',
            'editor.foreground': '#1a1a2e',
            'editor.lineHighlightBackground': '#f5f5f7',
            'editor.selectionBackground': '#e5e5e7',
            'editorCursor.foreground': '#6366f1'
          }
        });
        
        resolve(monaco);
      });
    });
  }

  getCurrentTheme() {
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    return theme === 'dark' ? 'custom-dark' : 'custom-light';
  }

  async openFile(filePath, fileName) {
    if (this.editors.has(filePath)) {
      this.switchToTab(filePath);
      return;
    }

    try {
      const content = await window.electronAPI.readFile(filePath);
      const language = this.detectLanguage(fileName);
      const model = this.monaco.editor.createModel(content, language);
      
      this.container.innerHTML = '';
      const editor = this.monaco.editor.create(this.container, {
        model: model,
        theme: this.getCurrentTheme(),
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

      const tab = this.createTab(filePath, fileName);
      this.tabsList.appendChild(tab);

      this.editors.set(filePath, { editor, model, tab, fileName });
      this.activeEditor = filePath;

      model.onDidChangeContent(() => {
        tab.classList.add('modified');
        this.updateStatusBar(editor);
      });

      editor.onDidChangeCursorPosition(() => {
        this.updateStatusBar(editor);
      });

      this.updateStatusBar(editor);
      this.updateLanguageStatus(language);

    } catch (error) {
      console.error('Error opening file:', error);
    }
  }

  createTab(filePath, fileName) {
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.dataset.path = filePath;
    
    const tabName = document.createElement('span');
    tabName.className = 'tab-name';
    tabName.textContent = fileName;
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.title = '关闭';
    closeBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1L9 9M9 1L1 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';
    
    tab.appendChild(tabName);
    tab.appendChild(closeBtn);

    tab.addEventListener('click', (e) => {
      if (!e.target.closest('.tab-close')) {
        this.switchToTab(filePath);
      }
    });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(filePath);
    });

    return tab;
  }

  switchToTab(filePath) {
    const editorData = this.editors.get(filePath);
    if (!editorData) return;

    this.tabsList.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    editorData.tab.classList.add('active');

    this.container.innerHTML = '';
    editorData.editor = this.monaco.editor.create(this.container, {
      model: editorData.model,
      theme: this.getCurrentTheme(),
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

    editorData.editor.dispose();
    editorData.model.dispose();
    editorData.tab.remove();
    this.editors.delete(filePath);

    if (this.activeEditor === filePath) {
      const remaining = Array.from(this.editors.keys());
      if (remaining.length > 0) {
        this.switchToTab(remaining[remaining.length - 1]);
      } else {
        this.activeEditor = null;
        this.container.innerHTML = '<div class="welcome-screen"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg><h2>欢迎使用文件管理器</h2><p>在左侧打开文件夹开始浏览</p></div>';
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
      console.error('Error saving file:', error);
    }
  }

  updateStatusBar(editor) {
    const position = editor.getPosition();
    const cursorStatus = document.getElementById('status-cursor');
    if (cursorStatus) {
      cursorStatus.textContent = '行 ' + position.lineNumber + ', 列 ' + position.column;
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