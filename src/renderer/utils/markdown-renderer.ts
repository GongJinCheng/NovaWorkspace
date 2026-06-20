/**
 * Markdown renderer for AI assistant responses.
 * Uses `marked` for parsing and `highlight.js` for code syntax highlighting.
 */
import { Marked } from 'marked';
import hljs from 'highlight.js/lib/core';

// Register commonly-used languages to keep bundle small.
// Users can add more by importing from highlight.js/lib/languages/*.
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import java from 'highlight.js/lib/languages/java';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import php from 'highlight.js/lib/languages/php';
import ruby from 'highlight.js/lib/languages/ruby';
import shell from 'highlight.js/lib/languages/shell';
import markdown from 'highlight.js/lib/languages/markdown';
import diff from 'highlight.js/lib/languages/diff';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('java', java);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('rs', rust);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('c', cpp);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('cs', csharp);
hljs.registerLanguage('php', php);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('rb', ruby);
hljs.registerLanguage('shell', shell);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('diff', diff);

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    code({ text, lang }: { text: string; lang?: string }): string {
      // Mermaid diagrams: wrap in a special div for async rendering
      if (lang === 'mermaid') {
        return '<div class="nova-mermaid mermaid">' + escapeHtml(text) + '</div>';
      }
      const language = lang && hljs.getLanguage(lang) ? lang : '';
      let highlighted: string;
      try {
        highlighted = language
          ? hljs.highlight(text, { language }).value
          : escapeHtml(text);
      } catch {
        highlighted = escapeHtml(text);
      }
      const langLabel = language ? '<span class="md-code-lang">' + escapeHtml(language) + '</span>' : '';
      const copyBtn = '<button class="md-code-copy" title="Copy code" data-code="' + escapeAttr(text) + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>';
      return '<div class="md-code-block">' +
        '<div class="md-code-header">' + langLabel + copyBtn + '</div>' +
        '<pre><code class="hljs' + (language ? ' language-' + escapeAttr(language) : '') + '">' + highlighted + '</code></pre>' +
        '</div>';
    },
    codespan({ text }: { text: string }): string {
      return '<code class="md-inline-code">' + text + '</code>';
    },
  },
});

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str: string): string {
  return escapeHtml(str).replace(/`/g, '&#96;');
}

/**
 * Render Markdown content to HTML string.
 * Safe for direct insertion into DOM via innerHTML.
 */
export function renderMarkdown(content: string): string {
  if (!content) return '';
  try {
    const result = marked.parse(content);
    return typeof result === 'string' ? result : '';
  } catch {
    // Fallback: basic HTML escaping with line breaks
    return escapeHtml(content).replace(/\n/g, '<br>');
  }
}

/**
 * Lightweight markdown render for streaming.
 * Skips expensive highlighting during streaming for better performance.
 */
export function renderMarkdownStream(content: string): string {
  if (!content) return '';
  try {
    const result = marked.parse(content);
    return typeof result === 'string' ? result : '';
  } catch {
    return escapeHtml(content).replace(/\n/g, '<br>');
  }
}
