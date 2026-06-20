import { switchPage } from '../../app/router';
import { escHtml } from '../../utils/escape';

export interface FileCopilotBridge {
  runWorkflow: (workflowId: string) => Promise<void>;
  getSnapshot: () => { filePath: string; fileName: string; content: string; selection?: string } | null;
}

let installed = false;
let bridgeRef: FileCopilotBridge | null = null;

const tools = [
  { id: 'summary', title: '总结', desc: '核心内容 + 结论' },
  { id: 'outline', title: '大纲', desc: '生成文档结构' },
  { id: 'askdoc', title: '问文档', desc: '基于全文问答' },
  { id: 'rewrite', title: '改写选中', desc: '替换选中文本' },
  { id: 'todo', title: '生成待办', desc: '提取可执行任务' },
  { id: 'format', title: '格式化', desc: '整理当前文件' },
];

export function installFileCopilot(bridge: FileCopilotBridge): void {
  bridgeRef = bridge;
  if (installed) {
    refreshFileCopilot();
    return;
  }
  const editorArea = document.querySelector('.file-editor-area');
  if (!editorArea) return;

  const dock = document.createElement('aside');
  dock.className = 'file-ai-copilot-dock';
  dock.id = 'file-ai-copilot-dock';
  dock.innerHTML = renderDock();
  editorArea.appendChild(dock);
  // v2.9.13: 默认收起文档助手，避免首次进入文件管理时遮挡编辑区。
  dock.classList.add('is-collapsed');
  editorArea.classList.remove('has-ai-copilot-open');

  dock.addEventListener('click', (event) => handleClick(event));
  window.addEventListener('nova:active-file-changed', refreshFileCopilot);
  window.addEventListener('focus', refreshFileCopilot);

  installed = true;
  refreshFileCopilot();
}

function renderDock(): string {
  return '<button class="file-ai-copilot-fab" data-file-copilot-action="toggle" title="打开 AI 文档助手"><span class="file-ai-fab-mark">AI</span><span class="file-ai-fab-text">文档助手</span></button>' +
    '<div class="file-ai-copilot-panel">' +
      '<div class="file-ai-copilot-head">' +
        '<div><span>DOCUMENT COPILOT</span><strong>AI 文档助手</strong></div>' +
        '<button data-file-copilot-action="toggle" title="收起">×</button>' +
      '</div>' +
      '<div class="file-ai-copilot-context" id="file-ai-copilot-context"></div>' +
      '<div class="file-ai-copilot-tools">' + tools.map(tool =>
        '<button data-file-copilot-tool="' + tool.id + '" data-state-label="">' +
          '<strong>' + escHtml(tool.title) + '</strong><small>' + escHtml(tool.desc) + '</small>' +
        '</button>'
      ).join('') + '</div>' +
      '<div class="file-ai-copilot-route">' +
        '<button data-file-copilot-action="send-to-ai">带到 AI 助手继续聊</button>' +
      '</div>' +
    '</div>';
}

function handleClick(event: Event): void {
  const target = event.target as HTMLElement | null;
  const action = (target?.closest('[data-file-copilot-action]') as HTMLElement | null)?.dataset.fileCopilotAction;
  if (action === 'toggle') {
    const dock = document.getElementById('file-ai-copilot-dock');
    const area = document.querySelector('.file-editor-area');
    dock?.classList.toggle('is-collapsed');
    area?.classList.toggle('has-ai-copilot-open', !dock?.classList.contains('is-collapsed'));
    refreshFileCopilot();
    return;
  }
  if (action === 'send-to-ai') {
    sendActiveFileToAI();
    return;
  }

  const toolId = (target?.closest('[data-file-copilot-tool]') as HTMLElement | null)?.dataset.fileCopilotTool;
  if (!toolId || !bridgeRef) return;
  void runToolWithBusy(target?.closest('[data-file-copilot-tool]') as HTMLElement, () => bridgeRef!.runWorkflow(toolId));
}

async function runToolWithBusy(button: HTMLElement | null, runner: () => Promise<void>): Promise<void> {
  if (!button || button.dataset.busy === 'true') return;
  button.dataset.busy = 'true';
  button.dataset.stateLabel = '运行中';
  button.classList.remove('is-success', 'is-error');
  button.classList.add('is-running');
  try {
    await runner();
    button.classList.remove('is-running');
    button.classList.add('is-success');
    button.dataset.stateLabel = '已完成';
  } catch (error) {
    button.classList.remove('is-running');
    button.classList.add('is-error');
    button.dataset.stateLabel = '失败';
    throw error;
  } finally {
    window.setTimeout(() => {
      button.dataset.busy = 'false';
      button.dataset.stateLabel = '';
      button.classList.remove('is-running', 'is-success', 'is-error');
    }, 900);
  }
}

function refreshFileCopilot(): void {
  const context = document.getElementById('file-ai-copilot-context');
  if (!context || !bridgeRef) return;
  const snapshot = bridgeRef.getSnapshot();
  if (!snapshot) {
    context.innerHTML = '<div class="file-ai-context-empty">打开一个 Markdown 文档后，AI 可以总结、改写、生成待办。</div>';
    return;
  }
  const isMd = /\.(md|markdown|mdown|mkdn)$/i.test(snapshot.fileName);
  context.innerHTML =
    '<div class="file-ai-context-file">' + escHtml(snapshot.fileName) + '</div>' +
    '<div class="file-ai-context-meta">' + (isMd ? 'Markdown 文档' : '普通文件') + ' · ' + snapshot.content.length + ' 字' + (snapshot.selection ? ' · 已选中 ' + snapshot.selection.length + ' 字' : '') + '</div>' +
    '<div class="file-ai-context-tip">' + (isMd ? '推荐使用：总结 / 大纲 / 问文档 / 生成待办' : '普通文件推荐先使用格式化或带到 AI 助手分析') + '</div>';
}

function sendActiveFileToAI(): void {
  if (!bridgeRef) return;
  const snapshot = bridgeRef.getSnapshot();
  if (!snapshot) return;
  const content = snapshot.selection || snapshot.content;
  const prompt = '请基于当前文件继续协助我。\n\n文件：' + snapshot.fileName + '\n路径：' + snapshot.filePath + '\n\n我的需求：请先总结文件内容，再给出下一步建议。\n\n文件内容：\n' + content.slice(0, 12000);
  sessionStorage.setItem('nova-ai-draft', prompt);
  void switchPage('ai');
}
