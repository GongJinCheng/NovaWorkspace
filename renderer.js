// renderer.js

let fileTree;
let editorManager;
let currentRootPath = null;
let currentPage = 'home';
let currentTheme = 'dark';
let aiStats = { tokens: 0, requests: 0 };

async function initApp() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  setTheme(savedTheme);
  bindEvents();
  bindKeyboardShortcuts();
  loadAIConfig();
  updateAIStatus();
}

function bindEvents() {
  document.getElementById('btn-min').addEventListener('click', () => window.electronAPI.minimize());
  document.getElementById('btn-max').addEventListener('click', () => window.electronAPI.maximize());
  document.getElementById('btn-close').addEventListener('click', () => window.electronAPI.close());
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      if (page) switchPage(page);
    });
  });

  document.getElementById('card-file-manager').addEventListener('click', () => switchPage('files'));
  document.getElementById('card-ai-assist').addEventListener('click', () => switchPage('ai'));
  document.getElementById('btn-open-folder').addEventListener('click', openFolder);
  document.getElementById('btn-new-file').addEventListener('click', createNewFile);
  document.getElementById('btn-new-folder').addEventListener('click', createNewFolder);
  document.getElementById('btn-open-folder-files').addEventListener('click', openFolder);
  
document.getElementById('btn-ai-format-toolbar').addEventListener('click', async () => {
  const btn = document.getElementById('btn-ai-format-toolbar');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add('loading');
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
  try {
    await handleAIAction('format');
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.innerHTML = originalHTML;
  }
});
  
  // AI events
  document.getElementById('btn-save-ai').addEventListener('click', saveAIConfig);
  document.getElementById('btn-test-ai').addEventListener('click', testAIConnection);
  document.getElementById('btn-toggle-key').addEventListener('click', toggleApiKeyVisibility);
  document.getElementById('btn-fetch-models').addEventListener('click', fetchModels);
  document.getElementById('btn-ai-format').addEventListener('click', () => handleAIAction('format'));
  document.getElementById('btn-ai-explain').addEventListener('click', () => handleAIAction('explain'));
  document.getElementById('btn-ai-summarize').addEventListener('click', () => handleAIAction('summarize'));
  document.getElementById('btn-ai-translate').addEventListener('click', () => handleAIAction('translate'));
  
  // Model select change
  document.getElementById('ai-model-select').addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
      document.getElementById('ai-model-custom').style.display = 'block';
      document.getElementById('ai-model-custom').focus();
    } else {
      document.getElementById('ai-model-custom').style.display = 'none';
    }
  });
}

function bindKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); if (editorManager) editorManager.saveFile(); }
    if (e.ctrlKey && e.key === 'o') { e.preventDefault(); switchPage('files'); setTimeout(openFolder, 200); }
    if (e.ctrlKey && e.key === 'n') { e.preventDefault(); if (currentPage === 'files') createNewFile(); }
    if (e.ctrlKey && e.key === 'w') { e.preventDefault(); if (editorManager && editorManager.activeEditor) editorManager.closeTab(editorManager.activeEditor); }
  });
}

function toggleTheme() { setTheme(currentTheme === 'dark' ? 'light' : 'dark'); }

function setTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  if (editorManager && editorManager.monaco) editorManager.monaco.editor.setTheme(theme === 'dark' ? 'custom-dark' : 'custom-light');
}

function switchPage(pageName) {
  currentPage = pageName;
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.page === pageName));
  document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === 'page-' + pageName));
  if (pageName === 'files' && !fileTree) initFileManager();
  if (pageName === 'ai') updateAIStatus();
}

function initFileManager() {
  const fileTreeContainer = document.getElementById('file-tree');
  fileTree = new FileTree(fileTreeContainer);
  fileTree.onFileSelect = (filePath) => openFileInEditor(filePath);
}

