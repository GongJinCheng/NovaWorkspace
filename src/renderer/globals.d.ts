/**
 * Renderer 全局类型声明。
 *
 * 历史上跨模块共享的单例与动作通过 `window.__xxx` 挂载（见已删除的旧声明）。
 * 现已统一迁移到类型安全的运行时注册表：见 `src/renderer/services/runtime.ts`
 * （`setRuntime` / `getRuntime`）。此处不再声明任何 `window.__*` 全局。
 */

export {};
