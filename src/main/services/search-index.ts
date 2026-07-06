/**
 * Search Index Service
 *
 * Provides fast, in-memory search across workspace files using a
 * lightweight inverted index. Supports incremental updates when files
 * change, fuzzy file-name matching, and rich content search with
 * highlighted snippets.
 *
 * Architecture:
 *  - One index per workspace root (lazy-built on first search).
 *  - File metadata + content tokens cached in memory.
 *  - Token → file-path inverted map for O(1) content lookup.
 *  - Incremental re-index on WRITE_FILE / CREATE_FILE / DELETE / RENAME.
 */

import fs from 'fs/promises';
import path from 'path';

// ── Types ──────────────────────────────────────────────────────────

export interface IndexedFile {
  filePath: string;
  name: string;
  ext: string;
  relativePath: string;
  modifiedAt: string;
  size: number;
  isText: boolean;
  lineCount: number;
}

export interface ContentMatch {
  line: number;
  snippet: string;
}

export interface SearchResult {
  type: 'file' | 'content';
  name: string;
  path: string;
  relativePath: string;
  workspacePath: string;
  workspaceName: string;
  ext: string;
  modifiedAt: string;
  size: number;
  matchCount: number;
  matches: ContentMatch[];
  score: number;
}

export interface SearchFilter {
  ext?: string;
  type?: 'file' | 'content';
}

// ── Constants ──────────────────────────────────────────────────────

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.nova', 'dist', 'release', 'build',
  'out', '.next', '.cache', 'coverage', '.idea', '.vscode',
  '__pycache__', 'venv', '.venv', 'vendor',
]);

const TEXT_EXTS = new Set([
  '.md', '.txt', '.json', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.css', '.html', '.htm', '.yml', '.yaml', '.xml', '.csv',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.cpp',
  '.h', '.hpp', '.cs', '.php', '.sh', '.bash', '.zsh', '.fish',
  '.sql', '.graphql', '.proto', '.toml', '.ini', '.cfg', '.conf',
  '.env', '.gitignore', '.dockerignore', '.editorconfig',
  '.vue', '.svelte', '.astro', '.scss', '.sass', '.less',
]);

const MAX_FILE_SIZE = 512 * 1024; // 512 KB – skip huge files for content indexing
const MAX_DEPTH = 7;
const SNIPPET_CONTEXT = 60; // chars around each match
const MAX_MATCHES_PER_FILE = 8;
const MAX_FILES = 8000;

// ── Token helpers ──────────────────────────────────────────────────

/** Split text into searchable tokens (words + CJK chars). */
function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];

  // Extract word tokens (2+ chars)
  const wordRe = /[a-z0-9_]{2,}/g;
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(lower)) !== null) {
    tokens.push(m[0]);
  }

  // Extract CJK characters individually
  const cjkRe = /[\u4e00-\u9fff\u3400-\u4dbf]/g;
  while ((m = cjkRe.exec(lower)) !== null) {
    tokens.push(m[0]);
  }

  return tokens;
}

/** Simple fuzzy match: checks if all query chars appear in order within the target. */
function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

/** Score a fuzzy match (higher = better). Penalizes gaps. */
function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let consecutive = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
      consecutive++;
      score += consecutive * 2; // reward consecutive matches
    } else {
      consecutive = 0;
    }
  }
  if (qi < q.length) return 0; // not all chars matched
  // Bonus for matching at the start or in the file name
  if (t.startsWith(q)) score += 20;
  return score;
}

// ── Index ──────────────────────────────────────────────────────────

interface IndexEntry {
  file: IndexedFile;
  /** All tokens extracted from the file content */
  contentTokens: string[];
  /** First portion of the file for snippet generation */
  contentPreview: string;
  /** Full lowercase content (only kept for small files, cleared after build) */
  contentLower: string | null;
}

/**
 * 前缀 Trie：token → 文件集合。
 * 前缀匹配（collect）与按 token 增量增删均为 O(相关 token 长度)，
 * 取代原先遍历整个 tokenIndex 的 O(N) 全量扫描。
 */
class Trie {
  private children = new Map<string, Trie>();
  files: Set<string> | null = null;
  private distinctTokens = 0;

  get tokenCount(): number {
    return this.distinctTokens;
  }

  clear(): void {
    this.children.clear();
    this.files = null;
    this.distinctTokens = 0;
  }

