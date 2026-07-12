# Nova 阶段 A（稳地基）架构设计 + 任务分解

> 架构师：高见远（software-architect）
> 输入：《阶段 A 增量 PRD》（许清楚）+ 主理人 Q1–Q5 拍板
> 约束：重构不改外部行为；对外接口签名/行为保持不变；最小变更原则
> 配套图：`docs/class-diagram.mermaid`（类/接口契约）、`docs/sequence-diagram.mermaid`（A1/A5 时序）

---

## 0. 实码核查结论（设计前已读源码）

| 项 | 核查结果 | 影响 |
|---|---|---|
| A1 Monaco 加载 | `editor-manager.ts:146-147` 硬编码 `node_modules/monaco-editor/min/vs`；`index.html:1039` 用相对路径 `<script src="node_modules/monaco-editor/min/vs/loader.js">` 注入 AMD loader；`esbuild.renderer.mjs` 不含任何 Monaco 资源拷贝；`package.json` `files` 含 `node_modules/monaco-editor/**/*`（进 asar）。生产环境 `vs/` 在 asar 内，XHR/worker 路径失败 → 404/白屏。 | 需在「拷贝 + 打包解包 + 运行时解析」三处同时修。 |
| A2 editor-manager 拆分 | 实测 **1707 行**。公开方法（openFile/openPath/saveFile/getActiveFileSnapshot/closeTab/runMarkdownCommand/setMarkdownMode/pinTab/renameTab/resetForWorkspace/activeEditor/getEditorByPath/switchToTab 等）均在类上，需全部保留。 | 按职责拆 7 个子模块 + 主类编排。 |
| A3 alert/confirm | 实码确认位置与 PRD 一致：`files/index.ts:122/144/165/178`、`file-tree.ts:318/329/341/352/346`、`home/index.ts:94/108/301`、`project.ts:171/186/188`、`settings/index.ts:256`、`template-service.ts:145/170/326`、`editor-manager.ts:1218`、`knowledge/index.ts:568/584`；`app/index.ts:51` 的 `installElectronDialogSafetyGuards` 仅重写 `window.prompt`。 | 全部改为 Toast/Modal；扩展安全网覆盖 alert/confirm。 |
| A4 AI 错误文案 | 实码确认 **3 处**：`editor-manager.ts:1009 toFriendlyAiError`（用 772/949）、`template-service.ts:380 formatAIError`（用 325）、`ai/index.ts:976 formatFriendlyAiError`（用 184/367/402/856/901）。`grep` 主进程 `src/main` 无 `toFriendlyAiError`（Q3 确认仅 3 处）。 | 抽 `src/renderer/shared/ai-error.ts`，基准采用 `ai/index.ts` 的 `formatFriendlyAiError`。 |
| A5 window.__* 迁移 | `files/index.ts:691` 注册 `window.__getActiveFileSnapshot`；`ai/index.ts:662/734`、`ai/studio.ts:270/313/325/331` 读取；`files/index.ts:494` 同页自读；`window.aiService` 仅 `knowledge/index.ts:363` 读取（不在本试点）。`bus`（`src/renderer/services/bus.ts`）当前仅 `on/off/emit` 的 fire-and-forget。 | 新增 `bus.request/respond`；files 注册 responder 回传快照；ai 侧改经 bus。 |
| Toast 现状（额外发现） | **存在 3+ 套实现**：`widgets/toast.ts` 导出 `showToast(message,type)`（带类型，editor-manager 在用）；`utils/toast.ts` 导出 `toast(message,ms)`（无类型，被 `files/index.ts`、`app/index.ts` 引入）；另有页面内联副本 `files/index.ts:183 showToast`、`app/index.ts:814 showMiniToast`、`ai/index.ts:987 showMsg`。 | A3 不强制统一模块，但「共享知识」需固化契约：`toast(message,type?)` 以 `widgets/toast.ts` 为权威源。 |

---

## 1. 实现方案 + 框架选型

本期**不引入新框架**，沿用 Electron 35 + TS 5.7(strict) + esbuild(3 入口) + 纯 DOM 渲染。仅对 Monaco 加载、事件总线、错误文案、弹窗做最小改造。

### A1 — 解 Monaco 打包阻断（按 Q1 拍板：构建期拷贝 + 运行时按 baseURI 解析）

**根因**：`vs/` 资源在生产被 electron-builder 打进 asar，渲染进程经 `file://` + asar 做 XHR/worker 加载不可达，AMD loader 报 `vs/editor/editor.main` 404。

**三处联动修改**：

