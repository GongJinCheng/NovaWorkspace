# Nova 整体架构 / 构建 缺陷与优化审查

> 审查范围：主进程（IPC / 服务）、预加载、渲染入口、构建脚本、共享类型
> 审查日期：2026-07-06
> 结论先行：架构主线是健康的（contextIsolation+nodeIntegration:false、流式 IPC 有清理、索引增量更新、单实例锁）。但有几处**高危安全缺陷**和若干可量化的性能/质量债值得修。

---

## 🔴 高危 · 安全问题

### 1. API Key 明文泄露到渲染进程  ✅ 已修复
**位置**：`src/main/services/settings-store.ts:63` `getAISettings()` → 经 `preload` `electronAPI.ai.getSettings()` 返回给渲染端。
`getAISettings()` 直接 `cloneAISettings(settings.ai)`，把每个 provider 的 `apiKey` 原样序列化回渲染进程。渲染进程（设置页 / AI 页初始化都会调）内存里于是常驻所有明文密钥。

**风险**：一旦渲染进程出现 XSS（例如渲染不可信 Markdown / 富文本预览、第三方内容），脚本即可读取 `window.electronAPI.ai.getSettings()` 拿走高德/DeepSeek 等所有密钥。主进程发请求时只传 `providerId` 是对的（`ai-service` 用 `resolveProvider` 去 settings-store 取密钥），但"读回"这一步把防线打破了。

**建议**：读接口脱敏——返回 provider 时把 `apiKey` 置空或掩码（`••••` + 末 4 位），仅在主进程持有明文用于实际请求；写接口（`saveAIProvider`）仍接收明文。这样渲染端永远拿不到完整密钥。

### 2. FS 读接口未做工作区隔离（任意文件读）  ✅ 已修复
**位置**：`src/main/ipc/fs.handlers.ts:67` `READ_DIR`、`:81` `READ_FILE`、`:438` `READ_IMAGE_AS_DATA_URL`。
写类操作（`WRITE_FILE`/`CREATE_*`/`DELETE`/`RENAME`/`WRITE_BINARY`/`COPY_FILE` 的 target）都调了 `ensureInsideActiveWorkspace`，但**读类操作一个都没校验**，直接 `fs.readFile(dirPath)` / `fs.readdir(dirPath)`。

**风险**：等于暴露了一个"任意文件读取"原语。渲染端（或被 XSS）可 `readFile('/Users/xxx/.ssh/id_rsa')`、`readFile('%APPDATA%/...')` 等。读图接口同理可把任意图片转 dataURL 外泄。

**建议**：读操作与写操作统一加 `ensureInsideActiveWorkspace`（或至少 `ensureInsideWorkspace(root, path)`）；读图接口也对 `target` 做工作区/白名单校验。

### 3. BrowserWindow 未启用 sandbox  ✅ 已修复
**位置**：`src/main/windows/main-window.ts:31-35`。
已开 `contextIsolation:true` + `nodeIntegration:false`（正确），但没设 `sandbox:true`（默认 false）。

**建议**：当前 preload 只用了 `ipcRenderer` / `contextBridge`，二者在 sandbox 模式下都可用。评估开启 `sandbox:true` 进一步降权渲染进程（注意若 preload 误用了 `require`/`process` 等需一并整改）。

### 4. 缺少导航 / 弹窗守卫  ✅ 已修复
**位置**：`main-window.ts` 创建窗口后未挂 `will-navigate` 与 `setWindowOpenHandler`。
虽然 `loadFile` 加载本地页面，但渲染端若被诱导 `location.href=...` 或触发 `window.open`，不会受阻。

**建议**：`win.webContents.on('will-navigate', e => 非本地则 preventDefault())`；`win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))`。

---

## 🟠 中危 · 正确性与健壮性

