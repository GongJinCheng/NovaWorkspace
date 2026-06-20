import { switchPage } from '../../app/router';
import { getCurrentWorkspaceRoot, getRelativePath } from '../../services/workspace-context';
import { escHtml, escAttr } from '../../utils/escape';

export interface AIStudioBridge {
  sendMessage: (text: string) => Promise<string>;
  setDraft: (text: string, options?: { focus?: boolean; select?: boolean }) => void;
  appendSystem: (text: string) => void;
  attachActiveFile: () => void;
  pickProjectFiles: () => void;
  pickKnowledgeItems: () => void;
  runFileWorkflow: (workflowId: string) => Promise<void>;
}

type StudioMode = 'chat' | 'document' | 'project' | 'tasks' | 'knowledge';

type StudioAction = {
  id: string;
  mode: StudioMode;
  title: string;
  subtitle: string;
  badge: string;
  run: (bridge: AIStudioBridge) => Promise<void> | void;
};

let installed = false;
let activeMode: StudioMode = 'chat';
let bridgeRef: AIStudioBridge | null = null;
let lastResult = '';
let actionsOpen = false;

const modes: Array<{ id: StudioMode; title: string; desc: string; icon: string }> = [
  { id: 'chat', title: '自由对话', desc: '带上下文的普通问答', icon: 'spark' },
  { id: 'document', title: '文档 Copilot', desc: '总结、审查、改写当前文件', icon: 'doc' },
  { id: 'project', title: '项目分析', desc: '基于工作区做计划与风险分析', icon: 'project' },
  { id: 'tasks', title: '任务拆解', desc: '从文档或想法生成待办', icon: 'task' },
  { id: 'knowledge', title: '知识引用', desc: '引用资料再进行问答', icon: 'kb' },
];

const actions: StudioAction[] = [
  {
    id: 'chat-focus',
    mode: 'chat',
    title: '开始一次有目标的对话',
    subtitle: '先给 AI 一个任务目标，而不是随便聊天。',
    badge: 'Draft',
    run: (bridge) => bridge.setDraft('你现在是我的项目协作助手。请先问我 3 个关键问题，再帮我整理下一步行动方案。'),
  },
  {
    id: 'attach-current-file',
    mode: 'document',
    title: '引用当前文件',
    subtitle: '把文件管理器正在编辑的文件加入上下文。',
    badge: 'Context',
    run: (bridge) => bridge.attachActiveFile(),
  },
  {
    id: 'doc-summary',
    mode: 'document',
    title: '文档智能摘要',
    subtitle: '输出核心内容、关键结论、下一步建议。',
    badge: 'Run',
    run: (bridge) => runWithActiveFile(bridge, '请总结当前文档，按「核心内容 / 关键结论 / 下一步建议 / 可生成待办」四段输出。'),
  },
  {
    id: 'doc-review',
    mode: 'document',
    title: '文档审查优化',
    subtitle: '检查结构、逻辑、表达和可执行性。',
    badge: 'Review',
    run: (bridge) => runWithActiveFile(bridge, '请审查当前文档，指出结构问题、逻辑问题、表达问题，并给出可直接修改的优化建议。'),
  },
  {
    id: 'doc-todos',
    mode: 'tasks',
    title: '从当前文档生成待办',
    subtitle: '复用文件管理器已有的 AI 提取待办能力。',
    badge: 'Todo',
    run: (bridge) => bridge.runFileWorkflow('todo'),
  },
  {
    id: 'selected-rewrite',
    mode: 'document',
    title: '改写选中内容',
    subtitle: '选中文本后可直接在文件管理器中替换。',
    badge: 'Edit',
    run: (bridge) => bridge.runFileWorkflow('rewrite'),
  },
  {
    id: 'project-brief',
    mode: 'project',
    title: '生成项目 Brief',
    subtitle: '根据当前项目路径、活动文件和任务状态生成项目简报。',
    badge: 'Brief',
    run: (bridge) => runProjectBrief(bridge),
  },
  {
    id: 'project-plan',
    mode: 'project',
    title: '生成下一步计划',
    subtitle: '适合汇报前快速整理推进路径。',
    badge: 'Plan',
    run: (bridge) => runProjectPlan(bridge),
  },
  {
    id: 'idea-to-todos',
    mode: 'tasks',
    title: '把想法拆成任务',
    subtitle: '先在输入框写想法，再让 AI 拆成可执行清单。',
    badge: 'Draft',
    run: (bridge) => bridge.setDraft('请把下面这段想法拆成可执行待办。输出 JSON 数组，每项包含 title、description、priority。\n\n想法：'),
  },
  {
    id: 'attach-kb',
    mode: 'knowledge',
    title: '引用知识库资料',
    subtitle: '选择资料作为上下文，再进行总结或问答。',
    badge: 'KB',
    run: (bridge) => bridge.pickKnowledgeItems(),
  },
  {
    id: 'attach-file',
    mode: 'knowledge',
    title: '引用任意项目文件',
    subtitle: '适合跨文件分析、接口说明、需求对齐。',
    badge: 'File',
    run: (bridge) => bridge.pickProjectFiles(),
  },
];

