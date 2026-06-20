/**
 * Knowledge Base Types — v2.9.0
 * Per-workspace knowledge base stored in .nova/knowledge/
 */

export type KnowledgeSourceType = 'pdf' | 'txt' | 'md' | 'clipboard' | 'url';

export interface KnowledgeItem {
  id: string;
  title: string;
  sourceType: KnowledgeSourceType;
  sourceName: string;       // Original filename, URL, or "剪贴板"
  sourcePath?: string;       // Original file path (for reference)
  textPath: string;          // Path to extracted text file
  wordCount: number;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  summary?: string;          // AI-generated summary (optional, lazy)
  sourceUrl?: string;        // Original URL (for url type)
}

export interface KnowledgeIndex {
  items: KnowledgeItem[];
  updatedAt: string;
}

export interface CreateKnowledgeInput {
  title: string;
  sourceType: KnowledgeSourceType;
  sourceName: string;
  sourcePath?: string;
  sourceUrl?: string;
  textContent: string;       // The extracted/imported text
  tags?: string[];
}

export interface KnowledgeStats {
  totalItems: number;
  totalWords: number;
  bySource: Record<KnowledgeSourceType, number>;
}