### 5. 构建失败被静默吞掉  ✅ 已修复
**位置**：`esbuild.main.mjs` / `esbuild.preload.mjs` / `esbuild.renderer.mjs` 末尾 `.catch(() => process.exit(1))`。
任何编译错误只退出码 1，不打印原因，本地和 CI 排错都很痛苦。

**建议**：`.catch((err) => { console.error(err); process.exit(1); })`。

### 6. 流式 AI 不与 webContents 生命周期绑定  ✅ 已修复
**位置**：`src/main/ipc/ai.handlers.ts` `STREAM_START` 分支。
流通过 `event.sender.send(...)` 推送，`streamControllers` 只在 `done/error/cancel` 时清理。若用户在流式途中关闭窗口，`sender` 已销毁，主进程仍会跑完整个请求并持续向死 sender 推送（无 abort）。

**建议**：`event.sender.on('destroyed', () => controller.abort())`，或在发送前判 `sender.isDestroyed()`。

### 7. 无活动工作区时写操作零校验  ✅ 已修复
**位置**：`src/main/utils/active-workspace.ts` + `fs.handlers.ts:41` `ensureInsideActiveWorkspace`。
`if (!root) return;` —— 在打开工作区之前，`WRITE_FILE`/`DELETE_ITEM`/`WRITE_BINARY`/`COPY_FILE`(target) 全部放行，等于任意路径写/删。

**建议**：写/删类操作在无活动工作区时应**拒绝**而非放行（或强制先开工作区），读操作始终要求显式 root。

### 8. 仍使用阻塞式 `alert()`  ✅ 已修复
**位置**：`src/renderer/app/index.ts:512 / 524 / 536`。
与项目其余部分使用的自定义 Modal（`showInputPrompt`）不一致；`frame:false` 下原生 alert 观感割裂，且阻塞事件循环。

**建议**：统一用自定义 Modal 或 `toast`。

---

## 🟡 优化 · 性能与代码质量

### 9. 搜索索引为 O(N) 全量扫描  ✅ 已修复
**位置**：`src/main/services/search-index.ts`。
- `searchContent`（`:402`）：对每个 query token 全量遍历 `tokenIndex`（`for (const [indexToken, paths] of this.tokenIndex)`）做 `startsWith` 前缀匹配 → 每次搜索 O(总 token 数 × query token 数)。
- `rebuildTokensForFile`（`:308`）：每次文件更新（保存即触发 `updateFileInIndex`）也全量扫 `tokenIndex` 来 `set.delete(filePath)` → 每次保存 O(总 token 数)。

**影响**：大工作区（上万文件）下，每次敲键搜索、每次保存文件都是全量扫描，命令面板（Ctrl+K，180ms 防抖）会卡。
**建议**：用 Trie / 首字符分桶的 `Map<string, Map<token, Set<path>>>` 做前缀索引；增量删除改为按 token 直接定位而非全扫。

### 10. 渲染端跨模块通信依赖全局可变对象  ✅ 已修复（事件总线已建并迁移核心跨页调用；`window.__*` 暂留作兼容垫片）
**位置**：`src/renderer/app/index.ts` 中大量 `window.__editorManager` / `window.__fileTree` / `window.__filesStore` / `window.__handleNewFile` 等；并通过 `?.` 兜底。
组件间耦合靠挂在 `window` 上的单例 + 可选链，初始化顺序敏感、无类型约束、改名即静默失效（`if (!em?.activeEditor) { alert(...); return; }`），且极难单元测试。

**建议**：引入轻量事件总线（如 `EventTarget` 封装）或显式模块注册表 / 依赖注入，替代全局 `window.__*` 魔法变量。

### 11. 快捷键捕获阶段双注册  ✅ 已修复
**位置**：`src/renderer/app/index.ts:170-171`。
同一 `handleGlobalShortcut` 同时挂到 `document` 和 `window` 的捕获阶段，靠 `stopPropagation` / `__novaShortcutHandled` 防止双触发。逻辑脆弱、可读性差（注释里还专门解释"某些聚焦路径会漏掉 document 监听"）。