1. **拷贝机制（选「构建后拷贝脚本」为主，esbuild 插件为备选）**
   - 新建 `scripts/copy-monaco-assets.mjs`：`fs.cpSync('node_modules/monaco-editor/min/vs', 'dist/renderer/vs', { recursive: true })`。
   - `package.json` 的 `build:renderer` 改为 `node esbuild.renderer.mjs && node scripts/copy-monaco-assets.mjs`（覆盖 `dev`/`start`/`package` 全链路，因为它们都先跑 `npm run build`）。
   - **备选**：在 `esbuild.renderer.mjs` 加一个 `onEnd` 插件做同样拷贝（原子化，不新增 npm 脚本）。二选一即可，推荐脚本法（可读、易测）。

2. **打包解包（electron-builder）**
   - `package.json` `build.files` 中**移除**冗余的 `node_modules/monaco-editor/**/*`（运行时已用拷贝的 `dist/renderer/vs`，避免重复打包放大体积）。
   - `build` 增加 `asarUnpack: ["dist/renderer/vs/**/*"]`，让 `vs/` 落到真实文件系统（`app.asar.unpacked/dist/renderer/vs`），Electron 的 `file://` asar 协议会自动把 `app.asar/dist/renderer/vs/...` 重定向到该真实文件，XHR/worker 可达。

3. **运行时路径解析（不硬编码 asar）**
   - `index.html:1039` loader 脚本改为 `<script src="dist/renderer/vs/loader.js"></script>`（与拷贝目标一致）。
   - `editor-manager.ts:146-147` 改为运行时解析：
     ```ts
     const vsBase = new URL('dist/renderer/vs', document.baseURI).href;
     window.require.config({ paths: { vs: vsBase } });
     ```
   - **Worker 兜底（防白屏加固）**：在 `init()` 内、`window.require` 调用前设置：
     ```ts
     (self as any).MonacoEnvironment = {
       getWorkerUrl: (_id: string, label: string) => {
         const base = vsBase.endsWith('/') ? vsBase : vsBase + '/';
         const src = `self.MonacoEnvironment.baseUrl='${base}';importScripts('${base}base/worker/workerMain.js');`;
         return `data:text/javascript;charset=utf-8,${encodeURIComponent(src)}`;
       },
     };
     ```
   - **加载失败可见（验收③）**：`init()` 的 reject 当前被 `openFile` 静默吞掉导致白屏。改为在 `init()` 失败时 `showToast('编辑器加载失败，请重启应用或检查安装', 'error')` 并保留欢迎屏（不进 `createEditor`）。公开 `init()` 仍返回 `Promise<void>`，调用方 `openFile` 的既有 try/catch 保持。

**为何不改 ESM 内联**：IFE + `window.require` 架构下，Monaco AMD loader 已就位，改为 ESM 内联会与 `window.require` 冲突且改动巨大，违背最小侵入（Q1）。

### A2 — 拆分 editor-manager.ts（1707 行 → 主类 ≤400 行 + 7 子模块）

按职责拆为独立模块，主类 `EditorManager` 仅做**状态持有 + 编排**，所有公开方法签名/行为不变。

**推荐拆分手法（实现细节，交给 Engineer，约束：公开 API 不变）**：
- 主类保留全部私有状态字段（单一状态源），在构造函数中实例化各 Controller 并传入 `this`（或共享 `EditorContext`）。
- 各子模块导出 **Controller 类**（如 `TabsController`/`MarkdownController`/`EditorAiActions`/`ImageDropPaste`/`VersionHistory`/`ExportActions`/`EditorCore`），方法接收管理器实例。
- 跨文件访问私有字段：将需被外部方法读取的字段/辅助方法**显式提升可见性**（如 `protected` 或暴露在 `EditorContext` 接口上），避免 `any` 黑魔法；公开 API 一律不动。
- 主类公开方法改为「薄包装 → 委托给 Controller」，例如 `openFile(...)` 委托 `tabs.openFile(...)`。

模块边界与源码行映射（见第 2 节文件列表）。

### A3 — 清除 alert/confirm，统一 Modal/Toast（按 Q5 拍板）

- **`alert(msg)` → `toast(msg, type?)`**（非阻塞）：纯信息/错误默认 Toast；需显式 Ack 的改用 `showModal({title, content, actions:[{label:'确定',type:'primary'}]})`。
  - 示例：`file-tree.ts:318 alert('创建文件失败: '+e)` → `toast('创建文件失败：'+e, 'error')`；`project.ts:186 alert('项目报告已导出：\n'+filePath)` → `toast('项目报告已导出：'+filePath, 'success')`（多行用 `\n`，toast 用 `white-space:pre-line` 或保留文本）。
- **`confirm(msg)` → `await showConfirmDialog({title,message,confirmText,cancelText,danger?})`** 返回 `Promise<boolean>`；`if(!confirm(...))return` 改为 `if(!(await showConfirmDialog(...)))return`。
  - `file-tree.ts:346`、`settings/index.ts:256`、`knowledge/index.ts:568/584`、`editor-manager.ts:1218`（需把 `confirmCloseDirtyTabs` 改为 `async` 并 `await` 其调用点 1267/1273/1315）。
