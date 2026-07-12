# Nova 代码库综合分析报告

> **分析对象**：Nova — All-in-one productivity workspace（Electron 35 + TypeScript 5.7，本地优先 AI 工作台）
> **分析版本**：`2.9.17`（package.json 实测，工作记忆中 2.9.2 已过时）
> **分析日期**：2026-07-12
> **分析范围**：`src/`（85 个 TS 文件 + 27 个 CSS 文件，共 112 个源文件）+ 构建/打包配置
> **方法**：四路并行深度代码审计（架构 / 代码质量 / 功能正确性 / UI·路由·状态）+ 关键量化指标实测交叉验证
> **证据约定**：所有结论均带 `文件:行号`，量化指标已用脚本逐条核验

---

## 0. 执行摘要（TL;DR）

**总体健康度：7.5 / 10** —— 安全基座与进程边界扎实，功能完成度高；但渲染端在「无框架 + 全局耦合 + 页面对单体」三重叠加下已逼近**可维护拐点**。

**最关键的裁决（用户核心关切）**：后续开发应**优先「已有功能的优化迭代」**（正确性修复 + 架构去债 + 体验打磨），**而非启动独立的「性能开发」专项**。理由：

- 当前**没有确凿的性能危机证据**（无 Jank/内存泄漏/大重绘的实测报告），性能问题仅为零散点（Monaco worker 未配、大文件冻结、CSS 22 层累积），它们本质是「技术债」而非「性能瓶颈」。
- 当前**有确凿的正确性与可维护性危机**：子任务状态不回写、AI 流式无法取消、关窗不拦未保存、版本历史不去重、1708 行上帝文件、`window.__*` 全局耦合 62 处、渲染端 26 处原生 `alert/confirm`、零 ESLint。
- 性能专项若现在单独立项，属于**过早优化**；应把少数真实性能点（Monaco worker、大文件保护、CSS 收敛）作为「优化迭代」的**子集**一并消化。

**一句话方向**：先止血（正确性）与还债（架构/规范），再打磨体验，性能作为债的副产品顺手解决；**v3.0 全自主 Agent 工作流继续延后**做 MVP 验证。

---

## 1. 项目快照（实测）

| 项 | 值 | 来源 |
|---|---|---|
| 版本 | `2.9.17` | package.json:3 |
| 桌面框架 | Electron `^35.0.0` | package.json:72 |
| 语言 | TypeScript `^5.7.0`，`strict:true` | tsconfig.json:10 |
| 构建 | esbuild（3 入口 main/preload/renderer） | esbuild.*.mjs |
| 编辑器 | monaco-editor `^0.52.0` | package.json:82 |
| 渲染层 | **无 UI 框架**（vanilla DOM） | 全仓 grep `import ... react/vue` 零命中 |
| 打包 | electron-builder（NSIS + portable，x64） | package.json:37-51 |
| 源文件规模 | 112 文件（85 TS + 27 CSS） | 实测 |
| 最大文件 | `editor-manager.ts` **1708 行** | 实测 |
| 全局耦合 | `window.__*` 出现 **62 次**，涉及 **18 个** 不同全局 | 实测 |
| 原生对话框残留 | 渲染端 `alert/confirm/prompt` **26 处** | 实测 |
| Lint/格式化 | **0 个** ESLint/Prettier 配置 | 实测 `ls` |
| 路由方式 | **0 处** `hashchange/pushState` —— 纯函数式切换 | 实测 |

> ⚠️ 工作记忆中「7 个 handler / 6 个 service」「index.html 含内联 `<style>`」等描述已与事实漂移，详见 F6 / UI-8。

---

## 2. 架构分析

**结论：needs-work（方向正确，基座扎实，局部需重构）**