async function openFileInEditor(filePath) {
  if (!editorManager) {
    editorManager = new EditorManager(document.getElementById('editor-container'), document.getElementById('tabs-list'), document.getElementById('status-bar'));
    await editorManager.init();
  }
  await editorManager.openFile(filePath, filePath.split('\\').pop());
}

async function openFolder() {
  if (!fileTree) initFileManager();
  await fileTree.openFolder();
  if (fileTree.rootPath) {
    currentRootPath = fileTree.rootPath;
    document.querySelector('.app-title').textContent = currentRootPath.split('\\').pop();
  }
}

async function createNewFile() {
  if (!currentRootPath) { alert('请先打开一个文件夹'); return; }
  const fileName = prompt('请输入文件名:');
  if (fileName) {
    try {
      const filePath = await window.electronAPI.createFile(currentRootPath, fileName);
      await fileTree.refresh();
    } catch (error) {
      alert('创建文件失败: ' + error.message);
    }
  }
}

async function createNewFolder() {
  if (!currentRootPath) { alert('请先打开一个文件夹'); return; }
  const folderName = prompt('请输入文件夹名:');
  if (folderName) {
    try {
      await window.electronAPI.createFolder(currentRootPath, folderName);
      await fileTree.refresh();
    } catch (error) {
      alert('创建文件夹失败: ' + error.message);
    }
  }
}

// AI Config functions
function loadAIConfig() {
  const config = JSON.parse(localStorage.getItem('ai-config') || '{}');
  if (config.baseUrl) document.getElementById('ai-base-url').value = config.baseUrl;
  if (config.apiKey) document.getElementById('ai-api-key').value = config.apiKey;
  if (config.model) {
    const select = document.getElementById('ai-model-select');
    const option = Array.from(select.options).find(opt => opt.value === config.model);
    if (option) {
      select.value = config.model;
    } else {
      const customOpt = document.createElement('option');
      customOpt.value = config.model;
      customOpt.textContent = config.model;
      select.appendChild(customOpt);
      select.value = config.model;
    }
  }
  
  const stats = JSON.parse(localStorage.getItem('ai-stats') || '{}');
  if (stats.tokens) aiStats.tokens = stats.tokens;
  if (stats.requests) aiStats.requests = stats.requests;
}

async function saveAIConfig() {
  const config = {
    baseUrl: document.getElementById('ai-base-url').value,
    apiKey: document.getElementById('ai-api-key').value,
    model: document.getElementById('ai-model-select').value
  };
  localStorage.setItem('ai-config', JSON.stringify(config));
  showMsg('配置已保存', 'success');
}

