/**
 * FileTree - 文件树管理模块
 * 负责文件夹浏览、展开/折叠、文件选择
 */
class FileTree {
  constructor(containerEl) {
    this.container = containerEl;
    this.rootPath = null;
    this.selectedPath = null;
    this.expandedDirs = new Set();
    this.onFileSelect = null; // callback(filePath)
  }

  async openFolder() {
    const result = await window.electronAPI.showOpenDialog({
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths.length) return;
    this.rootPath = result.filePaths[0];
    this.expandedDirs.clear();
    this.expandedDirs.add(this.rootPath);
    await this.render();
  }

  async render() {
    if (!this.rootPath) {
      this.container.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <p>打开文件夹开始</p>
        </div>`;
      return;
    }
    this.container.innerHTML = '';
    await this._renderDir(this.rootPath, this.container, 0);
  }

  async _renderDir(dirPath, parentEl, depth) {
    let entries;
    try {
      entries = await window.electronAPI.readDirectory(dirPath);
    } catch (e) {
      console.error('读取目录失败:', e);
      return;
    }

    // Sort: folders first, then files, both alphabetical
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'tree-children';

    for (const entry of entries) {
      const item = document.createElement('div');
      item.className = 'tree-item' + (entry.path === this.selectedPath ? ' selected' : '');
      item.style.paddingLeft = (12 + depth * 16) + 'px';

      if (entry.isDirectory) {
        const isExpanded = this.expandedDirs.has(entry.path);
        item.innerHTML = `
          <span class="tree-item-arrow ${isExpanded ? 'expanded' : ''}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </span>
          <span class="tree-item-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </span>
          <span class="tree-item-name">${this._escapeHtml(entry.name)}</span>`;

        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this._toggleDir(entry.path);
        });

        wrapper.appendChild(item);

        if (isExpanded) {
          await this._renderDir(entry.path, wrapper, depth + 1);
        }
      } else {
        const icon = this._getFileIcon(entry.name);
        item.innerHTML = `
          <span class="tree-item-arrow" style="visibility:hidden">
            <svg width="12" height="12" viewBox="0 0 24 24"></svg>
          </span>
          <span class="tree-item-icon">${icon}</span>
          <span class="tree-item-name">${this._escapeHtml(entry.name)}</span>`;

        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this._selectFile(entry.path, item);
        });

        wrapper.appendChild(item);
      }
    }

    parentEl.appendChild(wrapper);
  }

  async _toggleDir(dirPath) {
    if (this.expandedDirs.has(dirPath)) {
      this.expandedDirs.delete(dirPath);
    } else {
      this.expandedDirs.add(dirPath);
    }
    await this.render();
  }

  _selectFile(filePath, itemEl) {
    this.selectedPath = filePath;
    // Update selected visual
    this.container.querySelectorAll('.tree-item.selected').forEach(el => el.classList.remove('selected'));
    itemEl.classList.add('selected');
    if (this.onFileSelect) this.onFileSelect(filePath);
  }

  _getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const iconMap = {
      js:   { color: '#facc15', label: 'JS' },
      ts:   { color: '#3b82f6', label: 'TS' },
      jsx:  { color: '#61dafb', label: 'JSX' },
      tsx:  { color: '#61dafb', label: 'TSX' },
      html: { color: '#f97316', label: '<>' },
      css:  { color: '#8b5cf6', label: '{}' },
      json: { color: '#facc15', label: '{}' },
      md:   { color: '#60a5fa', label: 'M↓' },
      py:   { color: '#34d399', label: 'PY' },
      txt:  { color: '#888',    label: 'Tx' },
    };
    const info = iconMap[ext];
    if (info) {
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${info.color}" stroke-width="2">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>`;
    }
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>`;
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}