  insert(token: string, file: string): void {
    let node: Trie = this;
    for (const ch of token) {
      let next = node.children.get(ch);
      if (!next) {
        next = new Trie();
        node.children.set(ch, next);
      }
      node = next;
    }
    if (!node.files) {
      node.files = new Set<string>();
      this.distinctTokens += 1;
    }
    node.files.add(file);
  }

  private nodeFor(prefix: string): Trie | null {
    let node: Trie | null = this;
    for (const ch of prefix) {
      node = node.children.get(ch) ?? null;
      if (!node) return null;
    }
    return node;
  }

  /** 返回前缀（含精确）匹配到的所有文件集合。 */
  collect(prefix: string): Set<string> {
    const start = this.nodeFor(prefix);
    const out = new Set<string>();
    if (!start) return out;
    const stack: Trie[] = [start];
    while (stack.length) {
      const n = stack.pop()!;
      n.files?.forEach((f) => out.add(f));
      n.children.forEach((c) => stack.push(c));
    }
    return out;
  }

  remove(token: string, file: string): void {
    const node = this.nodeFor(token);
    if (!node?.files) return;
    node.files.delete(file);
    if (node.files.size === 0) {
      node.files = null;
      this.distinctTokens -= 1;
    }
  }
}

class WorkspaceIndex {
  rootPath: string;
  workspaceName: string;
  entries = new Map<string, IndexEntry>(); // filePath → entry
  /** 前缀索引（token → 文件集合） */
  private trie = new Trie();
  builtAt = 0;
  building = false;

  constructor(rootPath: string) {
    this.rootPath = path.resolve(rootPath);
    this.workspaceName = path.basename(this.rootPath) || this.rootPath;
  }

  // ── Build ──

  async build(): Promise<void> {
    if (this.building) return;
    this.building = true;
    try {
      this.entries.clear();
      this.trie.clear();
      await this.walkDir(this.rootPath, 0);
      this.buildInvertedIndex();
      this.builtAt = Date.now();
    } finally {
      this.building = false;
    }
  }

