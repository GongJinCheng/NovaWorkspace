/**
 * Knowledge Base Service — v2.9.0
 *
 * Per-workspace knowledge base stored in .nova/knowledge/
 *   .nova/knowledge/index.json     — metadata index
 *   .nova/knowledge/{id}.txt       — extracted text content
 *
 * Supports: PDF import (pdf-parse), web import (net.fetch),
 *           TXT/MD/clipboard import, AI summary, stats.
 */

import fs from 'fs/promises';
import path from 'path';
import { net } from 'electron';
import type {
  KnowledgeItem,
  KnowledgeIndex,
  CreateKnowledgeInput,
  KnowledgeStats,
  KnowledgeSourceType,
} from '@shared/types/knowledge';
import { generateId } from '@shared/utils/id';

// ── Paths ─────────────────────────────────────────────────────────

function getKnowledgeDir(workspaceRoot?: string | null): string {
  const root = workspaceRoot || getFallbackRoot();
  return path.join(root, '.nova', 'knowledge');
}

function getIndexPath(workspaceRoot?: string | null): string {
  return path.join(getKnowledgeDir(workspaceRoot), 'index.json');
}

function getTextPath(workspaceRoot: string | null | undefined, itemId: string): string {
  return path.join(getKnowledgeDir(workspaceRoot), `${itemId}.txt`);
}

function getFallbackRoot(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { app } = require('electron');
  return app.getPath('userData');
}

// ── Index I/O ─────────────────────────────────────────────────────

async function readIndex(workspaceRoot?: string | null): Promise<KnowledgeIndex> {
  try {
    const data = await fs.readFile(getIndexPath(workspaceRoot), 'utf-8');
    return JSON.parse(data) as KnowledgeIndex;
  } catch {
    return { items: [], updatedAt: new Date().toISOString() };
  }
}

async function writeIndex(
  index: KnowledgeIndex,
  workspaceRoot?: string | null
): Promise<void> {
  const indexPath = getIndexPath(workspaceRoot);
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  index.updatedAt = new Date().toISOString();
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
}

// ── Public API ────────────────────────────────────────────────────

/** List all knowledge items in the workspace. */
export async function listItems(
  workspaceRoot?: string | null
): Promise<KnowledgeIndex> {
  return await readIndex(workspaceRoot);
}

/** Get a single knowledge item by id. */
export async function getItem(
  itemId: string,
  workspaceRoot?: string | null
): Promise<KnowledgeItem | null> {
  const index = await readIndex(workspaceRoot);
  return index.items.find((i) => i.id === itemId) || null;
}

/** Read the extracted text for an item. */
export async function getText(
  itemId: string,
  workspaceRoot?: string | null
): Promise<string> {
  try {
    return await fs.readFile(getTextPath(workspaceRoot, itemId), 'utf-8');
  } catch {
    return '';
  }
}

/** Create a knowledge item from text content (TXT/MD/clipboard). */
export async function createItem(
  input: CreateKnowledgeInput,
  workspaceRoot?: string | null
): Promise<KnowledgeItem> {
  const id = generateId();
  const now = new Date().toISOString();
  const wordCount = input.textContent.replace(/\s+/g, ' ').trim().split(/\s+/).filter(Boolean).length;

  const item: KnowledgeItem = {
    id,
    title: input.title,
    sourceType: input.sourceType,
    sourceName: input.sourceName,
    sourcePath: input.sourcePath,
    textPath: getTextPath(workspaceRoot, id),
    wordCount,
    createdAt: now,
    updatedAt: now,
    tags: input.tags || [],
    sourceUrl: input.sourceUrl,
  };

  // Ensure directory exists
  const dir = getKnowledgeDir(workspaceRoot);
  await fs.mkdir(dir, { recursive: true });

  // Write text file
  await fs.writeFile(item.textPath, input.textContent, 'utf-8');

  // Update index
  const index = await readIndex(workspaceRoot);
  index.items.push(item);
  await writeIndex(index, workspaceRoot);

  return item;
}

/** Delete a knowledge item and its text file. */
export async function deleteItem(
  itemId: string,
  workspaceRoot?: string | null
): Promise<boolean> {
  const index = await readIndex(workspaceRoot);
  const before = index.items.length;
  index.items = index.items.filter((i) => i.id !== itemId);

  if (index.items.length === before) return false;

  await writeIndex(index, workspaceRoot);

  // Remove text file (best-effort)
  try {
    await fs.unlink(getTextPath(workspaceRoot, itemId));
  } catch {
    // file may not exist
  }

  return true;
}

/** Update the AI-generated summary for an item. */
export async function updateSummary(
  itemId: string,
  summary: string,
  workspaceRoot?: string | null
): Promise<KnowledgeItem | null> {
  const index = await readIndex(workspaceRoot);
  const item = index.items.find((i) => i.id === itemId);
  if (!item) return null;

  item.summary = summary;
  item.updatedAt = new Date().toISOString();
  await writeIndex(index, workspaceRoot);

  return item;
}

/** Compute knowledge base statistics. */
export async function getStats(
  workspaceRoot?: string | null
): Promise<KnowledgeStats> {
  const index = await readIndex(workspaceRoot);
  const stats: KnowledgeStats = {
    totalItems: index.items.length,
    totalWords: 0,
    bySource: { pdf: 0, txt: 0, md: 0, clipboard: 0, url: 0 },
  };

  for (const item of index.items) {
    stats.totalWords += item.wordCount;
    stats.bySource[item.sourceType] = (stats.bySource[item.sourceType] || 0) + 1;
  }

  return stats;
}

// ── PDF Import ────────────────────────────────────────────────────

/** Import a PDF file, extract text with pdf-parse. */
export async function importPdf(
  filePath: string,
  workspaceRoot?: string | null
): Promise<KnowledgeItem> {
  let pdfParse: (buffer: Buffer) => Promise<{ text: string; numpages: number }>;

  try {
    // Dynamic import for pdf-parse (CJS module)
    pdfParse = require('pdf-parse');
  } catch {
    throw new Error(
      'PDF parsing library (pdf-parse) is not available. Please run: npm install pdf-parse'
    );
  }

  const buffer = await fs.readFile(filePath);
  const data = await pdfParse(buffer);

  const fileName = path.basename(filePath);
  const title = fileName.replace(/\.pdf$/i, '');

  return await createItem(
    {
      title,
      sourceType: 'pdf',
      sourceName: fileName,
      sourcePath: filePath,
      textContent: data.text,
    },
    workspaceRoot
  );
}

// ── Web Import ────────────────────────────────────────────────────

/** Fetch a web page and extract its text content. */
export async function importWeb(
  url: string,
  workspaceRoot?: string | null
): Promise<KnowledgeItem> {
  const response = await net.fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const text = stripHtml(html);
  const title = extractTitle(html) || new URL(url).hostname;

  return await createItem(
    {
      title,
      sourceType: 'url',
      sourceName: url,
      sourceUrl: url,
      textContent: text,
    },
    workspaceRoot
  );
}

// ── Helpers ───────────────────────────────────────────────────────

function stripHtml(html: string): string {
  // Remove scripts, styles, and HTML tags
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s{2,}/g, '\n')
    .trim();
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim() : '';
}
