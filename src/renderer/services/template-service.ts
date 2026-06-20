import { showInputPrompt, showModal } from '../components/modal';
import { ipcClient } from './ipc-client';
import { getCurrentWorkspaceRoot } from './workspace-context';
import { aiService } from '../pages/ai/ai-service';
import { escHtml } from '../utils/escape';

export type BuiltInTemplateId =
  | 'blank'
  | 'prd'
  | 'meeting'
  | 'tech-plan'
  | 'dev-plan'
  | 'bug-report'
  | 'weekly-report'
  | 'retrospective'
  | 'learning-note'
  | 'ai-prompt';

export interface BuiltInTemplate {
  id: BuiltInTemplateId;
  name: string;
  description: string;
  icon: string;
  suggestedFileName: string;
  content: string;
  aliases: string[];
}

interface TemplateCreateRequest {
  template: BuiltInTemplate;
  fileName: string;
  title: string;
  mode: 'template' | 'ai';
  topic: string;
}

const templates: BuiltInTemplate[] = [
  {
    id: 'blank',
    name: '空白文档',
    description: '创建一个空白 Markdown 文档。',
    icon: '📄',
    suggestedFileName: '未命名文档.md',
    aliases: ['空白', 'blank', 'md'],
    content: '# {{title}}\n\n',
  },
  {
    id: 'prd',
    name: '产品需求文档 PRD',
    description: '用于整理产品背景、目标、范围、用户流程和验收标准。',
    icon: '📌',
    suggestedFileName: '产品需求文档.md',
    aliases: ['prd', '产品需求', '需求文档', '产品'],
    content: `# {{title}}\n\n> 项目：{{projectName}}  \n> 日期：{{date}}\n\n## 1. 背景\n\n说明为什么要做这个需求。\n\n## 2. 用户问题\n\n- 用户当前遇到什么问题？\n- 这个问题出现在哪些场景？\n\n## 3. 目标用户\n\n- \n\n## 4. 核心目标\n\n- \n\n## 5. 功能范围\n\n### 必须做\n\n- \n\n### 可以延后\n\n- \n\n## 6. 非目标\n\n- \n\n## 7. 用户流程\n\n1. \n2. \n3. \n\n## 8. 页面与交互\n\n- \n\n## 9. 技术依赖\n\n- \n\n## 10. 风险与限制\n\n- \n\n## 11. 验收标准\n\n- [ ] \n`,
  },
  {
    id: 'meeting',
    name: '会议纪要',
    description: '记录会议背景、讨论内容、决策事项和后续任务。',
    icon: '📝',
    suggestedFileName: '会议纪要.md',
    aliases: ['会议', '纪要', 'meeting'],
    content: `# {{title}}\n\n## 基本信息\n\n- 时间：{{datetime}}\n- 项目：{{projectName}}\n- 参与人：\n- 主题：\n\n## 讨论内容\n\n- \n\n## 决策事项\n\n- \n\n## 待办任务\n\n- [ ] \n\n## 后续跟进\n\n- \n`,
  },
  {
    id: 'tech-plan',
    name: '技术方案',
    description: '用于设计技术实现、接口、数据结构、步骤和测试计划。',
    icon: '🧩',
    suggestedFileName: '技术方案.md',
    aliases: ['技术方案', '架构', 'tech', '方案'],
    content: `# {{title}}\n\n> 项目：{{projectName}}  \n> 日期：{{date}}\n\n## 背景\n\n\n## 目标\n\n- \n\n## 当前问题\n\n- \n\n## 方案设计\n\n\n## 数据结构\n\n\`\`\`ts\n// TODO\n\`\`\`\n\n## 接口设计\n\n\n## 实现步骤\n\n1. \n2. \n3. \n\n## 风险点\n\n- \n\n## 测试计划\n\n- [ ] \n`,
  },
  {
    id: 'dev-plan',
    name: '开发计划',
    description: '把开发目标拆成阶段、任务、风险和验收标准。',
    icon: '🗺️',
    suggestedFileName: '开发计划.md',
    aliases: ['开发计划', '计划', 'roadmap', 'plan'],
    content: `# {{title}}\n\n## 目标\n\n\n## 阶段规划\n\n### 阶段一\n\n- [ ] \n\n### 阶段二\n\n- [ ] \n\n### 阶段三\n\n- [ ] \n\n## 任务拆分\n\n| 任务 | 优先级 | 状态 | 备注 |\n|---|---|---|---|\n|  | 中 | 未开始 |  |\n\n## 风险与阻塞\n\n- \n\n## 验收标准\n\n- [ ] \n`,
  },
  {
    id: 'bug-report',
    name: 'Bug 记录',
    description: '记录问题现象、复现步骤、预期结果和修复方案。',
    icon: '🐞',
    suggestedFileName: 'Bug记录.md',
    aliases: ['bug', '问题', '缺陷', '记录'],
    content: `# {{title}}\n\n## 问题描述\n\n\n## 影响范围\n\n- \n\n## 复现步骤\n\n1. \n2. \n3. \n\n## 实际结果\n\n\n## 预期结果\n\n\n## 环境信息\n\n- 系统：\n- 版本：\n- 模块：\n\n## 初步判断\n\n\n## 修复方案\n\n- [ ] \n`,
  },
  {
    id: 'weekly-report',
    name: '周报',
    description: '整理本周完成、问题、下周计划和需要协助的事项。',
    icon: '📅',
    suggestedFileName: '周报.md',
    aliases: ['周报', 'weekly', 'report'],
    content: `# {{title}}\n\n> 项目：{{projectName}}  \n> 日期：{{date}}\n\n## 本周完成\n\n- \n\n## 本周问题\n\n- \n\n## 下周计划\n\n- [ ] \n\n## 风险与阻塞\n\n- \n\n## 需要协助\n\n- \n`,
  },
  {
    id: 'retrospective',
    name: '项目复盘',
    description: '用于复盘目标、结果、经验、问题和后续改进。',
    icon: '🔁',
    suggestedFileName: '项目复盘.md',
    aliases: ['复盘', 'retro', 'review'],
    content: `# {{title}}\n\n## 项目背景\n\n\n## 原定目标\n\n- \n\n## 实际结果\n\n- \n\n## 做得好的地方\n\n- \n\n## 存在的问题\n\n- \n\n## 经验总结\n\n- \n\n## 后续改进\n\n- [ ] \n`,
  },
  {
    id: 'learning-note',
    name: '学习笔记',
    description: '记录知识点、例子、总结和待深入问题。',
    icon: '📚',
    suggestedFileName: '学习笔记.md',
    aliases: ['学习', '笔记', 'note'],
    content: `# {{title}}\n\n## 学习目标\n\n\n## 核心概念\n\n- \n\n## 关键内容\n\n\n## 示例\n\n\`\`\`\n\n\`\`\`\n\n## 我的理解\n\n\n## 待深入问题\n\n- [ ] \n\n## 参考资料\n\n- \n`,
  },
  {
    id: 'ai-prompt',
    name: 'AI Prompt',
    description: '沉淀常用提示词、输入变量、输出格式和测试结果。',
    icon: '🤖',
    suggestedFileName: 'AI Prompt.md',
    aliases: ['prompt', '提示词', 'ai'],
    content: `# {{title}}\n\n## 使用场景\n\n\n## 角色设定\n\n你是一个...\n\n## 输入变量\n\n- \`{{input}}\`：\n\n## Prompt\n\n\`\`\`text\n\n\`\`\`\n\n## 输出格式\n\n\`\`\`json\n{\n  \n}\n\`\`\`\n\n## 测试记录\n\n- \n`,
  },
];