- **扩展 `installElectronDialogSafetyGuards`（`app/index.ts:51`）**：除 `window.prompt` 外，再重写 `window.alert = (m)=>{ toast(m,'error') }` 与 `window.confirm = ()=>{ console.warn('[Nova] 原生 confirm 已禁用，走 Modal'); return false }` 作兜底（try/catch 防只读属性）。验收④ grep 仅剩安全网与 Modal 封装。
- 既有 `modal.ts` 样式/交互不变。

### A4 — 统一 AI 错误文案（按 Q2/Q3 拍板）

- 新建 `src/renderer/shared/ai-error.ts`，导出**单一** `formatAiError(error: unknown): string`，以 `ai/index.ts:976 formatFriendlyAiError` 表述为规范基准（含 vision/image 分支）。
- 三处收敛：
  - `ai/index.ts`：`formatFriendlyAiError` 整函数删除，原调用点（184/367/402/856/901）改 `formatAiError`；或保留 `formatFriendlyAiError` 作为 `formatAiError` 的别名导出（零改动调用点）。**推荐**：直接删 `formatFriendlyAiError`，调用点改 `formatAiError`（最干净，grep 仅剩共享定义）。
  - `editor-manager.ts:1009`：删除私有 `toFriendlyAiError`，调用点 772/949 改 `formatAiError`。
  - `template-service.ts:380`：删除本地 `formatAIError`，调用点 325 改 `formatAiError`。
- 验收③：`grep -rn "toFriendlyAiError\|formatFriendlyAiError\|formatAIError" src` 仅剩 `ai-error.ts` 定义与一处别名（若保留）。

### A5 — window.__* 迁移到事件总线（试点 files↔ai，按 Q4 拍板）

- **新增通用 `bus.request/respond`**（`src/renderer/services/bus.ts`）：`bus.respond(event, handler)` 注册响应者，`bus.request(event, payload?, timeoutMs?): Promise<T>` 返回 Promise（见第 3 节签名）。
- **`BusEvents` 新增** `RequestActiveFileSnapshot: 'request:active-file-snapshot'`。
- **files 页注册 responder**（`files/index.ts`）：`bus.respond(BusEvents.RequestActiveFileSnapshot, () => editorManager?.getActiveFileSnapshot?.() ?? null)`。
- **ai 侧改经 bus 取快照**：`ai/index.ts:662`（`attachActiveFileToAIContext` 改为 `.then` 回调保持同步签名）、`ai/index.ts:734`（`runAIWorkflow` 已 async，直接 `await`）、`ai/studio.ts:270/313/325/331`（4 处改 `await bus.request(...)`，其中 `refreshStudioContext` 用 `.then` 以免改其同步调用方）。
- **`files/index.ts:494` 同页自读**：直接调 `editorManager.getActiveFileSnapshot?.()`（同 owner，无需异步往返）。
- **deprecated 壳（验收③）**：`files/index.ts:691` 的 `window.__getActiveFileSnapshot` 保留为壳，访问时 `console.warn` 一次后委托 `editorManager.getActiveFileSnapshot?.()`；**不新增任何 `window.__*` 读取**。
- 范围严格限定 files↔ai；`knowledge/index.ts:363` 的 `(window as any).aiService` 及 home/project 其余 `window.__*` 本期不动。

---

## 2. 文件列表及相对路径

### 新建文件
| 路径 | 说明 |
|---|---|
| `scripts/copy-monaco-assets.mjs` | **新建**：构建后拷贝 `node_modules/monaco-editor/min/vs` → `dist/renderer/vs` |
| `src/renderer/shared/ai-error.ts` | **新建**：导出 `formatAiError(error): string`（A4 共享工具，基准同 `ai/index.ts`） |
| `src/renderer/pages/files/editor-core.ts` | **新建**（A2）：Monaco init/loader/主题/欢迎屏/reveal + 保存 + 状态栏 |
| `src/renderer/pages/files/tabs.ts` | **新建**（A2）：TabManager（openFile/openPath/closeTab/switchToTab/pin/rename/context menu） |
| `src/renderer/pages/files/markdown.ts` | **新建**（A2）：MarkdownController（模式/预览/大纲/工具栏） |
| `src/renderer/pages/files/ai-actions.ts` | **新建**（A2）：EditorAiActions（runMarkdownAiAction/todo/改写/showAiResult） |
| `src/renderer/pages/files/image.ts` | **新建**（A2）：ImageDropPaste（粘贴/拖拽图片） |
| `src/renderer/pages/files/version-history.ts` | **新建**（A2）：VersionHistory（备份/历史/预览） |
| `src/renderer/pages/files/export.ts` | **新建**（A2）：ExportActions（导出 HTML/PDF） |