### 2.1 值得肯定的硬约束
- **安全基座到位**：`main-window.ts:31-36` 显式 `contextIsolation:true / nodeIntegration:false / sandbox:true`；`will-navigate` 仅放行本地 URL，`setWindowOpenHandler(() => ({action:'deny'}))`（`main-window.ts:43-49`）。
- **IPC 通道真正集中**：唯一来源 `src/shared/constants/ipc-channels.ts`，全仓 grep 确认硬编码字符串只出现在该定义文件。
- **依赖图无环**：渲染端**零** `import ... from 'electron'`（grep 零命中），全部经 `window.electronAPI`。
- **AI 流式设计正确**：`preload/index.ts:88-122` 用 `ipcRenderer.send/on` + `requestId` 作用域 + `cleanup()` 退订；主端 `ai.handlers.ts:38-68` 以 `streamControllers` Map 按 id 管理、`safeSend` 守卫 `isDestroyed()`。
- **文件读写安全**：`fs.handlers.ts:41-45` `ensureInsideActiveWorkspace` 做路径越权防护，无目录穿越风险。

### 2.2 发现（按严重度）

| ID | 严重度 | 问题 | 证据 | 建议 |
|---|---|---|---|---|
| A1 | HIGH | 渲染端页面级**上帝文件**：`editor-manager.ts` 1708 行、`ai/index.ts` 1518 行、`files/index.ts` 892 行、`app/index.ts` 827 行，单文件同时负责 DOM 渲染 + 事件绑定 + 业务编排 + 状态同步 | 实测行数 | 以 `FilesStore` 为样板拆「状态/视图/交互」三层；`EditorManager` 只管编辑器生命周期，文件树/标签/AI 下沉子模块 |
| A2 | HIGH | `window.__*` **全局耦合反模式**：18 个全局、62 处读写；事件总线 `bus.ts` 已存在却只部分采用（约 17 处） | `globals.d.ts`、`home/index.ts:271/384`、`workspace-switcher.ts:178-196`、`ai/index.ts:662/734` | 冻结 `globals.d.ts` 新增，新调用一律走 `bus`；按 `BusEvents` 逐项替换跨页调用后删除全局声明 |
| A3 | MED | **IPC 客户端抽象被绕过**：`ipc-client.ts` 是类型安全出口，但约 50+ 处直接 `await window.electronAPI.xxx(...)` | `ai/index.ts`（13+）、`knowledge/index.ts:388/429/517`、`files/index.ts`、`settings/index.ts:283` | 页面内移除 `window.electronAPI` 直连，统一经 `ipcClient` |
| A4 | MED | **Monaco 集成脆弱**：用 `window.require.config({paths...})` AMD loader 运行时加载，全仓无 `MonacoEnvironment.getWorker` 配置 | `editor-manager.ts:146-151` | 改用 monaco ESM 包并显式配置 `getWorker`，或固定 loader 注入顺序 |
| A5 | MED | **导出逻辑跨进程重复**：主进程 `export-service.ts:78` 与渲染端 `export-service.ts:13/100/118` 各实现导出与 HTML/报告拼装 | 同上 | 主进程管写出，渲染端管拼装，共享 `buildExportHtml` 抽到 `shared` |
| A6 | LOW | 架构文档与事实漂移（handlers 实际 10 个、services 实际 9 个） | `src/main/ipc`、`src/main/services` | 更新架构说明 |
| A7 | LOW | preload 暴露约 70 个方法（`satisfies ElectronAPI`），攻击面宽但受类型约束兜底 | `preload/index.ts` | 非紧急，后续按「只读/写」分组收敛 |

### 2.3 技术选型评分卡

| 选型 | 评级 | 理由 |
|---|---|---|
| Electron 35 | ✅ 合适 | 新特性 + 安全补丁，风险低 |
| TS `strict` | ✅ 加分 | 类型护栏到位 |
| esbuild（非 vite/webpack） | ⚠️ 中性偏正 | 快、轻；但无 HMR、worker/asset 需手工 |
| Monaco 0.52 | ⚠️ 强但贵 | 见 A4，集成脆弱需整改 |
| **无框架（vanilla DOM）** | ❌ 高风险 | 6–7 页 + 流式 AI + 编辑器，状态靠 `window.__*` 与手工 DOM，规模化不可持续 |
| electron-builder NSIS+portable | ✅ 合适 | 分发目标匹配 |

