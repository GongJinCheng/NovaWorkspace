/**
 * Shared Monaco editor type interfaces and helpers for EditorManager.
 * Extracted from editor-manager.ts to reduce the god-object file size
 * and improve cohesion (types, the global `window.monaco` augmentation,
 * and the File→base64 utility all live here now).
 */

/** Convert a browser File (e.g. clipboard screenshot) to a base64 string. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // data URL format: "data:<mime>;base64,<payload>" — strip the prefix
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export interface MonacoEditor {
  create(container: HTMLElement, options: Record<string, unknown>): MonacoEditorInstance;
  createModel(value: string, language: string): MonacoModel;
  defineTheme(name: string, config: Record<string, unknown>): void;
}

export interface MonacoEditorInstance {
  setModel(model: MonacoModel | null): void;
  getModel(): MonacoModel | null;
  layout(): void;
  focus(): void;
  updateOptions(options: Record<string, unknown>): void;
  getPosition(): { lineNumber: number; column: number } | null;
  saveViewState(): unknown;
  restoreViewState(state: unknown): void;
  getSelection(): MonacoRange | null;
}

export interface MonacoRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export interface MonacoModel {
  getValue(): string;
  setValue(value: string): void;
  getLanguageId(): string;
  dispose(): void;
  getFullModelRange(): MonacoRange;
  getValueInRange(range: MonacoRange): string;
  updateOptions(options: { readOnly?: boolean; [key: string]: unknown }): void;
  pushEditOperations(before: unknown[], operations: unknown[], fn: (() => null) | null): void;
  onDidChangeContent(listener: () => void): { dispose(): void };
}

export interface MonacoStatic {
  editor: MonacoEditor;
}

export interface EditorTab {
  filePath: string;
  fileName: string;
  model: MonacoModel;
  viewState: unknown;
  isPreview: boolean;
}

export type MarkdownViewMode = 'edit' | 'preview' | 'split';

declare global {
  interface Window {
    monaco: any;
    require: any;
    MonacoEnvironment?: {
      getWorkerUrl?: (moduleId: string, label: string) => string;
      getWorker?: (workerId: string, label: string) => Worker;
    };
  }
}