async function testAIConnection() {
  const baseUrl = document.getElementById('ai-base-url').value;
  const apiKey = document.getElementById('ai-api-key').value;
  
  if (!baseUrl || !apiKey) {
    showMsg('请填写 Base URL 和 API Key', 'error');
    return;
  }
  
  const btn = document.getElementById('btn-test-ai');
  btn.disabled = true;
  btn.textContent = '测试中...';
  
  try {
    const response = await fetch(baseUrl + '/models', {
      headers: { 'Authorization': 'Bearer ' + apiKey }
    });
    if (response.ok) {
      showMsg('连接成功', 'success');
    } else {
      showMsg('连接失败: ' + response.statusText, 'error');
    }
  } catch (error) {
    showMsg('连接失败: ' + error.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '测试连接';
  }
}

async function fetchModels() {
  const baseUrl = document.getElementById('ai-base-url').value;
  const apiKey = document.getElementById('ai-api-key').value;
  
  if (!baseUrl || !apiKey) {
    showMsg('请先填写 Base URL 和 API Key', 'error');
    return;
  }
  
  const btn = document.getElementById('btn-fetch-models');
  const select = document.getElementById('ai-model-select');
  btn.disabled = true;
  btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
  
  try {
    const response = await fetch(baseUrl + '/models', {
      headers: { 'Authorization': 'Bearer ' + apiKey }
    });
    const data = await response.json();
    const models = data.data || [];
    
    select.innerHTML = '';
    models.forEach(model => {
      const opt = document.createElement('option');
      opt.value = model.id;
      opt.textContent = model.id;
      select.appendChild(opt);
    });
    
    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = '-- 手动输入 --';
    select.appendChild(customOpt);
    showMsg('获取到 ' + models.length + ' 个模型', 'success');
  } catch (error) {
    showMsg('获取失败: ' + error.message, 'error');
    select.innerHTML = '<option value="custom">手动输入模型名</option>';
    document.getElementById('ai-model-custom').style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> 获取模型';
  }
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('ai-api-key');
  input.type = input.type === 'password' ? 'text' : 'password';
}

function showMsg(text, type) {
  const msgEl = document.getElementById('ai-msg');
  msgEl.textContent = text;
  msgEl.className = 'ai-msg show ' + type;
  setTimeout(() => { msgEl.className = 'ai-msg'; }, 3000);
}

function updateAIStatus() {
  const isConfigured = window.aiService && window.aiService.isConfigured();
  const chip = document.getElementById('ai-status-chip');
  const dot = chip.querySelector('.ai-dot');
  const text = chip.querySelector('.ai-status-text');
  
  text.textContent = isConfigured ? '已连接' : '未配置';
  dot.classList.toggle('active', isConfigured);
  document.getElementById('ai-model-display').textContent = isConfigured ? window.aiService.model : '-';
  document.querySelectorAll('.ai-tool-card').forEach(btn => btn.disabled = !isConfigured);
  updateStatsDisplay();
}

function updateStatsDisplay() {
  document.getElementById('ai-tokens').textContent = aiStats.tokens > 1000 ? (aiStats.tokens / 1000).toFixed(1) + 'k' : aiStats.tokens;
  document.getElementById('ai-requests').textContent = aiStats.requests;
}

function incrementAIStats(tokens) {
  aiStats.tokens += tokens;
  aiStats.requests += 1;
  localStorage.setItem('ai-stats', JSON.stringify(aiStats));
  updateStatsDisplay();
}

async function handleAIAction(action) {
  if (!window.aiService || !window.aiService.isConfigured()) { alert('请先配置 AI'); return; }
  if (!editorManager || !editorManager.activeEditor) { alert('请先打开一个文件'); return; }
  
  const editorData = editorManager.editors.get(editorManager.activeEditor);
  if (!editorData) return;
  const content = editorData.model.getValue();
  if (!content.trim()) { alert('文件内容为空'); return; }
  
  const btn = document.getElementById('btn-ai-' + action);
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  
  try {
    let result, title;
    switch (action) {
      case 'format': title = 'Markdown 整理'; result = await window.aiService.formatMarkdown(content); break;
      case 'explain': title = '代码解释'; result = await window.aiService.explainCode(content); break;
      case 'summarize': title = '内容摘要'; result = await window.aiService.summarize(content); break;
      case 'translate': title = '翻译结果'; result = await window.aiService.translate(content); break;
    }
    
    incrementAIStats(Math.ceil((content.length + result.length) / 4));
    showAIModal(title, result, action === 'format' ? () => editorData.model.setValue(result) : null);
  } catch (error) {
    alert('AI 处理失败: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}

function showAIModal(title, content, onApply) {
  const existing = document.querySelector('.ai-modal');
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.className = 'ai-modal';
  modal.innerHTML = `
    <div class="ai-modal-content">
      <div class="ai-modal-header">
        <h3>${title}</h3>
        <button class="ai-modal-close" id="ai-modal-close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="ai-result">${content}</div>
      ${onApply ? `<div class="ai-modal-actions"><button class="ai-save" id="ai-modal-apply"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> 应用更改</button></div>` : ''}
    </div>
  `;
  
  document.body.appendChild(modal);
  document.getElementById('ai-modal-close').addEventListener('click', () => modal.remove());
  if (onApply) document.getElementById('ai-modal-apply').addEventListener('click', () => { onApply(); modal.remove(); });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

document.addEventListener('DOMContentLoaded', initApp);