---

## 3. 代码质量审查

**结论：B-（中等偏下，技术债偏高）。功能可运行，但可维护性随文件膨胀在恶化。**

### 3.1 发现

| ID | 严重度 | 问题 | 证据 | 建议 |
|---|---|---|---|---|
| Q1 | HIGH | **上帝对象** `editor-manager.ts`（1708 行）含约 40 个方法（编辑器/标签/预览/Mermaid/大纲/导出/AI/版本历史/状态栏） | `editor-manager.ts:167/506/557/643/807/1618/1671` | 拆 `EditorManager` + `MarkdownPreviewService` + `VersionHistoryService` + `EditorAiActions`，经 `bus` 解耦 |
| Q2 | HIGH | `window.__*` 全局耦合（18 全局 / 62 读写） | `files/index.ts:682-691`、`todo/index.ts:58,62`、`project.ts:39`、`knowledge/index.ts:31` | 迁移至 `bus.ts`，删 `globals.d.ts` 可变实例字段 |
| Q3 | HIGH | 渲染端残留 **26 处**原生 `alert/confirm/prompt`，与已存在的 `showModal` 并存；Electron 35 下 `confirm/prompt` 可能被禁 | `files/index.ts:122/144/165`、`file-tree.ts:318-352`、`template-service.ts`、`home/index.ts`、`settings/index.ts:256`、`knowledge/index.ts:568/584` | 全量替换为 `showModal`/`showToast`/`showConfirmDialog` |
| Q4 | MED | **AI 错误信息不统一**：两套平行格式化器 + 多处裸拼 `err.message` | `ai/index.ts:976` vs `editor-manager.ts:772,949`；`ai/index.ts:324/449/1262`；`ai-service.ts:38/55/299` | 抽单一 `formatAiError()` 共享工具，renderer + main 统一调用 |
| Q5 | MED | **无 ESLint/Prettier**，且 strict 下仍有 `any` 逃逸 | 根目录 `ls` 0 命中；`ai-service.ts:40/171/261`、`globals.d.ts:86-87`；`editor-manager.ts:17` 别名导入疑似规避 | 加 ESLint + `@typescript-eslint/no-explicit-any`，清未用导入 |
| Q6 | MED | 构建期**文本补丁** `patch-uiux.mjs` 用 `String.replace` 改写源码（`todo/categories.ts`、`todo/task-list.ts`） | `patch-uiux.mjs` | 将补丁并入正式源码，删脚本 |
| Q7 | LOW | 魔法数字 / 路由硬编码条件 | `ai/index.ts:157 timeout:60000`、`:336 '图片超过 20MB'`、`ai-service.ts:214 max_tokens ?? 4096`；`router.ts:48` | 提 `AI_TIMEOUT_MS` 等常量，路由条件改白名单数组 |
| Q8 | LOW | IPC 包装重复（默认参数 + preload 重复声明） | `ipc-client.ts:47-54`、`preload/index.ts:44-51` | 经代码生成收敛（可接受分层重复） |

### 3.2 技术债待办表（工作量预估）

| 条目 | 严重度 | 预估工作量 |
|---|---|---|
| 拆分 `editor-manager.ts` 上帝对象 | HIGH | 3–5 天 |
| `bus.ts` 消除 `window.__*` 全局耦合 | HIGH | 2–3 天 |
| 替换渲染端全部 `alert/confirm` 为 Modal | HIGH | 1–2 天 |
| 统一 AI 错误格式化 | MED | 0.5 天 |
| 引入 ESLint/Prettier 并消除 `any` | MED | 1 天 |
| 消除 `patch-uiux.mjs` 文本补丁 | MED | 0.5 天 |
| 提取魔法数字 / 路由白名单 | LOW | 0.5 天 |
| 收敛 IPC 包装重复 | LOW | 0.5 天 |

---

## 4. 功能完整性与正确性

**结论：核心 6 页基本落地；知识库「导入」已实现但「检索」是朴素全文注入；v3.0 Agent 工作流未见踪影。**

### 4.1 功能完备性记分卡