export function installAIStudio(bridge: AIStudioBridge): void {
  bridgeRef = bridge;
  if (installed) {
    refreshStudioContext();
    return;
  }

  const chatArea = document.querySelector('.ai-chat-area');
  const sidebar = document.getElementById('ai-sidebar');
  const messages = document.getElementById('ai-chat-messages');
  if (!chatArea || !sidebar || !messages) return;

  const board = document.createElement('section');
  board.className = 'ai-studio-board';
  board.innerHTML = renderStudioBoard();
  chatArea.insertBefore(board, messages);

  const contextPanel = document.createElement('section');
  contextPanel.className = 'ai-studio-side-card';
  contextPanel.innerHTML = renderContextPanel();
  sidebar.insertBefore(contextPanel, sidebar.firstChild);

  board.addEventListener('click', (event) => handleStudioBoardClick(event));
  contextPanel.addEventListener('click', (event) => handleContextPanelClick(event));

  window.addEventListener('nova:ai-result', (event) => {
    const detail = (event as CustomEvent<{ text?: string }>).detail;
    lastResult = detail?.text || '';
    renderLastResultPreview();
  });
  window.addEventListener('nova:workspace-changed', refreshStudioContext);
  window.addEventListener('focus', refreshStudioContext);

  installed = true;
  refreshStudioContext();
  consumePendingAIDraft(bridge);
}

export function consumePendingAIDraft(bridge: AIStudioBridge): void {
  const draft = sessionStorage.getItem('nova-ai-draft');
  if (!draft) return;
  sessionStorage.removeItem('nova-ai-draft');
  bridge.setDraft(draft, { focus: true, select: false });
}

function renderStudioBoard(): string {
  return '<div class="ai-studio-compact-head">' +
    '<div class="ai-studio-title-block"><div class="ai-studio-eyebrow">AI WORKSPACE</div><h3>AI 工作台</h3></div>' +
    '<div class="ai-studio-context-pill" id="ai-studio-context-pill">正在读取上下文...</div>' +
    '<button class="ai-studio-action-toggle" type="button" data-ai-toggle-actions="true" aria-expanded="false">工作流</button>' +
  '</div>' +
  '<div class="ai-studio-mode-tabs">' + modes.map(mode =>
    '<button class="ai-studio-mode ' + (mode.id === activeMode ? 'active' : '') + '" data-ai-mode="' + mode.id + '" title="' + escAttr(mode.desc) + '">' +
      '<span class="ai-studio-mode-icon">' + icon(mode.icon) + '</span>' +
      '<span><strong>' + escHtml(mode.title) + '</strong><small>' + escHtml(mode.desc) + '</small></span>' +
    '</button>'
  ).join('') + '</div>' +
  '<div class="ai-studio-actions" id="ai-studio-actions" hidden>' + renderModeActions(activeMode) + '</div>';
}

function renderContextPanel(): string {
  return '<div class="ai-studio-side-head">' +
      '<span class="ai-studio-side-dot"></span><strong>上下文中心</strong>' +
    '</div>' +
    '<div class="ai-studio-context-list" id="ai-studio-context-list"></div>' +
    '<div class="ai-studio-side-actions">' +
      '<button data-ai-side-action="attach-current">引用当前文件</button>' +
      '<button data-ai-side-action="open-files">去文件管理</button>' +
    '</div>' +
    '<div class="ai-studio-last-result" id="ai-studio-last-result">' +
      '<div class="ai-studio-last-title">最近结果</div>' +
      '<p>AI 生成后会在这里出现快速操作。</p>' +
    '</div>';
}