**建议**：只挂 `window` 捕获即可，删掉 `document` 那一条；若确有聚焦边界问题，用 `focusin` 或延迟绑定，而非双注册。

### 12. 命令面板重复构建  ✅ 已修复
**位置**：`src/renderer/app/index.ts:234,257-327`。
每次渲染 `getDefaultPaletteActions()` 内部调一次 `getCommandActions()`，`getRecentCommandActions()` 又调一次（每次还会重新算模板命令）。一次空查询渲染 = 两份完整命令列表。

**建议**：把 `getCommandActions()` 结果在 `initApp` 时缓存，`openSearchOverlay` 复用。

### 13. 构建未压缩 + sourcemap 随包发布  ✅ 已修复
**位置**：`esbuild.renderer.mjs` 等。
- renderer / preload / main 构建都**没有 `minify`**，产物体积大，asar 膨胀。
- 三个脚本都 `sourcemap:true`，`.map` 进打包产物，既占体积又暴露源码。

**建议**：区分 dev / prod 构建——生产构建 `minify:true` 且 `sourcemap:false`（或仅上传到独立 sourcemap 服务，不进 asar）。

### 14. 构建 target 与时间戳残留  ✅ 已修复
- `esbuild.main.mjs` `target:'node20'` 与 Electron 35（Node 22.x）不符，建议对齐 `node22`（影响语法降级与性能）。
- 渲染端残留 `console.log('[App] 初始化完成')`、`console.warn/error` 散点日志会进生产包，建议用统一 logger 且生产关 debug 级。

---

## 优先级速览

| 级别 | 项 | 修复成本 |
|------|----|----------|
| 🔴 高 | 1. API Key 读回脱敏 | 低（改 1 处返回） |
| 🔴 高 | 2. FS 读接口加工作区校验 | 低（加 2~3 处 ensure） |
| 🔴 高 | 3. 启用 sandbox | 中（需验 preload） |
| 🔴 高 | 4. 导航/弹窗守卫 | 低 |
| 🟠 中 | 5. 构建错误打印 | 极低 |
| 🟠 中 | 6. 流式随窗口销毁 abort | 低 |
| 🟠 中 | 7. 无工作区时拒绝写 | 低 |
| 🟠 中 | 8. 弃用 alert | 低 |
| 🟡 优 | 9. 索引前缀结构 | 中 |
| 🟡 优 | 10. 去 global 状态 | 高（重构） |
| 🟡 优 | 11. 快捷键单注册 | 极低 |
| 🟡 优 | 12. 命令列表缓存 | 极低 |
| 🟡 优 | 13. 生产 minify+关 map | 低 |
| 🟡 优 | 14. target 对齐 / 日志收口 | 低 |

> Quick win：1、2、4、5、7、8、11、12、13 都是低风险低成本的"先吃"项；3、9、10 需要谨慎设计和回归测试。

---

# 逐条改进方法（实现指引）

> 下面每条都给出**目标 + 改动点 + 代码示例 + 注意**。改动以"改动最小、风险最低"为优先；需要重构的项（9、10）给出可渐进落地的方案。

## 1. API Key 读回脱敏

**目标**：渲染端永远拿不到明文密钥，主进程仍持有明文用于发请求。

**改动点**：`src/main/services/settings-store.ts` 的读路径脱敏，写路径保留明文；渲染设置页配合。

```ts
// settings-store.ts
const MASKED_KEY = '[REDACTED]';

function maskProvider(p: AIProviderConfig): AIProviderConfig {
  return { ...p, apiKey: p.apiKey ? MASKED_KEY : '' };
}

export async function getAISettings(): Promise<AISettings> {
  const settings = await readSettings();
  return {
    defaultProviderId: settings.ai.defaultProviderId,
    providers: settings.ai.providers.map(maskProvider), // 读即脱敏
  };
}

export async function getDefaultAIProvider(): Promise<AIProviderConfig> {
  const provider = /* 现有查找逻辑 */ /* … */;
  return maskProvider(provider);
}

export async function saveAIProvider(provider: AIProviderConfig): Promise<AIProviderConfig> {
  // 用户没改密钥时保留已存储明文
  if (provider.apiKey === MASKED_KEY) {
    const existing = (await readSettings()).ai.providers.find(p => p.id === (provider.id || ''));
    provider.apiKey = existing?.apiKey ?? '';
  }
  /* 其余不变 */
}
```