| 模块 | 状态 | 证据 |
|---|---|---|
| 1. Home 仪表盘 | **DONE** | `home/index.ts:144-155` 今日/逾期统计，`renderRecentDocs/Projects/AIStatus` 齐全 |
| 2. Project 概览 | **DONE** | `project.ts:169` 报告导出，`renderActivities:133` |
| 3. Files | **DONE** | 文件树 + Monaco 多标签 + Markdown 预览 + 版本历史 + 导出 |
| 4. AI 助手 | **DONE（小缺陷）** | 多供应商、流式、vision 门控、`ai-workflow-panel` |
| 5. Todo 中心 | **PARTIAL** | 分类/优先级/子任务/来源跳转/看板均在，但**子任务完成不回写父任务** |
| 6. Settings | **DONE** | 主题、provider、快捷键 |
| 知识库 | **PARTIAL** | 导入（PDF/TXT/Web/剪贴板）已实现；**AI 检索为朴素全文拼接** |

### 4.2 正确性 / 健壮性发现（按严重度）

| ID | 严重度 | 问题 | 证据 | 建议 |
|---|---|---|---|---|
| F1 | MED | **子任务完成不回写父任务**（rollup 缺失）：`toggleSubtask` 不修改 `task.completed`，首页/统计不把「子任务全完的父任务」计入完成 | `todo/task-list.ts:434-452` | 子任务全 `done` 时 `updateTaskInStore(taskId,{completed:true})`；手动勾父反向置子 |
| F2 | MED | **AI 流式取消 UI 未接线**：preload `chatStream` 返回 `{requestId,cancel()}`，主端监听 `STREAM_CANCEL`→`abort()`，但渲染层丢弃句柄且无「停止」按钮，长响应只能等 60s 超时 | `ai/ai-service.ts:156`、`preload/index.ts:117`、`ai.handlers.ts:62`、`ai/index.ts`（无 stop 按钮） | 捕获句柄，生成中显示停止按钮并调用 `cancel()` |
| F3 | MED | **知识库检索为朴素全文注入**：每条目原样截 6000 字拼进 prompt，无 embedding/向量/关键词打分；条目多时静默撑爆上下文且无相关性过滤 | `ai/index.ts:106-111`、`knowledge-service.ts` | 至少做关键词命中过滤/分块，或接入向量检索（即既有 Roadmap 的「知识库语义检索」） |
| F4 | MED | **关窗不拦截未保存编辑**：两个 `beforeunload` 仅 flush/stopWatch，未设 `returnValue`/`preventDefault`；`confirmCloseDirtyTabs` 只覆盖关标签页 | `files/index.ts:832,876`、`editor-manager.ts:1213` | `beforeunload` 中若 `store.dirtySet.size>0` 则返回提示阻止关闭 |
| F5 | MED | **版本历史无去重**：`CREATE_BACKUP` 每次生成新 id 写 `.bak`，从不比对内容；相同内容连续保存无限堆积 | `fs.handlers.ts:324-357` | 保存前比对上一版哈希，无变化则跳过/合并 |
| F6 | LOW | **无集中 IPC 错误边界**：`ipc-client` 透传无 `try/catch`，未包裹的 IPC 拒绝成 unhandled rejection | `ipc-client.ts` | 加全局 `unhandledrejection` 兜底 toast |
| F7 | LOW | **Monaco 大文件无保护**：整文件 `readFile` 后 `setValue`，无体积阈值/只读/卡顿提示 | `editor-manager.ts` | >2MB 提示并进入只读预览 |

> 正面点：`fs.handlers.ts:20-26` 与图片 20MB 限制（`fs.handlers.ts:463`）对路径穿越/越权做了明确拦截——文件读写安全扎实。

### 4.3 与路线图对比（缺失 / 风险项）