export function getBuiltInTemplates(): BuiltInTemplate[] {
  return templates;
}

export function findTemplate(id: string): BuiltInTemplate | undefined {
  return templates.find((template) => template.id === id || template.aliases.includes(id.toLowerCase()));
}

export async function createDocumentFromTemplate(
  templateId?: string,
  options: { targetDir?: string | null; openFile?: (filePath: string, fileName: string) => void | Promise<void>; afterCreate?: () => void | Promise<void> } = {}
): Promise<string | null> {
  const targetDir = options.targetDir || getCurrentWorkspaceRoot();
  if (!targetDir) {
    alert('请先打开一个工作区');
    return null;
  }

  const root = getCurrentWorkspaceRoot();
  const projectName = await getProjectName(root);
  const request = await showTemplateCreateDialog(templateId, { projectName });
  if (!request) return null;

  const baseContent = applyTemplateVariables(request.template.content, { title: request.title, projectName });
  let content = baseContent;
  if (request.mode === 'ai') {
    content = await generateTemplateContentWithAI(request, projectName, baseContent);
  }

  try {
    const filePath = await ipcClient.fs.createFile(targetDir, request.fileName);
    await ipcClient.fs.writeFile(filePath, content);
    await rememberRecentTemplate(request.template.id);
    await options.afterCreate?.();
    await options.openFile?.(filePath, request.fileName);
    window.dispatchEvent(new CustomEvent('nova:workspace-changed'));
    return filePath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    alert('创建模板文档失败：' + message);
    return null;
  }
}

