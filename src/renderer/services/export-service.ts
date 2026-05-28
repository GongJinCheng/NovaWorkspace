import { ipcClient } from './ipc-client';
import { renderMarkdownToHtml } from '../pages/files/markdown-preview';

export type ExportFormat = 'markdown' | 'html' | 'pdf';

export interface ExportMarkdownOptions {
  title: string;
  fileName: string;
  markdown: string;
}

export async function exportMarkdownDocument(format: ExportFormat, input: ExportMarkdownOptions): Promise<string | null> {
  const defaultFileName = normalizeExportFileName(input.fileName, format);
  const html = format === 'markdown' ? undefined : buildExportHtml({
    title: input.title,
    bodyHtml: renderMarkdownToHtml(input.markdown),
    subtitle: 'Nova 文档导出',
  });
  const result = await ipcClient.fs.exportDocument({
    format,
    defaultFileName,
    title: input.title,
    markdown: input.markdown,
    html,
  });
  return result.canceled ? null : result.filePath || null;
}

export function buildProjectReportMarkdown(input: {
  name: string;
  description: string;
  rootPath: string;
  documentStat: { totalMarkdown: number; totalFiles: number; lastEditedAt: string | null };
  todoStat: { total: number; pending: number; completed: number; overdue: number; today: number };
  historyStat: { totalVersions: number; lastVersionAt: string | null };
  recentDocuments: Array<{ name: string; relativePath: string; modifiedAt: string }>;
  activities: Array<{ title: string; subtitle?: string; createdAt: string }>;
  ai: { providerName: string | null; model: string | null; configured: boolean };
}): string {
  const docs = input.recentDocuments.length
    ? input.recentDocuments.map((doc) => `- ${doc.relativePath}（${formatDateTime(doc.modifiedAt)}）`).join('\n')
    : '- 暂无最近文档';
  const activities = input.activities.length
    ? input.activities.slice(0, 12).map((item) => `- ${formatDateTime(item.createdAt)} · ${item.title}${item.subtitle ? `：${item.subtitle}` : ''}`).join('\n')
    : '- 暂无最近活动';

  return `# ${input.name} 项目报告

> 导出时间：${formatDateTime(new Date().toISOString())}

## 项目信息

- 项目名称：${input.name}
- 项目路径：${input.rootPath}
- 项目描述：${input.description || '暂无项目描述'}
- AI 状态：${input.ai.configured ? `${input.ai.providerName || 'AI'} / ${input.ai.model || '未选择模型'}` : '未配置 AI 模型'}

## 文档统计

| 指标 | 数值 |
|---|---:|
| Markdown 文档 | ${input.documentStat.totalMarkdown} |
| 总文件数 | ${input.documentStat.totalFiles} |
| 最近编辑 | ${input.documentStat.lastEditedAt ? formatDateTime(input.documentStat.lastEditedAt) : '暂无'} |

## 待办统计

| 指标 | 数值 |
|---|---:|
| 总任务 | ${input.todoStat.total} |
| 未完成 | ${input.todoStat.pending} |
| 已完成 | ${input.todoStat.completed} |
| 今日到期 | ${input.todoStat.today} |
| 已逾期 | ${input.todoStat.overdue} |

## 版本历史

| 指标 | 数值 |
|---|---:|
| 历史版本数量 | ${input.historyStat.totalVersions} |
| 最近保存版本 | ${input.historyStat.lastVersionAt ? formatDateTime(input.historyStat.lastVersionAt) : '暂无'} |

## 最近文档

${docs}

## 最近活动

${activities}

## 下一步建议

- [ ] 处理逾期和今日到期任务
- [ ] 检查最近文档是否需要补充待办
- [ ] 根据项目概览生成下一阶段计划
`;
}