function renderModeActions(mode: StudioMode): string {
  const items = actions.filter(action => action.mode === mode);
  return items.map(action =>
    '<button class="ai-studio-action" data-ai-action="' + escAttr(action.id) + '">' +
      '<span class="ai-studio-action-badge">' + escHtml(action.badge) + '</span>' +
      '<strong>' + escHtml(action.title) + '</strong>' +
      '<small>' + escHtml(action.subtitle) + '</small>' +
    '</button>'
  ).join('');
}

function handleStudioBoardClick(event: Event): void {
  const target = event.target as HTMLElement | null;

  const toggleBtn = target?.closest('[data-ai-toggle-actions]') as HTMLElement | null;
  if (toggleBtn) {
    actionsOpen = !actionsOpen;
    const board = toggleBtn.closest('.ai-studio-board');
    const actionsEl = document.getElementById('ai-studio-actions');
    board?.classList.toggle('is-actions-open', actionsOpen);
    toggleBtn.setAttribute('aria-expanded', actionsOpen ? 'true' : 'false');
    toggleBtn.textContent = actionsOpen ? '收起' : '工作流';
    if (actionsEl) actionsEl.hidden = !actionsOpen;
    return;
  }

  const modeBtn = target?.closest('[data-ai-mode]') as HTMLElement | null;
  if (modeBtn) {
    activeMode = (modeBtn.dataset.aiMode || 'chat') as StudioMode;
    document.querySelectorAll('.ai-studio-mode').forEach(el => el.classList.toggle('active', (el as HTMLElement).dataset.aiMode === activeMode));
    const actionsEl = document.getElementById('ai-studio-actions');
    if (actionsEl) actionsEl.innerHTML = renderModeActions(activeMode);
    return;
  }

  const actionBtn = target?.closest('[data-ai-action]') as HTMLElement | null;
  const actionId = actionBtn?.dataset.aiAction;
  if (!actionId || !bridgeRef) return;
  const action = actions.find(item => item.id === actionId);
  if (!action) return;
  void runActionWithBusy(actionBtn, () => action.run(bridgeRef!));
}

function handleContextPanelClick(event: Event): void {
  const target = event.target as HTMLElement | null;
  const action = (target?.closest('[data-ai-side-action]') as HTMLElement | null)?.dataset.aiSideAction;
  if (!action || !bridgeRef) return;
  if (action === 'attach-current') bridgeRef.attachActiveFile();
  if (action === 'open-files') void switchPage('files');
}

async function runActionWithBusy(button: HTMLElement, runner: () => Promise<void> | void): Promise<void> {
  if (button.dataset.busy === 'true') return;
  button.dataset.busy = 'true';
  button.classList.add('is-running');
  try {
    await runner();
  } finally {
    button.dataset.busy = 'false';
    button.classList.remove('is-running');
  }
}

function refreshStudioContext(): void {
  const snapshot = window.__getActiveFileSnapshot?.();
  const root = getCurrentWorkspaceRoot();
  const pill = document.getElementById('ai-studio-context-pill');
  if (pill) {
    pill.textContent = snapshot
      ? '当前文件 · ' + snapshot.fileName
      : root ? '工作区 · ' + root.split(/[\\/]/).pop() : '未打开工作区';
  }

  const list = document.getElementById('ai-studio-context-list');
  if (!list) return;
  const relative = snapshot?.filePath ? getRelativePath(root, snapshot.filePath) : '';
  list.innerHTML =
    '<div class="ai-context-row"><span>工作区</span><strong>' + escHtml(root ? root.split(/[\\/]/).pop() || root : '未打开') + '</strong></div>' +
    '<div class="ai-context-row"><span>活动文件</span><strong>' + escHtml(snapshot?.fileName || '未选择') + '</strong></div>' +
    '<div class="ai-context-row"><span>相对路径</span><strong>' + escHtml(relative || '-') + '</strong></div>' +
    '<div class="ai-context-row"><span>选中内容</span><strong>' + escHtml(snapshot?.selection ? snapshot.selection.length + ' 字' : '无') + '</strong></div>';
}