- ✅ 自动更新（`updater-service.ts` + `update.handlers.ts`）
- ✅ AI 图片输入（vision 双保险：`ai/index.ts:86` UI 拦截 + `ai-service.ts:226` 服务端拦截）
- ✅ Mermaid（`renderMermaidBlocks`，`ai/index.ts:239`）
- ✅ 知识库**导入**（PDF/TXT/Web/剪贴板）—— 但**语义检索缺失**（见 F3）
- ⚠️ **v3.0 AI Agent 工作流（自动分析 / 生成计划 / 组织文档）—— 未实现**。grep `agent|workflow` 命中的是全文件级 `format/summary/todo/rewrite` 与「当前文件工作流」，无扫描项目 / 自治计划 / 自动整理文档的 Agent。仍属「planned」路线风险项。

---

## 5. 页面 / 路由 / 状态管理

**结论：路由为纯函数式切换，无 URL/History 集成；跨页状态仍走 `window.__*` 全局；生命周期边界不一致，存在监听泄漏。**

| ID | 严重度 | 问题 | 证据 | 建议 |
|---|---|---|---|---|
| R1 | HIGH | **无 hash/history 路由，无深链/前进后退**：`switchPage(pageId)` 仅 toggle `.active`，grep `hashchange/pushState` 全仓 0 命中；无效 id 静默无操作（无 404 兜底） | `router.ts:22/38-43` | 加 `hashchange` 监听映射 `#/files`→`switchPage`，持久化到 `location.hash` |
| R2 | HIGH | **`knowledge` 页每次导航泄漏监听**：`initKnowledgePage()` 无 guard，`bindEvents()` 对持久静态 DOM `addEventListener`，反复进出堆叠重复处理器 | `knowledge/index.ts:26-35/37-78` | 加 `knowledgeBound` guard 或 `registerPageCleanup` |
| R3 | MED | **重初始化策略脆弱**：`router.ts:48` 仅 `ai/todo/files` 每次刷新，`home/project/knowledge/settings` 不刷；每页各自补 `isBound/initialized` 等 guard | `router.ts:48` | 路由契约化：加显式 `refreshOnVisit` 标志，替代隐式白名单 |
| R4 | MED | **状态碎片化**：`window.__*` 全局 + 各页独立单例（`currentOverview` `project.ts:12`、`chatHistory` `ai/index.ts:23`、`cachedAppVersion` `home/index.ts:16`、`FilesStore`、`todo.store`），无单一 store；`workspaceRoot` 真值仍在全局，存在读取时序脆弱 | `globals.d.ts:28-63`、`files/index.ts:682-691`、`home/index.ts:381-397` | 以 `bus` 事件 / 中央 store 承载 workspace-root，删全局读取 |
| R5 | MED | **跨页复制助手**：`escAttr()`（`project.ts:240`）重复 `utils/escape.ts`；`formatRelativeTime` 在 `home:456` 与 `project:224` 逐字重复；问候语 `app/index.ts:65` 与 `home/index.ts:36` 重复且后者覆盖 | 同上 | 收敛进 `utils/` |

---

## 6. UI / UX 评估

**结论：设计令牌集中、命令面板与快捷键扎实、响应式媒体查询存在；但 CSS 以 22 层版本化热修累积 + `!important` 文件呈现级联债，错误态不一致，Modal 缺无障碍。**

### 6.1 视觉一致性评分卡

| 维度 | 评分 | 证据 |
|---|---|---|
| 设计令牌集中 | 8/10 | `variables.css:16-161` 定义 dark+light、圆角、间距、阴影、字体；但 `components.css:229-250` 硬编码渐变破坏 |
| 暗/亮双主题对等 | 8/10 | `variables.css:113-161` 完整 `[data-theme="light"]` 块 + 组件覆写 |
| 玻璃拟态克制度 | 6/10 | `--glass-blur:16px` 用于浮层，整体克制；`inline-fixes.css` 重复 `backdrop-filter` 有叠糊风险 |
| 级联卫生 | 4/10 | `inline-fixes.css:174-256` ~30 条 `!important`（如 `#page-todo{width:100%!important}`），22 层版本化 CSS 累积 |
| 布局一致性 | 7/10 | sidebar + `.page.active` 挂载模式统一；todo/files/ai 分栏结构分化但共享令牌 |
| 空/加载/错误态 | 5/10 | 空态统一；**错误态碎片化**（见 UX-2） |
| 快捷键 | 8/10 | Ctrl+K 面板 + Ctrl+S/O/N/W + Alt+1-5，捕获阶段接线（`app/index.ts:99-170`） |
| 无障碍 | 4/10 | Modal 无 `aria-modal`/焦点陷阱；`nav-item` 为 `<a href="#">` 无 `role` |