export async function exportProjectReport(format: ExportFormat, overview: Parameters<typeof buildProjectReportMarkdown>[0]): Promise<string | null> {
  const markdown = buildProjectReportMarkdown(overview);
  const title = `${overview.name} 项目报告`;
  const html = format === 'markdown' ? undefined : buildExportHtml({
    title,
    subtitle: 'Nova 项目报告',
    bodyHtml: renderMarkdownToHtml(markdown),
  });
  const result = await ipcClient.fs.exportDocument({
    format,
    defaultFileName: normalizeExportFileName(`${overview.name}-项目报告.md`, format),
    title,
    markdown,
    html,
  });
  return result.canceled ? null : result.filePath || null;
}

export function buildExportHtml(input: { title: string; subtitle?: string; bodyHtml: string }): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(input.title)}</title>
  <style>
    :root {
      color-scheme: light;
      --accent: #6366f1;
      --text: #171725;
      --muted: #6b7280;
      --line: #e5e7eb;
      --soft: #f7f7fb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f3f4f8;
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
    }
    .nova-export {
      max-width: 900px;
      margin: 40px auto;
      background: #fff;
      border-radius: 20px;
      box-shadow: 0 24px 80px rgba(15, 23, 42, .10);
      overflow: hidden;
    }
    .nova-export-header {
      padding: 34px 48px 26px;
      border-bottom: 1px solid var(--line);
      background: linear-gradient(135deg, #ffffff, #f7f7ff);
    }
    .nova-export-kicker {
      display: inline-flex;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(99, 102, 241, .12);
      color: var(--accent);
      font-weight: 700;
      font-size: 12px;
      margin-bottom: 14px;
    }
    .nova-export-header h1 {
      margin: 0;
      font-size: 32px;
      line-height: 1.25;
      letter-spacing: -0.03em;
    }
    .nova-export-header p {
      margin: 10px 0 0;
      color: var(--muted);
    }
    .nova-export-body {
      padding: 36px 48px 48px;
    }
    .nova-export-body h1:first-child { margin-top: 0; }
    h1, h2, h3, h4 { color: #111827; line-height: 1.35; }
    h1 { font-size: 30px; margin: 0 0 24px; }
    h2 { font-size: 22px; margin: 32px 0 14px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }
    h3 { font-size: 18px; margin: 24px 0 12px; }
    p, li { line-height: 1.75; }
    a { color: var(--accent); }
    code { background: #f3f4f6; border-radius: 6px; padding: 2px 6px; font-family: "SFMono-Regular", Consolas, monospace; }
    pre { background: #111827; color: #f9fafb; border-radius: 14px; padding: 18px; overflow: auto; }
    pre code { background: transparent; padding: 0; color: inherit; }
    blockquote { margin: 18px 0; padding: 12px 18px; border-left: 4px solid var(--accent); background: #f4f5ff; color: #4b5563; }
    table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 14px; }
    th, td { border: 1px solid var(--line); padding: 10px 12px; text-align: left; }
    th { background: var(--soft); }
    img { max-width: 100%; border-radius: 12px; }
    @media print {
      body { background: #fff; }
      .nova-export { margin: 0; box-shadow: none; border-radius: 0; max-width: none; }
      .nova-export-header, .nova-export-body { padding-left: 0; padding-right: 0; }
    }
  </style>
</head>
<body>
  <article class="nova-export">
    <header class="nova-export-header">
      <span class="nova-export-kicker">${escapeHtml(input.subtitle || 'Nova Export')}</span>
      <h1>${escapeHtml(input.title)}</h1>
      <p>由 Nova Workspace 导出 · ${formatDateTime(new Date().toISOString())}</p>
    </header>
    <section class="nova-export-body">
      ${input.bodyHtml}
    </section>
  </article>
</body>
</html>`;
}

function normalizeExportFileName(fileName: string, format: ExportFormat): string {
  const ext = format === 'pdf' ? '.pdf' : format === 'html' ? '.html' : '.md';
  const base = (fileName || 'Nova 导出').replace(/[\\/:*?"<>|]+/g, '_').replace(/\.[^.]+$/, '');
  return base + ext;
}

function formatDateTime(value: string): string {
  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return value;
  }
}

function escapeHtml(value: string): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