### 修改文件
| 路径 | 改动点 |
|---|---|
| `src/renderer/pages/files/editor-manager.ts` | **改**（A1）init 运行时解析 vsBase + worker 代理 + 失败可见；（A2）拆为主类编排，公开 API 不变；（A3）:1218 `window.confirm`→`await showConfirmDialog`；（A4）删 `toFriendlyAiError`，调用点改 `formatAiError` |
| `index.html` | **改**（A1）:1039 loader 脚本路径 → `dist/renderer/vs/loader.js` |
| `package.json` | **改**（A1）`build:renderer` 串拷贝脚本；`build.files` 移除 `node_modules/monaco-editor/**/*`；`build` 加 `asarUnpack:["dist/renderer/vs/**/*"]` |
| `src/renderer/services/bus.ts` | **改**（A5）新增 `request/respond` + `BusEvents.RequestActiveFileSnapshot` |
| `src/renderer/pages/files/index.ts` | **改**（A3）:122/144/165/178 alert→toast；（A5）:691 deprecated 壳 + 注册 responder，:494 直连 `editorManager.getActiveFileSnapshot` |
| `src/renderer/pages/files/file-tree.ts` | **改**（A3）:318/329/341/352 alert→toast；:346 confirm→`await showConfirmDialog` |
| `src/renderer/pages/home/index.ts` | **改**（A3）:94/108/301 alert→toast |
| `src/renderer/pages/project.ts` | **改**（A3）:171/186/188 alert→toast |
| `src/renderer/pages/settings/index.ts` | **改**（A3）:256 confirm→`await showConfirmDialog` |
| `src/renderer/services/template-service.ts` | **改**（A3）:145/170/326 alert→toast；（A4）删 `formatAIError`，:325 改 `formatAiError` |
| `src/renderer/pages/knowledge/index.ts` | **改**（A3）:568/584 confirm→`await showConfirmDialog`（范围外不动 `:363 aiService`） |
| `src/renderer/pages/ai/index.ts` | **改**（A3）无原生 alert/confirm（已全用 Modal/showMsg，仅核对）；（A4）删 `formatFriendlyAiError`，调用点改 `formatAiError`；（A5）:662/734 改经 `bus.request` 取快照 |
| `src/renderer/pages/ai/studio.ts` | **改**（A5）:270/313/325/331 改经 `bus.request` 取快照 |
| `src/renderer/app/index.ts` | **改**（A3）扩展 `installElectronDialogSafetyGuards`：覆盖 `window.alert`/`window.confirm` 安全网 |

> 注：`src/renderer/widgets/toast.ts`（权威 `showToast(message,type)`）与 `src/renderer/utils/toast.ts`（旧 `toast(message,ms)`）本期**不强制合并**；A3 新增调用统一 import 自 `widgets/toast.ts` 的 `showToast`/`toast`（见共享知识 §7）。

---

## 3. 数据结构和接口（类图 / 接口签名）

> 完整 Mermaid 见 `docs/class-diagram.mermaid`。以下为关键签名。

### 3.1 事件总线 request/respond（A5）
```ts
// src/renderer/services/bus.ts
type Handler = (payload?: unknown) => void;
type Responder<TReq = unknown, TRes = unknown> = (payload: TReq) => TRes | Promise<TRes>;

const channels = new Map<string, Set<Handler>>();
const responders = new Map<string, Responder>();   // 新增

export const bus = {
  on(event: string, handler: Handler): () => void { /* 既有 */ },
  off(event: string, handler: Handler): void { /* 既有 */ },
  emit(event: string, payload?: unknown): void { /* 既有 */ },

  /** 注册请求响应者（一个事件一个响应者，后注册覆盖前注册） */
  respond<TReq, TRes>(event: string, handler: Responder<TReq, TRes>): () => void {
    responders.set(event, handler as Responder);
    return () => { if (responders.get(event) === handler) responders.delete(event); };
  },

  /** 发起请求并等待响应；无响应者或超时 reject */
  request<TRes = unknown>(event: string, payload?: unknown, timeoutMs = 5000): Promise<TRes> {
    return new Promise<TRes>((resolve, reject) => {
      const responder = responders.get(event);
      if (!responder) { reject(new Error(`[bus] no responder for "${event}"`)); return; }
      const timer = setTimeout(() => reject(new Error(`[bus] request timeout: ${event}`)), timeoutMs);
      Promise.resolve(responder(payload))
        .then((res) => { clearTimeout(timer); resolve(res as TRes); })
        .catch((err) => { clearTimeout(timer); reject(err); });
    });
  },
};

export const BusEvents = {
  // 既有 ...
  RequestActiveFileSnapshot: 'request:active-file-snapshot',   // 新增
} as const;

export type ActiveFileSnapshot = {
  filePath: string;
  fileName: string;
  content: string;
  selection?: string;
} | null;
```

