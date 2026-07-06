/**
 * 轻量事件总线，用于解耦渲染端跨模块/跨页通信，
 * 逐步取代挂在 window 上的全局可变对象（window.__editorManager 等）。
 *
 * 约定：
 *  - 事件名用 `命名空间:动作`，如 'editor:save' / 'file:open-folder'。
 *  - on 返回取消订阅函数；模块级长期订阅可不处理（应用生命周期内有效）。
 */

type Handler = (payload?: unknown) => void;

const channels = new Map<string, Set<Handler>>();

export const bus = {
  on(event: string, handler: Handler): () => void {
    let set = channels.get(event);
    if (!set) {
      set = new Set<Handler>();
      channels.set(event, set);
    }
    set.add(handler);
    return () => bus.off(event, handler);
  },
  off(event: string, handler: Handler): void {
    channels.get(event)?.delete(handler);
  },
  emit(event: string, payload?: unknown): void {
    const set = channels.get(event);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[bus] handler for "${event}" threw:`, error);
      }
    }
  },
};

// 事件名常量，避免拼写漂移
export const BusEvents = {
  EditorSave: 'editor:save',
  EditorCloseActive: 'editor:close-active',
  EditorRunCommand: 'editor:run-command',
  EditorSetMode: 'editor:set-mode',
  FileOpenFolder: 'file:open-folder',
  FileNew: 'file:new',
  FileNewFromTemplate: 'file:new-from-template',
  FileRunAIWorkflow: 'file:run-ai-workflow',
} as const;