export function buildTemplateCommandResults(action: (template: BuiltInTemplate) => void | Promise<void>): Array<{ id: string; group: string; title: string; subtitle: string; icon: string; action: () => void | Promise<void> }> {
  return sortTemplatesByRecent(templates)
    .filter((template) => template.id !== 'blank')
    .map((template) => ({
      id: 'template-' + template.id,
      group: '模板',
      title: '从模板创建：' + template.name,
      subtitle: template.description + ' · 支持 AI 填充',
      icon: template.icon,
      action: () => action(template),
    }));
}

async function showTemplateCreateDialog(templateId: string | undefined, input: { projectName: string }): Promise<TemplateCreateRequest | null> {
  const aiConfigured = await isAIConfigured();
  return new Promise((resolve) => {
    let resolved = false;
    let selectedId: BuiltInTemplateId = (templateId && findTemplate(templateId)?.id) || getPreferredTemplateId();
    let mode: 'template' | 'ai' = aiConfigured && selectedId !== 'blank' ? 'ai' : 'template';
    let overlay: HTMLElement;

    const done = (value: TemplateCreateRequest | null) => {
      if (resolved) return;
      resolved = true;
      overlay?.remove();
      resolve(value);
    };

    const currentTemplate = () => findTemplate(selectedId) || templates[0];
    const cards = sortTemplatesByRecent(templates).map((template) =>
      '<button class="template-card' + (template.id === selectedId ? ' selected' : '') + '" data-template-id="' + escAttr(template.id) + '">' +
        '<span class="template-card-icon">' + escHtml(template.icon) + '</span>' +
        '<span class="template-card-main"><strong>' + escHtml(template.name) + '</strong><em>' + escHtml(template.description) + '</em></span>' +
      '</button>'
    ).join('');

    const defaultName = ensureMarkdownFileName(currentTemplate().suggestedFileName);
    const aiDisabledText = aiConfigured ? '' : '<div class="template-ai-disabled">未配置 AI 时只能创建普通模板。可到设置页配置 OpenAI Compatible API。</div>';

    overlay = showModal({
      title: templateId ? '从模板创建文档' : '新建文档',
      content:
        '<div class="template-create-intro">' +
          '<div>' +
            '<p class="modal-message">选择一个文档模板，Nova 会在当前工作区生成 Markdown。你也可以让 AI 根据主题直接填充完整内容。</p>' +
          '</div>' +
          '<span class="template-create-project-pill">项目：' + escHtml(input.projectName) + '</span>' +
        '</div>' +
        '<div class="template-create-layout">' +
          '<section class="template-picker-section">' +
            '<div class="template-section-title"><strong>选择模板</strong><span>内置常用项目文档</span></div>' +
            '<div class="template-picker-grid">' + cards + '</div>' +
          '</section>' +
          '<aside class="template-create-panel">' +
            '<div class="template-section-title"><strong>创建配置</strong><span>文件名与生成方式</span></div>' +
            '<label class="template-field-label">文件名</label>' +
            '<input id="template-create-name" class="modal-input" type="text" value="' + escAttr(defaultName) + '" />' +
            '<label class="template-field-label">创建方式</label>' +
            '<div class="template-mode-row">' +
              '<button class="template-mode-btn selected" data-mode="template"><strong>仅创建模板</strong><span>保留结构，手动填写</span></button>' +
              '<button class="template-mode-btn' + (mode === 'ai' ? ' selected' : '') + '" data-mode="ai"' + (!aiConfigured ? ' disabled' : '') + '><strong>AI 填充模板</strong><span>根据主题生成内容</span></button>' +
            '</div>' +
            aiDisabledText +
            '<label class="template-field-label">主题 / 需求</label>' +
            '<textarea id="template-create-topic" class="template-topic-input" placeholder="例如：我要开发一个个人库单"' + (mode === 'template' ? ' disabled' : '') + '></textarea>' +
            '<div class="template-create-hint">提示：AI 填充会严格沿用所选模板结构，生成后会自动打开文档。</div>' +
          '</aside>' +
        '</div>',
      actions: [
        { label: '取消', type: 'secondary', onClick: () => done(null) },
        { label: '创建', type: 'primary', onClick: () => {
          const template = currentTemplate();
          const nameInput = overlay.querySelector('#template-create-name') as HTMLInputElement | null;
          const topicInput = overlay.querySelector('#template-create-topic') as HTMLTextAreaElement | null;
          const fileName = ensureMarkdownFileName((nameInput?.value || template.suggestedFileName).trim());
          if (!fileName.trim()) return;
          const title = stripExtension(fileName);
          const topic = (topicInput?.value || '').trim();
          const finalMode = mode === 'ai' && aiConfigured && template.id !== 'blank' && topic ? 'ai' : 'template';
          done({ template, fileName, title, mode: finalMode, topic });
        } },
      ],
      onClose: () => done(null),
    });
    overlay.classList.add('template-create-modal');

    const syncSelectedTemplate = (template: BuiltInTemplate) => {
      const nameInput = overlay.querySelector('#template-create-name') as HTMLInputElement | null;
      if (nameInput && !nameInput.dataset.touched) nameInput.value = ensureMarkdownFileName(template.suggestedFileName);
      if (template.id === 'blank' && mode === 'ai') setMode('template');
    };

    const setMode = (nextMode: 'template' | 'ai') => {
      if (nextMode === 'ai' && (!aiConfigured || currentTemplate().id === 'blank')) return;
      mode = nextMode;
      overlay.querySelectorAll('.template-mode-btn').forEach((button) => button.classList.toggle('selected', (button as HTMLElement).dataset.mode === mode));
      const topicInput = overlay.querySelector('#template-create-topic') as HTMLTextAreaElement | null;
      if (topicInput) topicInput.disabled = mode !== 'ai';
      if (mode === 'ai') topicInput?.focus();
    };

    overlay.querySelectorAll('.template-card').forEach((card) => {
      card.addEventListener('click', () => {
        selectedId = ((card as HTMLElement).dataset.templateId as BuiltInTemplateId) || selectedId;
        overlay.querySelectorAll('.template-card').forEach((item) => item.classList.toggle('selected', item === card));
        syncSelectedTemplate(currentTemplate());
      });
      card.addEventListener('dblclick', () => {
        selectedId = ((card as HTMLElement).dataset.templateId as BuiltInTemplateId) || selectedId;
        overlay.querySelectorAll('.template-card').forEach((item) => item.classList.toggle('selected', item === card));
        syncSelectedTemplate(currentTemplate());
      });
    });

    const nameInput = overlay.querySelector('#template-create-name') as HTMLInputElement | null;
    nameInput?.addEventListener('input', () => { nameInput.dataset.touched = 'true'; });
    overlay.querySelectorAll('.template-mode-btn').forEach((button) => {
      button.addEventListener('click', () => setMode(((button as HTMLElement).dataset.mode as 'template' | 'ai') || 'template'));
    });
    setMode(mode);
  });
}