### 3.2 共享 AI 错误文案（A4）
```ts
// src/renderer/shared/ai-error.ts
export function formatAiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');
  if (/timeout|超时|AbortError/i.test(message)) return '请求超时了。模型或中转服务可能响应较慢，请稍后重试。';
  if (/401|unauthorized|api key|apikey|密钥|鉴权/i.test(message)) return 'API Key 可能不正确或没有权限，请重新保存配置。';
  if (/404|model|模型/i.test(message)) return '模型名称可能不存在，请检查默认模型。';
  if (/network|fetch failed|ENOTFOUND|ECONNREFUSED|Failed to fetch/i.test(message)) return '网络连接失败，请检查 Base URL 是否可访问。';
  if (/image_url|图片输入|image.*unsupported|unsupported.*image|multimodal|vision|expected.*text|unknown variant/i.test(message)) return '当前模型或接口不支持图片输入。请切换到支持视觉/多模态的模型，或移除图片后只发送文字。';
  if (/余额|quota|insufficient|credit/i.test(message)) return '账号额度可能不足，请检查服务商余额或套餐。';
  return message || '未知错误，请检查 AI 配置。';
}
```

### 3.3 editor-manager 拆分后的模块导出接口（A2）
```ts
// 主类（orchestrator，公开 API 不变）
export class EditorManager {
  constructor(container: HTMLElement, tabsList: HTMLElement);
  attachStore(store: FilesStore): void;
  get activeEditor(): string | null;
  getEditorByPath(filePath: string): EditorTab | undefined;
  setTheme(theme: string): void;
  init(): Promise<void>;                                  // A1 改内部
  openFile(filePath: string, fileName: string): Promise<void>;
  openPath(filePath: string): Promise<void>;
  saveFile(): Promise<void>;
  getActiveFileSnapshot(): ActiveFileSnapshot;            // A5 responder 调用
  closeTab(filePath: string, options?: { force?: boolean }): Promise<void>;
  runMarkdownCommand(action: string): Promise<void>;
  setMarkdownMode(mode: MarkdownViewMode): void;
  pinTab(filePath: string): void;
  renameTab(oldPath: string, newPath: string, newFileName: string): void;
  resetForWorkspace(): void;
  switchToTab(filePath: string): void;
  revealActiveFile(): Promise<void>;
  closeTabsForDeletedPaths(deletedPaths: string[]): void;
}

// 子模块（构造时注入 this / EditorContext，方法委托）
export class EditorCore { /* init/loader/theme/welcome/save/statusBar */ }
export class TabsController { /* openFile/openPath/closeTab/switchToTab/pin/rename/contextMenu */ }
export class MarkdownController { /* applyMarkdownMode/preview/outline/toolbar */ }
export class EditorAiActions { /* runMarkdownAiAction/rewrite/todos/showAiResult */ }
export class ImageDropPaste { /* bindImageDropPaste/fileToBase64 */ }
export class VersionHistory { /* createVersionBackup/showVersionHistory/showVersionPreview */ }
export class ExportActions { /* exportCurrentMarkdown/exportActiveMarkdown */ }
```

### 3.4 Modal / Toast 调用契约（A3）
```ts
// src/renderer/components/modal.ts（既有，不改）
showModal(opts: { title: string; content: string; inputField?: {...}; actions?: Array<{label:string;type?:'primary'|'secondary'|'danger';onClick:()=>void}>; onClose?:()=>void }): HTMLElement
showInputPrompt(title: string, placeholder: string, defaultValue?: string): Promise<string|null>
showConfirmDialog(opts: { title: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean }): Promise<boolean>
showTaskConfirmDialog(tasks: Array<{title:string;description?:string;priority?:string}>): Promise<boolean>

// src/renderer/widgets/toast.ts（权威源）
type ToastType = 'success' | 'error' | 'info' | 'warning';
export function showToast(message: string, type: ToastType = 'info'): void;
export function toast(message: string, type: ToastType = 'info'): void;  // A3 新增别名，签名 (message, type?)
export function showUndoToast(message: string, onUndo: () => void | Promise<void>, duration?: number): void;
```

---

## 4. 程序调用流程（时序图）

> 完整 Mermaid 见 `docs/sequence-diagram.mermaid`。要点：