### 6.2 发现

| ID | 严重度 | 问题 | 证据 | 建议 |
|---|---|---|---|---|
| UX1 | MED | **Modal 无 Escape 关闭 / 无 ARIA**：仅 overlay 点击 + 关闭按钮委托，无 `keydown` Escape，无 `role="dialog"`/`aria-modal` | `components/modal.ts:24-103`（对比 `app/index.ts:630` 搜索浮层正确绑定 Escape） | 加 Escape + 焦点陷阱 |
| UX2 | MED | **错误态呈现不一致**：home 记日志+偶发错误卡；project 写纯文本到加载区；ai 用系统气泡；settings 用 `setStatus(...,'error')` | `home/index.ts:264`、`project.ts:61`、`settings` | 抽单一 `showError()` 组件，基于既有 `.nova-state-card.is-error` |
| UX3 | MED | **CSS 22 层版本化 + `!important` 文件**：`index.css:20-35` 顺序 import `nova-ui-refresh.css` + `nova-v2911…v2916-*.css`；`inline-fixes.css` ~30 条 `!important` | `index.css`、`inline-fixes.css:174-256` | 合并 `nova-v29xx` 层入 `nova-ui-refresh.css`，消除 `!important`，修特异性 |
| UX4 | LOW | **硬编码渐变绕过令牌**：`components.css:229-250` 硬编码 `#6EB5FF,#4B8BEE` 等，重复 `--nova-burst:#F5A623`（`variables.css:51`）第二停 | `components.css:239` | 令牌化渐变，亮色对等自动 |
| UX5 | LOW | **主壳未响应式折叠**：媒体查询存在，但 `.sidebar`（固定 ~240px）+ `.main-content` 无窄窗 `@media` 堆叠/隐藏，仅手动 `.collapsed`（`layout.css:357`） | `components.css:685/812/1045`、`layout.css:357` | 窄窗下 sidebar 自动折叠 |

> 修正工作记忆：实测 `index.html` **不含** `<style>` 内联样式（文件止于 `index.html:1042`），「内联修复」已抽离为独立 `inline-fixes.css`；遗留臭味在该 `!important` 文件，而非 HTML 内联。

---

## 7. 综合发现矩阵（跨维度汇总）

| 编号 | 维度 | 严重度 | 一句话问题 |
|---|---|---|---|
| A1 / Q1 | 架构/质量 | **HIGH** | `editor-manager.ts` 1708 行上帝对象 |
| A2 / Q2 / R4 | 架构/质量/路由 | **HIGH** | `window.__*` 18 全局 / 62 读写，事件总线半途而废 |
| Q3 | 质量 | **HIGH** | 渲染端 26 处 `alert/confirm`，Electron 35 下或被禁 |
| R1 | 路由 | **HIGH** | 无 hash 路由 / 深链 / 前进后退 |
| R2 | 路由 | **HIGH** | `knowledge` 页每次导航泄漏监听 |
| F1 | 功能 | MED | 子任务完成不回写父任务 |
| F2 | 功能 | MED | AI 流式取消 UI 未接线 |
| F3 | 功能 | MED | 知识库检索为朴素全文（无语义/关键词） |
| F4 | 功能 | MED | 关窗不拦截未保存编辑 |
| F5 | 功能 | MED | 版本历史无去重 |
| A3 | 架构 | MED | IPC 客户端抽象被 50+ 处绕过 |
| A4 | 架构 | MED | Monaco AMD 脆弱加载，worker 未配 |
| A5 | 架构 | MED | 导出逻辑跨进程重复 |
| Q4 | 质量 | MED | AI 错误文案不统一 |
| Q5 | 质量 | MED | 零 ESLint + `any` 逃逸 |
| Q6 | 质量 | MED | `patch-uiux.mjs` 文本补丁改源码 |
| R3 | 路由 | MED | 重初始化隐式白名单脆弱 |
| R5 | 路由 | MED | 跨页复制助手函数 |
| UX1 | UI/UX | MED | Modal 无 Escape/ARIA |
| UX2 | UI/UX | MED | 错误态呈现不一致 |
| UX3 | UI/UX | MED | CSS 22 层版本化 + `!important` 级联债 |
| F6/F7 | 功能 | LOW | 无集中 IPC 错误边界 / 大文件无保护 |
| Q7/Q8 | 质量 | LOW | 魔法数字 / IPC 包装重复 |
| A6/A7 | 架构 | LOW | 文档漂移 / preload 暴露面 |
| UX4/UX5 | UI/UX | LOW | 硬编码渐变 / 主壳未响应式折叠 |