async function generateTemplateContentWithAI(request: TemplateCreateRequest, projectName: string, baseContent: string): Promise<string> {
  const loading = showModal({
    title: 'AI 正在生成文档',
    content: '<p class="modal-message">正在根据“' + escHtml(request.topic) + '”填充 ' + escHtml(request.template.name) + '，请稍候...</p><div class="template-loading-bar"><span></span></div>',
    actions: [],
  });

  try {
    const result = await aiService.chat([
      {
        role: 'system',
        content: '你正在帮助用户基于 Markdown 模板生成项目文档。严格按照用户提供的模板结构输出 Markdown，不要输出解释，不要包裹代码块，不要删除模板中的主要标题。内容要具体、可执行，并且适合直接保存为项目文档。',
      },
      {
        role: 'user',
        content:
          '项目名称：\n' + projectName +
          '\n\n文档类型：\n' + request.template.name +
          '\n\n文档标题：\n' + request.title +
          '\n\n用户主题 / 需求：\n' + request.topic +
          '\n\n模板结构：\n' + baseContent +
          '\n\n要求：\n1. 严格按照模板结构生成 Markdown。\n2. 每个章节都要填入具体内容，不要只保留空标题。\n3. 如果信息不足，请基于主题做合理占位和待确认项。\n4. 不要输出 ``` 代码围栏包裹整篇文档。\n5. 不要输出额外解释。',
      },
    ], { temperature: 0.55, max_tokens: 4096, timeout: 60000 });
    const cleaned = cleanGeneratedMarkdown(result).trim();
    return cleaned || baseContent;
  } catch (error) {
    const message = formatAIError(error);
    alert('AI 生成失败，已改为创建普通模板文档。\n\n原因：' + message);
    return baseContent;
  } finally {
    loading.remove();
  }
}