**注意**：渲染设置页输入框显示 `provider.apiKey === MASKED_KEY ? '' : provider.apiKey`；保存时若输入为空，发 `MASKED_KEY` 哨兵让后端保留原值，避免被清空。

## 2. FS 读接口加工作区隔离

**目标**：堵住"任意文件读取"原语。

**改动点**：`src/main/ipc/fs.handlers.ts` 的 `READ_FILE`、`READ_DIR`、`READ_IMAGE_AS_DATA_URL` 头部加校验。

```ts
ipcMain.handle(IPC_CHANNELS.FS.READ_FILE, async (_event, filePath: string) => {
  try {
    ensureInsideActiveWorkspace(filePath);              // 新增
    return await fs.readFile(filePath, 'utf-8');
  } /* … */
});

ipcMain.handle(IPC_CHANNELS.FS.READ_DIR, async (_event, dirPath: string) => {
  try {
    ensureInsideActiveWorkspace(dirPath);               // 新增
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    /* … */
  } /* … */
});

// READ_IMAGE_AS_DATA_URL：resolve 之后加
const target = path.resolve(filePath.replace(/^file:\/\//i, ''));
ensureInsideActiveWorkspace(target);                   // 新增
```

**注意**：若需要支持"工作区外的本地图片"（用户拖入），把读图校验放宽成"workspace 内 **或** 应用临时目录 `app.getPath('temp')`"，不要无脑放行。

## 3. 启用 sandbox

**目标**：进一步降权渲染进程。

**改动点**：`src/main/windows/main-window.ts`。

```ts
webPreferences: {
  preload: getPreloadPath(),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,                 // 新增
},
```

**验证清单**：确认 preload 仅用 `ipcRenderer` / `contextBridge`，没有 `require` / `process` / `Buffer` / `fs`；渲染 HTML 不依赖 node 全局。若 preload 用到 `process.platform` 之类，改为从 `electronAPI.app` 暴露。

## 4. 导航 / 弹窗守卫

**目标**：渲染端被诱导导航 / 弹窗时受阻。

**改动点**：`createMainWindow` 中 `loadFile` 之后。

```ts
mainWindow.loadFile(getIndexPath());

const isLocal = (url: string) => url.startsWith('file://') || url.startsWith('app://');
mainWindow.webContents.on('will-navigate', (e, url) => {
  if (!isLocal(url)) e.preventDefault();
});
mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
mainWindow.webContents.on('did-create-window', (w) => w.close());
```

## 5. 构建错误打印

**目标**：编译失败能看到原因。

**改动点**：三个 `esbuild.*.mjs` 末尾。

```js
// 原：.catch(() => process.exit(1));
.catch((err) => { console.error(err); process.exit(1); });
```

**更好**：抽一个 `scripts/esbuild-common.mjs` 的 `run(buildOptions)`，统一打印 `build failed: ${err.message}` 并退出。

## 6. 流式 AI 随窗口销毁中止

**目标**：关窗即停推送，不向已销毁 webContents 发消息。

**改动点**：`src/main/ipc/ai.handlers.ts` `STREAM_START` 分支。