---

## 8. 后续开发方向建议（核心裁决）

### 8.1 裁决：优先「已有功能优化迭代」，性能开发作为子集

**不启动独立性能专项**。依据：

1. **无性能危机证据**：四路审计未产出任何「运行时卡顿 / 内存泄漏 / 大重绘」的实测信号。零星性能点（Monaco worker、大文件冻结、CSS 膨胀）本质是技术债，归到「优化迭代」自然消化。
2. **有正确性危机**：F1–F5 是真实数据错误 / 用户失控（子任务状态错、AI 不可取消、关窗丢未保存、版本冗余），优先级高于任何性能优化。
3. **有可维护性危机**：1708 行上帝文件 + 62 处全局耦合 + 零 Lint，继续加功能会指数级放大成本。先做去债，后续加功能才快。
4. **性能专项现在立项 = 过早优化**，违反「先正确、再快」的工程常识。

### 8.2 优先级路线图（P0 → P3）

#### P0 — 正确性止血（1–1.5 周，必须最先做）
| 任务 | 对应发现 | 工作量 | 收益 |
|---|---|---|---|
| 子任务完成回写父任务 | F1 | 0.5 天 | 修复数据逻辑错误 |
| AI 流式「停止」按钮接线 | F2 | 0.5 天 | 用户可控性 |
| 关窗拦截未保存（`beforeunload`） | F4 | 0.5 天 | 防数据丢失 |
| 版本历史内容去重 | F5 | 0.5 天 | 防存储膨胀 |
| 渲染端 `alert/confirm` → Modal（26 处） | Q3 | 1–2 天 | 兼容 Electron 35 + 一致性 |

#### P1 — 架构去债（2–3 周，与 P0 可部分并行）
| 任务 | 对应发现 | 工作量 | 收益 |
|---|---|---|---|
| 拆分 `editor-manager.ts`（状态/视图/交互/AI 分层） | A1/Q1 | 3–5 天 | 解除最大瓶颈，可单测 |
| `bus.ts` 全量替换 `window.__*`（冻结 globals.d.ts） | A2/Q2/R4 | 2–3 天 | 解除耦合，消除时序脆弱 |
| 统一 IPC 出口（页面去 `window.electronAPI` 直连） | A3 | 1 天 | 类型护栏生效 |
| 接入 ESLint/Prettier + 消除 `any` | Q5 | 1 天 | 防回归机制 |
| 消除 `patch-uiux.mjs` 文本补丁 | Q6 | 0.5 天 | 移除脆弱热修 |

#### P2 — 体验与健壮性打磨（1–1.5 周）
| 任务 | 对应发现 | 工作量 |
|---|---|---|
| hash 路由 + 未知路由兜底 + `refreshOnVisit` 契约 | R1/R3 | 1 天 |
| `knowledge` 监听泄漏修复 + 页面清理契约 | R2 | 0.5 天 |
| Modal Escape/焦点陷阱 + 共享 `showError()` | UX1/UX2 | 1 天 |
| 统一 AI 错误格式化器 | Q4 | 0.5 天 |
| 集中 IPC 错误边界（unhandledrejection 兜底） | F6 | 0.5 天 |
| Monaco worker 配置 + 大文件只读保护（顺带解决真实性能点） | A4/F7 | 1 天 |