async function isAIConfigured(): Promise<boolean> {
  try {
    await aiService.reloadConfig({ silent: true });
    return aiService.isConfigured();
  } catch {
    return false;
  }
}

async function getProjectName(root: string | null): Promise<string> {
  let projectName = root ? root.split(/[\\/]/).pop() || '当前项目' : '当前项目';
  if (root) {
    try {
      const meta = await ipcClient.workspace.getProjectMeta(root);
      projectName = meta.name || projectName;
    } catch {
      // ignore
    }
  }
  return projectName;
}

function applyTemplateVariables(template: string, input: { title: string; projectName: string }): string {
  const now = new Date();
  const date = now.toLocaleDateString('zh-CN');
  const datetime = now.toLocaleString('zh-CN', { hour12: false });
  return template
    .replace(/{{title}}/g, input.title)
    .replace(/{{projectName}}/g, input.projectName)
    .replace(/{{date}}/g, date)
    .replace(/{{datetime}}/g, datetime);
}

function ensureMarkdownFileName(value: string): string {
  return /\.[a-z0-9]+$/i.test(value) ? value : value + '.md';
}

function stripExtension(value: string): string {
  return value.replace(/\.[^.]+$/, '');
}

function cleanGeneratedMarkdown(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function formatAIError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/api key|unauthorized|401/i.test(raw)) return 'API Key 无效或权限不足';
  if (/timeout|timed out|aborted/i.test(raw)) return 'AI 请求超时';
  if (/model|404/i.test(raw)) return '模型名称可能不正确';
  if (/quota|billing|余额|额度/i.test(raw)) return '模型额度不足或账号未开通';
  if (/network|fetch|ENOTFOUND|ECONN/i.test(raw)) return '网络连接失败或 Base URL 不可用';
  return raw || '未知错误';
}

function getPreferredTemplateId(): BuiltInTemplateId {
  const recent = getRecentTemplateIds();
  const firstRecent = recent.find((id) => templates.some((template) => template.id === id));
  return (firstRecent as BuiltInTemplateId | undefined) || templates[1]?.id || templates[0].id;
}

function sortTemplatesByRecent(items: BuiltInTemplate[]): BuiltInTemplate[] {
  const recent = getRecentTemplateIds();
  return [...items].sort((a, b) => {
    const ai = recent.indexOf(a.id);
    const bi = recent.indexOf(b.id);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

async function rememberRecentTemplate(id: BuiltInTemplateId): Promise<void> {
  try {
    const next = [id, ...getRecentTemplateIds().filter((item) => item !== id)].slice(0, 6);
    localStorage.setItem('nova-recent-template-ids', JSON.stringify(next));
  } catch {
    // ignore
  }
}

function getRecentTemplateIds(): BuiltInTemplateId[] {
  try {
    const raw = localStorage.getItem('nova-recent-template-ids');
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item === 'string') as BuiltInTemplateId[];
  } catch {
    return [];
  }
}

function escAttr(text: string): string {
  return escHtml(text).replace(/"/g, '&quot;');
}