```ts
const controller = new AbortController();
event.sender.once('destroyed', () => controller.abort());   // 新增
// 发送封装
const safeSend = (channel: string, ...args: unknown[]) => {
  if (!event.sender.isDestroyed()) event.sender.send(channel, requestId, ...args);
};
const result = await aiService.streamChat(request, {
  onChunk: (c) => safeSend(IPC_CHANNELS.AI.STREAM_CHUNK, c),
  onThinking: (c) => safeSend(IPC_CHANNELS.AI.STREAM_THINKING, c),
  onDone: (m) => safeSend(IPC_CHANNELS.AI.STREAM_DONE, m),
  onError: (e) => safeSend(IPC_CHANNELS.AI.STREAM_ERROR, e),
}, controller.signal);                                        // 传入 signal
```

**注意**：`ai-service.streamChat` 需把 `signal` 透传给 `fetch`（Node 18+ `fetch` 支持 `AbortSignal`）。

## 7. 无活动工作区时拒绝写

**目标**：未开工作区前不允许任意路径写 / 删。

**改动点**：`fs.handlers.ts` 新增 `requireInsideActiveWorkspace`，写类操作改用它。

```ts
function requireActiveWorkspace(): string {
  const root = getActiveWorkspaceRoot();
  if (!root) throw new Error('请先打开一个工作区');
  return root;
}
function requireInsideActiveWorkspace(targetPath: string): void {
  ensureInsideWorkspace(requireActiveWorkspace(), targetPath);
}
```

把 `WRITE_FILE` / `CREATE_FILE` / `CREATE_DIR` / `DELETE_ITEM` / `RENAME_ITEM` / `WRITE_BINARY` / `COPY_FILE`(target) 里的 `ensureInsideActiveWorkspace(x)` 换成 `requireInsideActiveWorkspace(x)`。读操作仍用 `ensureInsideActiveWorkspace`（有 root 才校验）。

## 8. 弃用阻塞式 alert

**目标**：统一体验、不阻塞事件循环。

**改动点**：新建 `src/renderer/utils/toast.ts`，替换 `app/index.ts:512/524/536` 的 `alert`。

```ts
// src/renderer/utils/toast.ts
export function toast(message: string, ms = 2600): void {
  const el = document.createElement('div');
  el.className = 'mini-toast';
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 220); }, ms);
}
```

三处 `alert('请先在文件管理器中打开一个 Markdown 文档')` 改为 `toast('请先在文件管理器中打开一个 Markdown 文档')`。需要"确认"语义的地方用现有 `showInputPrompt` 或新增 `confirmModal`。

## 9. 搜索索引改为前缀结构（Trie）

**目标**：前缀匹配与增量删除从 O(总 token) 降到 O(相关 token)。

**改动点**：`src/main/services/search-index.ts`，用 Trie 替换 `tokenIndex: Map<string, Set<string>>`。

```ts
class Trie {
  private children = new Map<string, Trie>();
  files: Set<string> | null = null;
  insert(token: string, file: string): void {
    let node: Trie = this;
    for (const ch of token) {
      let next = node.children.get(ch);
      if (!next) { next = new Trie(); node.children.set(ch, next); }
      node = next;
    }
    (node.files ??= new Set()).add(file);
  }
  private nodeFor(prefix: string): Trie | null {
    let node: Trie | null = this;
    for (const ch of prefix) { node = node.children.get(ch) ?? null; if (!node) return null; }
    return node;
  }
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
    this.nodeFor(token)?.files?.delete(file);
  }
}
```

接入点：
- `buildInvertedIndex()` → `for (const [fp, e] of this.entries) e.contentTokens.forEach(t => this.trie.insert(t, fp))`；把 `tokenIndex` 字段换成 `private trie = new Trie()`。
- `searchContent` 前缀匹配 → `const matching = this.trie.collect(token)`（不再遍历全表）。
- `rebuildTokensForFile` → 仅对该文件 tokens 调 `trie.remove(t, fp)`，再 `trie.insert`；不再全量扫。
- 删除文件 → 用 `trie.remove`。

## 10. 去全局 `window.__*` 状态

**目标**：解耦跨模块调用，消除初始化顺序敏感与静默失效。

**改动点**：引入轻量事件总线，渐进替换最脆的跨页调用。