#### P3 — 视觉一致性收敛（0.5–1 周，可穿插）
| 任务 | 对应发现 | 工作量 |
|---|---|---|
| 合并 `nova-v29xx` CSS 层、消除 `!important` | UX3 | 1 天 |
| 令牌化硬编码渐变 | UX4 | 0.5 天 |
| 主壳窄窗响应式折叠 | UX5 | 0.5 天 |
| 跨页助手函数收敛 `utils/` | R5 | 0.5 天 |

### 8.3 明确「暂不做」（避免资源错配）
- ❌ **v3.0 全自主 Agent 工作流**：继续延后，先做半自动 MVP 验证频率与价值（与既有 Roadmap 决策一致）。
- ❌ **引入 React/Vue 重写渲染层**：代价巨大、收益不确定；先用「拆上帝文件 + bus 迁移」把 vanilla DOM 拉回可控区间，必要时再评估。
- ❌ **独立性能专项 / 打包体积深度优化**：在 P1/P2 顺手解决 Monaco worker、大文件、CSS 收敛即可；无确凿瓶颈前不单列。
- ❌ **知识库语义检索（向量库 / 本地嵌入）**：属战略升级（既有阶段 B），在 P0–P3 完成、渲染端可控后再启动，避免在未去债的代码上叠加重架构。

### 8.4 预期收益
- 正确性 bug 清零（F1–F5）→ 用户数据安全与可控性达标。
- `editor-manager.ts` 拆分 + `bus` 迁移 → 新增功能的平均改动能耗下降、可测试性提升。
- ESLint + 去 `any` + 删文本补丁 → 回归率下降，PR 评审成本下降。
- 路由/Modal/错误态统一 → 体验一致性达产品级，为 v3.0 打底。
- 性能点（Monaco worker、大文件、CSS）作为债的副产品被顺手消化，无需独立立项。

---

## 9. 附录：技术债清单（按严重度）

| 条目 | 严重度 | 预估 | 归属 Phase |
|---|---|---|---|
| 拆分 `editor-manager.ts` | HIGH | 3–5 天 | P1 |
| `bus.ts` 消除 `window.__*` | HIGH | 2–3 天 | P1 |
| 替换渲染端 `alert/confirm` | HIGH | 1–2 天 | P0 |
| 子任务回写父任务 | MED | 0.5 天 | P0 |
| AI 流式取消 UI 接线 | MED | 0.5 天 | P0 |
| 关窗拦截未保存 | MED | 0.5 天 | P0 |
| 版本历史去重 | MED | 0.5 天 | P0 |
| hash 路由 + 兜底 | MED | 1 天 | P2 |
| `knowledge` 监听泄漏 | MED | 0.5 天 | P2 |
| Modal 无障碍 + 错误态统一 | MED | 1 天 | P2 |
| 统一 AI 错误格式化 | MED | 0.5 天 | P2 |
| IPC 出口统一 | MED | 1 天 | P1 |
| Monaco worker + 大文件保护 | MED | 1 天 | P2 |
| 引入 ESLint/Prettier | MED | 1 天 | P1 |
| 消除 `patch-uiux.mjs` | MED | 0.5 天 | P1 |
| 集中 IPC 错误边界 | LOW | 0.5 天 | P2 |
| 魔法数字 / 路由白名单 | LOW | 0.5 天 | P3 |
| CSS 合并 + 去 `!important` | LOW | 1 天 | P3 |
| 令牌化渐变 | LOW | 0.5 天 | P3 |
| 主壳响应式折叠 | LOW | 0.5 天 | P3 |
| 跨页助手收敛 | LOW | 0.5 天 | P3 |
| IPC 包装收敛 | LOW | 0.5 天 | P3 |

---

*本报告所有结论均基于 `src/` 实测代码与脚本量化验证，证据带文件:行号，可审计、可复现。*
