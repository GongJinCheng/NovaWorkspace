/**
 * Extract headings from Markdown source for the document-outline panel.
 * Extracted from EditorManager.updateOutline — pure parsing, no DOM.
 */

export interface OutlineHeading {
  level: number;
  text: string;
  slug: string;
  line: number;
}

/**
 * Extract headings (# .. ######) from Markdown source, skipping fenced code
 * blocks. Line numbers are 1-based for editor navigation.
 */
export function extractHeadings(markdown: string): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  const lines = markdown.split('\n');
  let inCode = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const m = line.match(/^(#{1,6})\s+(.+)$/);
    if (m) {
      const text = m[2].trim();
      headings.push({
        level: m[1].length,
        text,
        slug: text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '') || 'section',
        line: i + 1,
      });
    }
  }
  return headings;
}
