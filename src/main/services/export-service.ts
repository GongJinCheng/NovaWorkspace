import { BrowserWindow, dialog } from 'electron';
import fs from 'fs/promises';
import { getMainWindow } from '../windows/main-window';
import type { ExportDocumentInput, ExportDocumentResult } from '../../shared/types/file';

function normalizeExportName(fileName: string, ext: string): string {
  const safe = String(fileName || 'Nova 导出').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Nova 导出';
  return safe.toLowerCase().endsWith(ext) ? safe : safe.replace(/\.[^.]+$/, '') + ext;
}

function getExportHtml(input: { html?: string; markdown?: string; title?: string }): string {
  if (input.html && /<html[\s>]/i.test(input.html)) return input.html;
  const body = input.html || `<pre>${escapeHtml(input.markdown || '')}</pre>`;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(input.title || 'Nova 导出')}</title>
  <style>
    body { margin: 0; background: #f6f7fb; color: #171725; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; }
    .nova-export-page { max-width: 860px; margin: 40px auto; padding: 48px 56px; background: #fff; border-radius: 18px; box-shadow: 0 20px 60px rgba(15, 23, 42, .08); }
    @media print { body { background: #fff; } .nova-export-page { margin: 0; padding: 0; box-shadow: none; border-radius: 0; max-width: none; } }
    h1, h2, h3 { color: #111827; line-height: 1.3; }
    h1 { font-size: 32px; margin: 0 0 24px; }
    h2 { font-size: 22px; margin: 32px 0 14px; border-bottom: 1px solid #edf0f5; padding-bottom: 8px; }
    h3 { font-size: 18px; margin: 24px 0 12px; }
    p, li { line-height: 1.75; }
    code { background: #f4f5fb; border-radius: 6px; padding: 2px 6px; }
    pre { background: #111827; color: #f9fafb; border-radius: 12px; padding: 18px; overflow: auto; }
    blockquote { margin: 16px 0; padding: 12px 18px; border-left: 4px solid #6366f1; background: #f4f5ff; color: #4b5563; }
    table { width: 100%; border-collapse: collapse; margin: 18px 0; }
    th, td { border: 1px solid #e5e7eb; padding: 10px 12px; text-align: left; }
    th { background: #f9fafb; }
  </style>
</head>
<body>
  <main class="nova-export-page">${body}</main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function printHtmlToPdf(html: string): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  try {
    const loadPromise = win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const loadTimeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('PDF 页面加载超时')), 15000);
    });
    await Promise.race([loadPromise, loadTimeout]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const printPromise = win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      landscape: false,
    });
    const printTimeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('PDF 生成超时')), 30000);
    });
    return await Promise.race([printPromise, printTimeout]);
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

export async function handleExportDocument(input: ExportDocumentInput): Promise<ExportDocumentResult> {
  try {
    const win = getMainWindow();
    if (!win) return { canceled: true };
    const format = input.format || 'markdown';
    const ext = format === 'pdf' ? '.pdf' : format === 'html' ? '.html' : '.md';
    const defaultPath = normalizeExportName(input.defaultFileName || 'Nova 导出', ext);
    const result = await dialog.showSaveDialog(win, {
      title: format === 'pdf' ? '导出 PDF' : format === 'html' ? '导出 HTML' : '导出 Markdown',
      defaultPath,
      filters: [
        format === 'pdf' ? { name: 'PDF 文档', extensions: ['pdf'] } :
        format === 'html' ? { name: 'HTML 文档', extensions: ['html'] } :
        { name: 'Markdown 文档', extensions: ['md'] },
      ],
    });

    if (result.canceled || !result.filePath) return { canceled: true };
    if (format === 'markdown') {
      await fs.writeFile(result.filePath, input.markdown || '', 'utf-8');
      return { canceled: false, filePath: result.filePath };
    }

    const html = getExportHtml(input);
    if (format === 'html') {
      await fs.writeFile(result.filePath, html, 'utf-8');
      return { canceled: false, filePath: result.filePath };
    }

    const pdf = await printHtmlToPdf(html);
    await fs.writeFile(result.filePath, pdf);
    return { canceled: false, filePath: result.filePath };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error('导出失败: ' + msg);
  }
}