### 4.1 A1 启动 → 拷贝 → 运行时解析 → 加载 Monaco
```
[构建] esbuild.renderer.mjs → dist/renderer/index.js
       copy-monaco-assets.mjs → dist/renderer/vs (loader.js + editor.main + base/workers)
[打包] electron-builder: dist/**/* 进 asar；asarUnpack dist/renderer/vs → 真实文件系统
[运行] index.html ──<script src="dist/renderer/vs/loader.js">──► 定义 window.require(AMD)
       EditorManager.init()
         ├─ vsBase = new URL('dist/renderer/vs', document.baseURI).href
         ├─ self.MonacoEnvironment.getWorkerUrl = blob(importScripts(vsBase+base/worker/workerMain.js))
         ├─ window.require.config({ paths:{ vs: vsBase } })
         └─ window.require(['vs/editor/editor.main'], cb, errCb)
               ├─ 成功 → createEditor() → resolve()
               └─ 失败 → showToast('编辑器加载失败…','error') → reject()（保留欢迎屏，不白屏）
```

### 4.2 A5 ai 经 bus 请求快照 → files responder 回传
```
ai/index.ts: attachActiveFileToAIContext()
   └─ bus.request(BusEvents.RequestActiveFileSnapshot)
          │  (Promise)
          ▼
files/index.ts: bus.respond(RequestActiveFileSnapshot, () => editorManager.getActiveFileSnapshot())
          │  调用 EditorManager.getActiveFileSnapshot()
          │  返回 { filePath, fileName, content, selection? } | null
          ▼
bus.request resolve(snapshot)
   └─ ai 侧据此 push 到 pendingFiles / 渲染上下文中心
```
`editor-manager.ts` 不参与（仅作为 `getActiveFileSnapshot` 的实现被 files responder 调用）；`window.__getActiveFileSnapshot` 保留为 deprecated 壳（访问 warn 一次）。

---

## 5. 任务列表（有序、含依赖、验收、风险）

> 编号沿用 S0–S8；P0=发布可用性/可维护，P1=体验/解耦试点。
> 推荐实现顺序：**S0/S2/S3/S4 可并行起步**；S1 依赖 S0；S5 依赖 S4；S6/S7 依赖 S5；S8 依赖 S2+S4。

### S0 — Monaco 资源拷贝与打包配置（A1·拷贝）【P0】
- **目标**：把 `min/vs` 拷到 `dist/renderer/vs`，并让 electron-builder 解包该目录。
- **涉及文件**：`scripts/copy-monaco-assets.mjs`（新）、`package.json`、`index.html`。
- **依赖**：无。
- **验收**：① `npm run build:renderer` 后 `dist/renderer/vs/loader.js` 与 `dist/renderer/vs/editor/editor.main.js` 存在；② `index.html` loader 路径指向 `dist/renderer/vs/loader.js`；③ `package.json` 移除 `node_modules/monaco-editor/**/*`、加 `asarUnpack`；④ `npm run package:dir` 产物 `resources/app.asar.unpacked/dist/renderer/vs` 存在。
- **风险**：低。`asarUnpack` 路径拼写错误会导致仍从 asar 加载失败——务必验证 `app.asar.unpacked` 实际落盘路径与 `dist/renderer/vs` 一致。

### S1 — Monaco 运行时路径解析与加载兜底（A1·运行时）【P0】
- **目标**：`init()` 运行时解析 vsBase，设 worker 代理，加载失败可见。
- **涉及文件**：`src/renderer/pages/files/editor-manager.ts`（init 段）、`src/renderer/pages/files/editor-core.ts`（拆分后落到此处）。
- **依赖**：S0。
- **验收**：① 不再出现硬编码 `node_modules/monaco-editor/min/vs`；② `npm run package` 实机编辑器可输入、无 `vs/editor/editor.main` 404；③ 人为让 loader 失败时出现 `toast` 错误而非白屏；④ `typecheck` 通过。
- **风险**：中。`document.baseURI` 在自定义协议下可能非 `file://`；保留 `try/catch` 兜底用相对 `'dist/renderer/vs'`。worker blob 代理语法需按 Monaco 0.52 校验。

### S2 — 事件总线 request/respond 机制（A5·底座）【P1】
- **目标**：bus 支持请求/响应语义，供快照同步取回。
- **涉及文件**：`src/renderer/services/bus.ts`。
- **依赖**：无。
- **验收**：① `bus.respond`/`bus.request` 签名如上；② 单测/手测：request 拿到 responder 返回值；无 responder/超时 reject；③ 既有 `on/emit` 行为不变；④ `typecheck` 通过。
- **风险**：低。注意 `responders` 与 `channels` 共存不冲突；多页同事件仅首个 responder 生效（本试点仅 files 注册，安全）。

### S3 — 共享 AI 错误文案工具 ai-error.ts（A4·底座）【P1】
- **目标**：新建权威 `formatAiError`，基准同 `ai/index.ts`。
- **涉及文件**：`src/renderer/shared/ai-error.ts`（新）。
- **依赖**：无。
- **验收**：① 导出 `formatAiError(error):string`；② 文案含 vision/image 分支；③ `typecheck` 通过。
- **风险**：低。