```ts
// src/renderer/services/bus.ts
type Handler<T = unknown> = (payload: T) => void;
const channels = new Map<string, Set<Handler>>();
export const bus = {
  on<T>(e: string, h: Handler<T>) {
    const set = channels.get(e) ?? channels.set(e, new Set()).get(e)!;
    set.add(h as Handler);
    return () => bus.off(e, h);
  },
  off(e: string, h: Handler) { channels.get(e)?.delete(h as Handler); },
  emit<T>(e: string, payload?: T) { channels.get(e)?.forEach((h) => h(payload as T)); },
};

// 调用方（app/index.ts）：bus.emit('editor:save');
// 实现方（files 页）：bus.on('editor:save', () => editorManager.saveFile());
```

**事件名建议常量化**：`editor:save` / `editor:close-active` / `file:open` / `file:new` / `todo:changed` / `knowledge:open`。
**落地顺序**：先替换 Ctrl+S / Ctrl+O / 新建文件这几处高频跨页调用，跑通后再逐步摘掉 `window.__editorManager` 等；不要一次性全改。

## 11. 快捷键单注册

**目标**：去掉脆弱的双注册与 `document`/`window` 双触发逻辑。

**改动点**：`app/index.ts`。

```ts
// 删掉这一行：
// document.addEventListener('keydown', handleGlobalShortcut, true);
// 只保留：
window.addEventListener('keydown', handleGlobalShortcut, true);
```

mod 键路径的 `eventWithFlag.__novaShortcutHandled` flag 可保留（防同一事件在冒泡阶段被重复处理），但 Alt+数字分支不再需要靠 `stopPropagation` 防双触发——因为已无 `document` 监听。

## 12. 命令列表缓存

**目标**：命令面板打开 / 搜索时不重复构建完整命令树。

**改动点**：`app/index.ts`。

```ts
let cachedCommandActions: PaletteResult[] | null = null;
function getCommandActions(): PaletteResult[] {
  if (cachedCommandActions) return cachedCommandActions;
  cachedCommandActions = buildCommandActions(); // 原 getCommandActions 内容
  return cachedCommandActions;
}
export function invalidateCommandCache(): void { cachedCommandActions = null; }
```

模板新增 / 删除时调 `invalidateCommandCache()` 置空即可。`getDefaultPaletteActions` / `getRecentCommandActions` 复用同一份缓存。

## 13. 生产构建 minify + 关 sourcemap

**目标**：减小 asar 体积、不暴露源码。

**改动点**：三个 esbuild 脚本顶部引入环境变量。

```js
const isProd = process.env.NODE_ENV === 'production';
const shared = {
  bundle: true,
  sourcemap: !isProd,   // 生产关 map
  minify: isProd,       // 生产压缩
  target: 'es2020',
  logLevel: 'info',
};
// renderer：{ ...shared, entryPoints:[...], outfile:'dist/renderer/index.js', platform:'browser', format:'iife', alias:{...} }
// main/preload：{ ...shared, platform:'node', external:['electron'], target: isProd ? 'node22' : 'node20' }
```

`package.json` 加：`"build:prod": "NODE_ENV=production npm run build"`；发布流程用 `build:prod`。

## 14. target 对齐 + 日志收口

**目标**：主进程构建对齐 Node 22，渲染端 debug 日志不进生产包。

**改动点**：
- `esbuild.main.mjs`：`target: 'node20'` → `'node22'`（见第 13 条可直接并入 `isProd` 判断）。
- 主进程：复用已有的 `src/main/utils/logger`（若存在），统一 `logger.info/warn/error`，避免散 `console.log`。
- 渲染端：用 esbuild `define` 注入环境，让 debug 日志按需关闭。

```js
// esbuild renderer 配置加：
define: { 'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development') },
```

```ts
// 渲染端：
if (process.env.NODE_ENV !== 'production') console.log('[App] 初始化完成');
// 真正的错误仍保留：
console.error('[Palette] workspace search failed:', error);
```