function renderLastResultPreview(): void {
  const panel = document.getElementById('ai-studio-last-result');
  if (!panel) return;
  if (!lastResult.trim()) {
    panel.innerHTML = '<div class="ai-studio-last-title">最近结果</div><p>AI 生成后会在这里出现快速操作。</p>';
    return;
  }
  panel.innerHTML =
    '<div class="ai-studio-last-title">最近结果</div>' +
    '<p>' + escHtml(lastResult.slice(0, 120)) + (lastResult.length > 120 ? '...' : '') + '</p>' +
    '<div class="ai-studio-result-actions">' +
      '<button data-ai-result-action="copy">复制</button>' +
      '<button data-ai-result-action="todo">转待办</button>' +
    '</div>';
  panel.querySelector('[data-ai-result-action="copy"]')?.addEventListener('click', async () => {
    await navigator.clipboard?.writeText(lastResult);
  });
  panel.querySelector('[data-ai-result-action="todo"]')?.addEventListener('click', () => {
    sessionStorage.setItem('nova-ai-draft', '请把以下 AI 结果拆成待办事项，输出 JSON 数组：\n\n' + lastResult);
    bridgeRef?.setDraft('请把以下 AI 结果拆成待办事项，输出 JSON 数组：\n\n' + lastResult);
  });
}

async function runWithActiveFile(bridge: AIStudioBridge, instruction: string): Promise<void> {
  const snapshot = window.__getActiveFileSnapshot?.();
  if (!snapshot) {
    bridge.appendSystem('当前没有活动文件。请先在文件管理器打开一个文档。');
    return;
  }
  const source = snapshot.selection || snapshot.content;
  const content = truncate(source, 15000);
  await bridge.sendMessage(`${instruction}\n\n文件：${snapshot.fileName}\n路径：${snapshot.filePath}\n\n${content}`);
}

async function runProjectBrief(bridge: AIStudioBridge): Promise<void> {
  const root = getCurrentWorkspaceRoot();
  const snapshot = window.__getActiveFileSnapshot?.();
  await bridge.sendMessage('请基于当前项目上下文生成一份项目 Brief，包含：项目目标、已有资产、近期变化、风险、下一步建议。\n\n工作区：' + (root || '未打开') + '\n当前文件：' + (snapshot?.fileName || '无') + '\n\n当前文件内容摘要参考：\n' + truncate(snapshot?.content || '', 10000));
}

async function runProjectPlan(bridge: AIStudioBridge): Promise<void> {
  const root = getCurrentWorkspaceRoot();
  const snapshot = window.__getActiveFileSnapshot?.();
  await bridge.sendMessage('请为当前项目生成下一步推进计划。要求：按 3 个阶段输出，每阶段包含目标、任务、风险和验收标准。\n\n工作区：' + (root || '未打开') + '\n当前文件：' + (snapshot?.fileName || '无') + '\n\n参考内容：\n' + truncate(snapshot?.content || '', 10000));
}

function truncate(content: string, limit: number): string {
  if (content.length <= limit) return content;
  return content.slice(0, limit) + '\n\n……内容过长，已截取前 ' + limit + ' 字。';
}

function icon(name: string): string {
  const map: Record<string, string> = {
    spark: '<svg viewBox="0 0 24 24"><path d="M12 2l1.6 5.3L19 9l-5.4 1.7L12 16l-1.6-5.3L5 9l5.4-1.7L12 2z"/><path d="M19 14l.8 2.7L22 17.5l-2.2.8L19 21l-.8-2.7-2.2-.8 2.2-.8L19 14z"/></svg>',
    doc: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/></svg>',
    project: '<svg viewBox="0 0 24 24"><path d="M3 7h18M7 7v14M17 7v14"/><path d="M5 3h14a2 2 0 0 1 2 2v2H3V5a2 2 0 0 1 2-2z"/></svg>',
    task: '<svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    kb: '<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/></svg>',
  };
  return map[name] || map.spark;
}