### S4 — 拆分 editor-manager（核心 + tabs，冻结公开 API）（A2·上）【P0】
- **目标**：抽出 `editor-core.ts` + `tabs.ts`，主类成为编排骨架，公开方法签名不变。
- **涉及文件**：`editor-manager.ts`、`editor-core.ts`（新）、`tabs.ts`（新）。
- **依赖**：无。
- **验收**：① 拆分后 `editor-manager.ts` ≤400 行；② 公开 API（openFile/openPath/saveFile/getActiveFileSnapshot/closeTab/...）签名与行为不变；③ `files/index.ts` 等调用方零改动编译通过；④ 核心编辑/保存/切换 Tab 手测通过；⑤ `typecheck` 通过。
- **风险**：高（最核心重构）。跨文件访问私有字段需用 `protected`/`EditorContext` 接口；建议先抽 tabs（含 A3 要改的 `confirmCloseDirtyTabs`，便于 S6 衔接）。

### S5 — 拆分 editor-manager（markdown/image/ai-actions/version-history/export）（A2·下）【P0】
- **目标**：抽出剩余 5 个子模块。
- **涉及文件**：`markdown.ts`、`image.ts`、`ai-actions.ts`、`version-history.ts`、`export.ts`（均新）、`editor-manager.ts`。
- **依赖**：S4。
- **验收**：① 各子模块 ≤~400 行，`editor-manager.ts` 仍 ≤400；② 公开 API 不变；③ Markdown 预览/大纲/AI 动作/版本历史/导出手测通过；④ `typecheck` 通过。
- **风险**：中。`ai-actions.ts` 含 `toFriendlyAiError`（S7 会删），可在本步先保留私有、S7 再收敛，避免改两次。

### S6 — 清除原生 alert/confirm，统一 Modal/Toast + 扩展安全网（A3）【P1】
- **目标**：全应用无阻塞 alert/confirm；兜底安全网覆盖 alert/confirm。
- **涉及文件**：`files/index.ts`、`file-tree.ts`、`home/index.ts`、`project.ts`、`settings/index.ts`、`template-service.ts`、`knowledge/index.ts`、`editor-manager.ts`（:1218，依赖 S5 的 tabs）、`app/index.ts`（安全网）。
- **依赖**：S5（editor-manager 的 confirm 在 tabs 模块）。
- **验收**：① 所有 `alert(msg)`→`toast(msg,type?)`，需 Ack 的用 `showModal` 单按钮；② 所有 `confirm(msg)`→`await showConfirmDialog(...)` 返回布尔；③ `installElectronDialogSafetyGuards` 扩展覆盖 `window.alert`/`window.confirm`；④ `grep` 原生 `alert/confirm` 仅剩安全网与 Modal 封装；⑤ 既有 Modal 样式不变。
- **风险**：中。`editor-manager.ts:1218` 的 `confirmCloseDirtyTabs` 改 async 需同步改 1267/1273/1315 调用点为 `await`；多行 alert 文本需确认 toast 换行渲染（`white-space:pre-line`）。

### S7 — 统一 AI 错误文案到 formatAiError（A4）【P1】
- **目标**：三处重复实现收敛到共享工具。
- **涉及文件**：`ai/index.ts`、`editor-manager.ts`（:1009+772/949，依赖 S5 的 ai-actions）、`template-service.ts`（:380+325）、`ai-error.ts`（S3 已建）。
- **依赖**：S3、S5。
- **验收**：① 删 `toFriendlyAiError`/`formatAIError`/`formatFriendlyAiError`，调用点改 `formatAiError`；② `grep` 仅剩 `ai-error.ts` 定义（及可选别名）；③ AI 失败路径手测文案正常；④ `typecheck` 通过。
- **风险**：低。注意 `ai/index.ts` 若保留 `formatFriendlyAiError` 别名，确保它直接 `return formatAiError(error)`。

### S8 — window.__* 迁移到 bus（files↔ai 快照）（A5）【P1】
- **目标**：ai 侧经 bus 取快照，files 注册 responder，deprecated 壳保留。
- **涉及文件**：`bus.ts`（S2 已扩）、`files/index.ts`（:691 壳 + responder、:494 直连）、`ai/index.ts`（:662/734）、`ai/studio.ts`（:270/313/325/331）。
- **依赖**：S2、S4（editor-manager 公开 `getActiveFileSnapshot` 已冻结）。
- **验收**：① `ai/index.ts`+`studio.ts` 共 6 处不再读 `window.__getActiveFileSnapshot`；② files 注册 responder 回传 `getActiveFileSnapshot()`；③ `window.__getActiveFileSnapshot` 仅作 deprecated 壳（访问 warn 一次），无新增 `window.__*` 读取；④ 跨页「用当前文件做 AI 总结/对话」手测通过；⑤ `typecheck` 通过。
- **风险**：中。`attachActiveFileToAIContext`/`refreshStudioContext` 为同步函数，改用 `.then` 保持调用方不变；`bus.request` 超时（默认 5s）需确保 files 页已初始化（responder 在 `initFilesPage` 内注册，ai 页访问时 files 已就绪）。