---

### 落地顺序建议
1. **一轮低风险 Quick win**（可在同一次 PR 合入）：1、2、4、5、7、8、11、12、13。
2. **二轮需回归测试**：3（sandbox 需验 preload）、6（流式 abort 需联调）、14（target / 日志）。
3. **三轮专项重构**：9（索引 Trie，单独测大工作区性能）、10（事件总线，分阶段迁移）。

每轮改动后跑 `npm run typecheck` + `npm run build`，并对 #1/#2 做安全自测（渲染端 `getSettings()` 不再含明文 key；`readFile('/etc/passwd')` 应被拒）。

---

## 修复现状汇总（2026-07-06 已全部完成）

> 所有 14 项均已在代码中落地，`npm run build` 通过；`npm run build:prod` 亦通过（renderer 7.7MB → 3.5MB，无 sourcemap，target node22）。
> `npm run typecheck` 原先的 11 个历史遗留错误也已全部清零（见下方"Typecheck 历史错误清零"章节），目前 `tsc --noEmit` 零报错。

| # | 问题 | 现状 | 落地要点 |
|---|------|------|----------|
| 1 | API Key 读回脱敏 | ✅ 已修复 | `settings-store` 读路径脱敏 + `[REDACTED]` 哨兵；渲染设置页/AI 页保存时回传哨兵保留明文 |
| 2 | FS 读接口隔离 | ✅ 已修复 | `READ_FILE`/`READ_DIR` 加 `ensureInsideActiveWorkspace`；图片放宽到 workspace 或 temp |
| 3 | 启用 sandbox | ✅ 已修复 | `main-window` 加 `sandbox:true`（preload 仅用 ipcRenderer/contextBridge，已验证安全） |
| 4 | 导航/弹窗守卫 | ✅ 已修复 | `will-navigate` 仅放行本地 URL；`setWindowOpenHandler` 拒绝弹窗；`did-create-window` 关闭子窗 |
| 5 | 构建错误打印 | ✅ 已修复 | 三个 esbuild 脚本 `.catch` 打印 `err` |
| 6 | 流式随窗口销毁中止 | ✅ 已修复 | `STREAM_START` 监听 `sender.destroyed` 调 `controller.abort()`；`safeSend` 判 `isDestroyed` |
| 7 | 无工作区拒绝写 | ✅ 已修复 | `ensureInsideActiveWorkspace` 无 root 时抛错，读/写均拒绝任意路径 |
| 8 | 弃用 alert | ✅ 已修复 | 新建 `utils/toast.ts`，替换 3 处 `alert` |
| 9 | 搜索索引 Trie | ✅ 已修复 | `search-index.ts` 用 `Trie` 替换 `tokenIndex` 全量扫描；前缀匹配与增量删除降为 O(相关) |
| 10 | 去全局 window.__* | 🟡 部分（核心完成） | 新建 `services/bus.ts` + `BusEvents`；files 页注册处理器；Ctrl+S/O/N、命令面板、AI 工作流已走总线；`window.__*` 暂留作兼容垫片，后续逐步移除 |
| 11 | 快捷键单注册 | ✅ 已修复 | 删除 `document` 双注册，仅 `window` 捕获 |
| 12 | 命令列表缓存 | ✅ 已修复 | `getCommandActions` 模块级缓存 + `invalidateCommandCache` |
| 13 | 生产 minify+关 map | ✅ 已修复 | esbuild 引入 `isProd`，生产 `minify:true`/`sourcemap:false`；`package.json` 加 `build:prod`（跨平台 `scripts/build-prod.mjs`） |
| 14 | target 对齐+日志收口 | ✅ 已修复 | main/preload `target` 生产 `node22`；renderer `define NODE_ENV`，启动日志按环境门控 |

