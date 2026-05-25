/**
 * Lightweight Markdown preview renderer.
 *
 * This intentionally avoids a runtime dependency so the current esbuild/Electron
 * setup can keep working with the existing package.json. The renderer escapes all
 * raw text first and then supports the common Markdown blocks used by notes/docs.
 */

export function isMarkdownFile(fileNameOrPath: string): boolean {
  return /\.(md|markdown|mdown|mkdn)$/i.test(fileNameOrPath);
}

export function renderMarkdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let paragraph: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let inCode = false;
  let codeLang = '';
  let codeLines: string[] = [];
  let inBlockquote = false;
  let quoteLines: string[] = [];
  let tableBuffer: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push('<p>' + parseInline(paragraph.join(' ')) + '</p>');
    paragraph = [];
  };

  const flushList = () => {
    if (!listType) return;
    html.push('</' + listType + '>');
    listType = null;
  };

  const flushQuote = () => {
    if (!inBlockquote) return;
    html.push('<blockquote>' + quoteLines.map(line => '<p>' + parseInline(line) + '</p>').join('') + '</blockquote>');
    inBlockquote = false;
    quoteLines = [];
  };

  const flushTable = () => {
    if (!tableBuffer.length) return;
    const tableHtml = renderTable(tableBuffer);
    if (tableHtml) html.push(tableHtml);
    else paragraph.push(...tableBuffer);
    tableBuffer = [];
  };

  const flushBlocks = () => {
    flushParagraph();
    flushList();
    flushQuote();
    flushTable();
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (!inCode) {
        flushBlocks();
        inCode = true;
        codeLang = trimmed.slice(3).trim();
        codeLines = [];
      } else {
        html.push(
          '<pre><code' + (codeLang ? ' class="language-' + escapeAttr(codeLang) + '"' : '') + '>' +
          escapeHtml(codeLines.join('\n')) +
          '</code></pre>'
        );
        inCode = false;
        codeLang = '';
        codeLines = [];
      }
      continue;
    }

    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      flushQuote();
      flushTable();
      continue;
    }

    if (/^\|.+\|$/.test(trimmed)) {
      flushParagraph();
      flushList();
      flushQuote();
      tableBuffer.push(trimmed);
      continue;
    }
    flushTable();

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushBlocks();
      const level = heading[1].length;
      const text = heading[2].trim();
      html.push('<h' + level + ' id="' + slugify(text) + '">' + parseInline(text) + '</h' + level + '>');
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      flushBlocks();
      html.push('<hr>');
      continue;
    }

    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      if (!inBlockquote) inBlockquote = true;
      quoteLines.push(quote[1]);
      continue;
    }
    flushQuote();

    const unordered = trimmed.match(/^[-*+]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
        html.push('<ul>');
      }
      html.push('<li>' + parseInline(unordered[1]) + '</li>');
      continue;
    }

    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
        html.push('<ol>');
      }
      html.push('<li>' + parseInline(ordered[1]) + '</li>');
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  if (inCode) {
    html.push('<pre><code' + (codeLang ? ' class="language-' + escapeAttr(codeLang) + '"' : '') + '>' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
  }
  flushBlocks();

  return html.join('\n') || '<p class="markdown-empty">暂无内容</p>';
}

function renderTable(lines: string[]): string | null {
  if (lines.length < 2) return null;
  const separator = lines[1];
  if (!/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(separator)) return null;

  const rows = lines.map(splitTableRow);
  const headers = rows[0] || [];
  const bodyRows = rows.slice(2);

  return '<table><thead><tr>' +
    headers.map(cell => '<th>' + parseInline(cell.trim()) + '</th>').join('') +
    '</tr></thead><tbody>' +
    bodyRows.map(row => '<tr>' + row.map(cell => '<td>' + parseInline(cell.trim()) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table>';
}

function splitTableRow(row: string): string[] {
  return row.replace(/^\|/, '').replace(/\|$/, '').split('|');
}

function parseInline(input: string): string {
  let text = escapeHtml(input);

  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/(^|\s)\*([^*]+)\*(?=\s|$|[.,;:!?])/g, '$1<em>$2</em>');
  text = text.replace(/(^|\s)_([^_]+)_(?=\s|$|[.,;:!?])/g, '$1<em>$2</em>');
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  return text;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
}