### 依赖图
```
S0 ──► S1
S2 ──► S8
S3 ──► S7
S4 ──► S5 ──► S6
         └────► S7
S4 ──► S8
```
并行起步组：{S0, S2, S3, S4}。

---

## 6. 依赖包列表

本期**无新增第三方运行时依赖**。仅构建期脚本（Node 内置 `fs` 即可，无需新包）。

- 若选「esbuild 插件法」替代拷贝脚本：仍仅用 esbuild 自带 API，**不引入新包**。
- `monaco-editor@^0.52.0` 已在 `dependencies`，无需升级。
- onnx 等属阶段 B，本期不涉及。

唯一建议：把 `scripts/copy-monaco-assets.mjs` 用 Node 内置 `fs.cpSync`（Node ≥16.7）实现，零依赖。

---

## 7. 共享知识（跨文件约定）

1. **Monaco 加载**：统一从 `dist/renderer/vs`（构建拷贝 + `asarUnpack`）；运行时路径**只**用 `new URL('dist/renderer/vs', document.baseURI).href` 解析，禁止硬编码 `node_modules/...` 或 `file://` asar 绝对路径。
2. **AI 错误文案**：全应用统一调用 `src/renderer/shared/ai-error.ts` 的 `formatAiError(error)`；不再有 `toFriendlyAiError`/`formatAIError`/`formatFriendlyAiError` 业务副本（最多一处别名）。
3. **弹窗/提示契约（Q5）**：
   - 信息/成功/错误通知 → `toast(message, type?)`（非阻塞），权威源 `widgets/toast.ts`。
   - 真·阻断式确认 → `await showConfirmDialog({title,message,confirmText,cancelText,danger?})` 返回布尔。
   - 需显式 Ack 的信息 → `showModal` 单按钮。
   - 原生 `alert`/`confirm` 仅作 `installElectronDialogSafetyGuards` 兜底，业务代码不得出现。
4. **window.__* 解耦**：`window.__getActiveFileSnapshot` 仅作 deprecated 壳（访问 warn 一次）；**新增跨页读取一律走 `bus.request`**；本试点范围严格限定 files↔ai，不波及 `knowledge↔ai` 的 `window.aiService` 与 home/project 其余全局。
5. **editor-manager 拆分铁律**：主类公开方法签名与行为 100% 不变；状态单一归属主类；子模块仅作委托，不得自行持有会偏离公开行为的状态。
6. **bus 语义**：单向通知用 `emit`/`on`；需要回值用 `request`/`respond`；一个请求事件仅一个 responder。

---

## 8. 待明确事项（交主理人拍板）

1. **A1 拷贝机制选型**：采用「构建后拷贝脚本 `scripts/copy-monaco-assets.mjs`」（推荐，已写入 S0）还是「esbuild 插件」？二者等价，请确认偏好；当前设计按脚本法落 S0。
2. **toast 模块统一**：是否在本期一并**删除 `utils/toast.ts`、把 `files/index.ts`/`app/index.ts` 的 `toast` 引入改指 `widgets/toast.ts`**，彻底消灭重复 toast？当前设计仅固化契约（§7.3），不强删旧文件以降低改动面。请拍板是否扩大范围。
3. **`formatFriendlyAiError` 是否保留别名**：A4 默认「直接删除、调用点改 `formatAiError`」；若担心第三方/插件引用，可保留别名。默认删。
4. **`files/index.ts:494` 处理**：同页自读 `window.__getActiveFileSnapshot` 改为直接 `editorManager.getActiveFileSnapshot?.()`（无异步、最稳）。确认此简化可接受（不走 bus 往返）。
5. **A2 拆分布局细节**：子模块个数（7）与划分（editor-core/tabs/markdown/ai-actions/image/version-history/export）是否认可？`save`/`statusBar` 已并入 `editor-core`。若 Engineer 倾向更细或合并，可在 S4/S5 内微调，前提是单文件 ≤400 且公开 API 不变。
6. **asarUnpack 验证环境**：`npm run package` 实机验证需在 Windows 打包环境进行（当前 dev 环境 `file://` 直读 `dist/renderer/vs` 已可验证加载，但 asar 解包路径需实机确认）。建议 S1 验收包含一次 `package:dir` 实机启动。