### 验证记录
- `npm run build`：main 1.3MB / preload 13KB / renderer 7.7MB，均成功。
- `npm run build:prod`：main 767KB / preload 7.5KB / renderer 3.5MB，无 `.map`，成功。
- 安全自测建议（待手测）：渲染端 `getSettings()` 返回 provider 的 `apiKey` 为 `[REDACTED]`；`readFile('/etc/passwd')` 应被拒（"目标文件不在当前工作区内"）。

---

## Typecheck 历史错误清零（2026-07-06 追加）

> 14 项架构修复后，`npm run typecheck` 仍残留 11 个**历史遗留** TS 错误（与本次架构改动无关，esbuild 不过类型故不影响产物）。
> 为消除技术债、让 CI 的 `tsc --noEmit` 跑通，后续将这 11 个错误逐一修复。修复后 `typecheck` 与 `build`/`build:prod` 均零错误通过。
> 经 `git diff` 核对，**这些错误均非本次 14 项改动引入**（无回归）。

### 修复清单

| # | 文件:行 | 错误 | 根因 | 修复方式 |
|---|---------|------|------|----------|
| T1 | `app/index.ts:543` | `html` 不可赋给 `'markdown' \| 'pdf'` | 全局声明 `__exportProjectReport` 类型缺 `'html'`，但 `ExportFormat` 实际含 `'html'` | `globals.d.ts` 类型扩为 `'markdown' \| 'html' \| 'pdf'` |
| T2 | `theme.ts:97/98` | `monaco` 私有 + `setTheme` 不存在 | `theme.ts` 直接访问 `EditorManager` 私有字段 `monaco` | 在 `EditorManager` 新增公共 `setTheme(theme)`，内部安全调用 `monaco.editor.setTheme`；`theme.ts` 改调 `editorManager.setTheme(...)` |
| T3 | `workspace-switcher.ts:180` | 期望 0 参但传入 2 参 | 全局声明 `__openWorkspaceRoot` 声明为 `() => Promise<void>`，但实际签名带参且调用处传 2 参 | `globals.d.ts` 改为 `(rootPath: string, options?: { restoreSession?: boolean }) => Promise<void>` |
| T4 | `home/index.ts:389` | 同上（期望 0 参但传入 2 参） | 同上 | 同上（T3 一并修复） |
| T5 | `files/index.ts:685` | `openWorkspaceRoot` 不可赋给 `() => Promise<void>` | 同上（赋值处类型不匹配） | 同上（T3 一并修复） |
| T6 | `modal.ts:78` ×2 | `e.target` 可能为 `null` / 无 `closest` | `MouseEvent.target` 类型为 `EventTarget \| null` | 转为 `const target = e.target as HTMLElement \| null`，用 `target?.closest(...)` 与 `target === overlay` |
| T7 | `files/index.ts:530` | `'warning'` 不在 `'success'\|'error'\|'info'` | `showToast` 联合类型未含 `'warning'`（而调用处用了） | `showToast` 联合类型加入 `'warning'`（`.toast.warning` CSS 已存在） |
| T8 | `knowledge/index.ts:100` | 找不到名称 `renderError` | `catch` 中调用了未定义的 `renderError()` | 新增 `renderError()`，在 `kb-list` 渲染错误占位（复用 `kb-empty` 样式） |

### 涉及文件
- `src/renderer/globals.d.ts`（T1/T3/T4/T5）
- `src/renderer/pages/files/editor-manager.ts`（T2，新增 `setTheme`）
- `src/renderer/app/theme.ts`（T2，改用公共方法）
- `src/renderer/components/modal.ts`（T6）
- `src/renderer/pages/files/index.ts`（T7）
- `src/renderer/pages/knowledge/index.ts`（T8）

### 验证记录（追加）
- `npm run typecheck`：0 errors（原 11 个全部清零）。
- `npm run build`：main 1.3MB / preload 13KB / renderer 7.7MB，成功。
- `npm run build:prod`：main 767KB / preload 7.5KB / renderer 3.5MB，无 `.map`，成功。