  private async walkDir(dirPath: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || this.entries.size >= MAX_FILES) return;
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (this.entries.size >= MAX_FILES) return;
      if (IGNORED_DIRS.has(entry.name)) continue;
      const itemPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await this.walkDir(itemPath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;

      await this.indexFile(itemPath);
    }
  }

  private async indexFile(filePath: string): Promise<void> {
    const ext = path.extname(filePath).toLowerCase();
    const name = path.basename(filePath);
    const relativePath = path.relative(this.rootPath, filePath);
    const isText = TEXT_EXTS.has(ext) || this.isLikelyText(name);

    let stat: { mtime: Date; size: number };
    try {
      stat = await fs.stat(filePath);
    } catch {
      return;
    }

    const file: IndexedFile = {
      filePath,
      name,
      ext,
      relativePath,
      modifiedAt: stat.mtime.toISOString(),
      size: stat.size,
      isText,
      lineCount: 0,
    };

    let contentTokens: string[] = [];
    let contentPreview = '';
    let contentLower: string | null = null;

    if (isText && stat.size <= MAX_FILE_SIZE) {
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        contentLower = raw.toLowerCase();
        file.lineCount = raw.split(/\r?\n/).length;
        contentTokens = tokenize(raw);
        contentPreview = raw.slice(0, 1000);
      } catch {
        // Binary or unreadable – treat as non-text
        file.isText = false;
      }
    }

    this.entries.set(filePath, { file, contentTokens, contentPreview, contentLower });
  }

  private buildInvertedIndex(): void {
    this.trie.clear();
    for (const [filePath, entry] of this.entries) {
      const unique = new Set(entry.contentTokens);
      for (const token of unique) {
        this.trie.insert(token, filePath);
      }
    }
  }

  private isLikelyText(name: string): boolean {
    // Files without extension that are commonly text
    const textNames = new Set([
      'makefile', 'dockerfile', 'license', 'licence', 'readme',
      'changelog', 'authors', 'contributors', '.gitignore',
      '.dockerignore', '.editorconfig', '.eslintrc', '.prettierrc',
    ]);
    return textNames.has(name.toLowerCase());
  }

  // ── Incremental update ──

  async updateFile(filePath: string): Promise<void> {
    const resolved = path.resolve(filePath);
    // Remove old entry
    this.removeFileInternal(resolved);
    // Re-index
    try {
      const stat = await fs.stat(resolved);
      if (stat.isFile()) {
        await this.indexFile(resolved);
        // Rebuild inverted index for affected tokens only
        this.rebuildTokensForFile(resolved);
      }
    } catch {
      // File may have been deleted between notification and indexing
    }
  }

  removeFile(filePath: string): void {
    const resolved = path.resolve(filePath);
    this.removeFileInternal(resolved);
    this.rebuildTokensForFile(resolved);
  }

  renameFile(oldPath: string, newPath: string): void {
    this.removeFile(oldPath);
    // The caller should trigger updateFile(newPath) after rename
  }

  private removeFileInternal(filePath: string): void {
    const entry = this.entries.get(filePath);
    if (entry) {
      for (const token of entry.contentTokens) this.trie.remove(token, filePath);
    }
    this.entries.delete(filePath);
  }

  private rebuildTokensForFile(filePath: string): void {
    const before = this.entries.get(filePath);
    if (before) {
      for (const token of new Set(before.contentTokens)) this.trie.remove(token, filePath);
    }
    const after = this.entries.get(filePath);
    if (after) {
      for (const token of new Set(after.contentTokens)) this.trie.insert(token, filePath);
    }
  }

  // ── Search ──

  search(query: string, limit: number, filter?: SearchFilter): SearchResult[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const results: SearchResult[] = [];
    const queryTokens = tokenize(query);

    // Phase 1: File name & path matching
    for (const [, entry] of this.entries) {
      if (results.length >= limit * 2) break; // over-fetch for re-ranking
      const file = entry.file;

      // Extension filter
      if (filter?.ext && file.ext !== filter.ext) continue;

      const nameLower = file.name.toLowerCase();
      const relLower = file.relativePath.toLowerCase();
      let score = 0;

      // Exact name match
      if (nameLower === q) {
        score = 100;
      } else if (nameLower.includes(q)) {
        score = 60 + (q.length / nameLower.length) * 20;
      } else if (relLower.includes(q)) {
        score = 30 + (q.length / relLower.length) * 10;
      } else if (fuzzyMatch(q, file.name)) {
        score = Math.max(10, fuzzyScore(q, file.name));
      }

      if (score > 0 && (!filter?.type || filter.type === 'file')) {
        results.push(this.makeFileResult(file, score, q));
      }
    }

    // Phase 2: Content search via inverted index
    if (!filter?.type || filter.type === 'content') {
      const contentHits = this.searchContent(queryTokens, q, limit, filter?.ext);
      for (const hit of contentHits) {
        // Deduplicate: if already in results as a file match, merge
        const existing = results.find(r => r.path === hit.path);
        if (existing) {
          existing.matches = hit.matches;
          existing.matchCount = hit.matchCount;
          existing.score = Math.max(existing.score, hit.score);
          existing.type = 'content'; // content match is more specific
        } else {
          results.push(hit);
        }
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  private searchContent(
    queryTokens: string[],
    rawQuery: string,
    limit: number,
    extFilter?: string,
  ): SearchResult[] {
    if (queryTokens.length === 0) return [];

    // Find files matching ALL query tokens (intersection)
    let candidatePaths: Set<string> | null = null;
    for (const token of queryTokens) {
      // 前缀匹配：收集该前缀下的所有文件（含精确匹配）
      const matching = this.trie.collect(token);

      if (candidatePaths === null) {
        candidatePaths = matching;
      } else {
        // Intersection
        const next = new Set<string>();
        for (const p of candidatePaths) {
          if (matching.has(p)) next.add(p);
        }
        candidatePaths = next;
      }

      if (candidatePaths.size === 0) break;
    }

    if (!candidatePaths || candidatePaths.size === 0) return [];

    const results: SearchResult[] = [];
    const qLower = rawQuery.toLowerCase();

    for (const filePath of candidatePaths) {
      if (results.length >= limit) break;
      const entry = this.entries.get(filePath);
      if (!entry) continue;
      if (extFilter && entry.file.ext !== extFilter) continue;
      if (!entry.file.isText) continue;

      // Find actual matches in content
      const contentLower = entry.contentLower;
      if (!contentLower) continue;

      const matches = this.findMatches(contentLower, qLower, entry.file.lineCount);
      if (matches.length === 0) continue;

      const score = 20 + Math.min(matches.length * 5, 40);
      results.push({
        type: 'content',
        name: entry.file.name,
        path: entry.file.filePath,
        relativePath: entry.file.relativePath,
        workspacePath: this.rootPath,
        workspaceName: this.workspaceName,
        ext: entry.file.ext,
        modifiedAt: entry.file.modifiedAt,
        size: entry.file.size,
        matchCount: matches.length,
        matches: matches.slice(0, MAX_MATCHES_PER_FILE),
        score,
      });
    }

    return results;
  }

  private findMatches(contentLower: string, queryLower: string, lineCount: number): ContentMatch[] {
    const matches: ContentMatch[] = [];
    let searchFrom = 0;
    const maxIterations = 50;
    let iterations = 0;

    while (searchFrom < contentLower.length && matches.length < MAX_MATCHES_PER_FILE && iterations < maxIterations) {
      iterations++;
      const idx = contentLower.indexOf(queryLower, searchFrom);
      if (idx === -1) break;

      // Calculate line number
      const before = contentLower.slice(0, idx);
      const line = before.split(/\r?\n/).length;

      // Extract snippet with context
      const snippetStart = Math.max(0, idx - SNIPPET_CONTEXT);
      const snippetEnd = Math.min(contentLower.length, idx + queryLower.length + SNIPPET_CONTEXT);
      const rawSnippet = contentLower.slice(snippetStart, snippetEnd).replace(/\s+/g, ' ').trim();

      matches.push({ line, snippet: rawSnippet });
      searchFrom = idx + queryLower.length;
    }

    return matches;
  }

  private makeFileResult(file: IndexedFile, score: number, query: string): SearchResult {
    return {
      type: 'file',
      name: file.name,
      path: file.filePath,
      relativePath: file.relativePath,
      workspacePath: this.rootPath,
      workspaceName: this.workspaceName,
      ext: file.ext,
      modifiedAt: file.modifiedAt,
      size: file.size,
      matchCount: 1,
      matches: [],
      score,
    };
  }

  // ── Stats ──

  getStats(): { fileCount: number; tokenCount: number; builtAt: number; building: boolean } {
    return {
      fileCount: this.entries.size,
      tokenCount: this.trie.tokenCount,
      builtAt: this.builtAt,
      building: this.building,
    };
  }
}

// ── Singleton manager ──────────────────────────────────────────────

const indexes = new Map<string, WorkspaceIndex>();

function getCacheKey(rootPath: string): string {
  return path.resolve(rootPath).toLowerCase();
}

export async function ensureIndex(rootPath: string): Promise<WorkspaceIndex> {
  const key = getCacheKey(rootPath);
  let index = indexes.get(key);
  if (!index) {
    index = new WorkspaceIndex(rootPath);
    indexes.set(key, index);
  }
  if (index.builtAt === 0 && !index.building) {
    await index.build();
  }
  return index;
}

export async function searchWorkspace(
  rootPath: string,
  query: string,
  limit: number,
  filter?: SearchFilter,
): Promise<SearchResult[]> {
  const index = await ensureIndex(rootPath);
  return index.search(query, limit, filter);
}

export async function invalidateIndex(rootPath: string): Promise<void> {
  const key = getCacheKey(rootPath);
  indexes.delete(key);
}

export async function updateFileInIndex(filePath: string): Promise<void> {
  // Find which index this file belongs to
  for (const [, index] of indexes) {
    const resolved = path.resolve(filePath);
    if (resolved.toLowerCase().startsWith(index.rootPath.toLowerCase() + path.sep)) {
      await index.updateFile(filePath);
      return;
    }
  }
}

export async function removeFileFromIndex(filePath: string): Promise<void> {
  for (const [, index] of indexes) {
    const resolved = path.resolve(filePath);
    if (resolved.toLowerCase().startsWith(index.rootPath.toLowerCase() + path.sep)) {
      index.removeFile(filePath);
      return;
    }
  }
}

export async function renameFileInIndex(oldPath: string, newPath: string): Promise<void> {
  for (const [, index] of indexes) {
    const resolved = path.resolve(oldPath);
    if (resolved.toLowerCase().startsWith(index.rootPath.toLowerCase() + path.sep)) {
      index.renameFile(oldPath, newPath);
      await index.updateFile(newPath);
      return;
    }
  }
}

export function getIndexStats(rootPath: string): { fileCount: number; tokenCount: number; builtAt: number; building: boolean } | null {
  const key = getCacheKey(rootPath);
  const index = indexes.get(key);
  return index?.getStats() ?? null;
}
