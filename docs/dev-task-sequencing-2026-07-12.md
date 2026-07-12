# Nova 开发任务排序表（基于五维分析报告）

> 生成日期：2026-07-12 ｜ 依据：`docs/codebase-analysis-2026-07-12.md`
> 总预估工时：**约 20.5 人日**（单人并行含联调约 4–5 周）
> 紧急程度：🔴 高（数据正确/安全，用户已受影响）｜🟡 中（架构/体验债，影响迭代速度）｜🟢 低（视觉打磨）
> 同阶段内任务在无依赖冲突时可并行；下表「序号」保证前置任务一律在前。

| 序号 | 任务名称 | 紧急程度 | 所属阶段 | 任务描述 | 依赖任务 | 预估工时 | 负责模块 |
|---|---|---|---|---|---|---|---|
| 1 | 子任务完成回写父任务 | 🔴 高 | P0 正确性 | `toggleSubtask` 在子任务全部 done 时回写 `task.completed`；手动勾父反向置子任务；首页/统计纳入「子任务全完的父任务」 | 无 | 0.5d | `todo/task-list.ts` |
| 2 | AI 流式「停止」按钮接线 | 🔴 高 | P0 正确性 | 捕获 `chatStream` 返回的 `{requestId,cancel()}` 句柄，生成态显示停止按钮并调用取消，避免只能等 60s 超时 | 无 | 0.5d | `pages/ai/*` + `preload` |
| 3 | 关窗拦截未保存编辑 | 🔴 高 | P0 正确性 | `beforeunload` 中若 `store.dirtySet.size>0` 则 `returnValue` 阻止关闭；覆盖「关窗口/退出」场景 | 无 | 0.5d | `pages/files/index.ts` |
| 4 | 版本历史内容去重 | 🔴 高 | P0 正确性 | `CREATE_BACKUP` 保存前比对上一版内容哈希，无变化则跳过/合并，防相同内容无限堆积 | 无 | 0.5d | `main/ipc/fs.handlers.ts` |
| 5 | 渲染端 alert/confirm → Modal | 🔴 高 | P0 正确性 | 26 处原生 `alert/confirm/prompt` 全量替换为 `showModal/showConfirmDialog/showToast`（Electron 35 兼容 + 一致性） | 无（Modal 组件已存在） | 1–2d | `renderer` 多页（files/home/project/knowledge/settings/template） |
| 6 | 引入 ESLint/Prettier + 消除 any | 🟡 中 | P1 架构 | 加 `@typescript-eslint`，开 `no-explicit-any`，清未用导入；使后续新代码受约束 | 无（建议最早做） | 1d | 工程基建 |
| 7 | 消除 patch-uiux.mjs 文本补丁 | 🟡 中 | P1 架构 | 将脚本内 `String.replace` 改写的源码（todo/categories、task-list）并入正式源码，删除该脚本 | 6 | 0.5d | 工程基建 |
| 8 | 拆分 editor-manager.ts 上帝对象 | 🟡 中 | P1 架构 | 拆为 `EditorManager`(标签/生命周期)+`MarkdownPreviewService`+`VersionHistoryService`+`EditorAiActions`，经 `bus` 解耦 | 5、6 | 3–5d | `pages/files/editor-manager.ts` |
| 9 | bus.ts 全量替换 window.__* 全局耦合 | 🟡 中 | P1 架构 | 冻结 `globals.d.ts` 新增；按 `BusEvents` 逐项替换 18 全局/62 读写跨页调用，删全局声明 | 8（先减编辑器消费者） | 2–3d | 架构/多页 |
| 10 | 统一 IPC 出口（去直连） | 🟡 中 | P1 架构 | 页面内移除 `window.electronAPI` 直连（约 50+ 处），统一经 `ipcClient` 类型安全出口 | 9 | 1d | `renderer` 多页 |
| 11 | hash 路由 + 未知路由兜底 | 🟡 中 | P2 体验 | 加 `hashchange` 监听映射 `#/xxx`→`switchPage` 持久化；无效 id 走兜底页；定义 `refreshOnVisit` 契约替代隐式白名单 | 无 | 1d | `app/router.ts` |
| 12 | knowledge 监听泄漏修复 | 🟡 中 | P2 体验 | `initKnowledgePage` 加 `knowledgeBound` guard / `registerPageCleanup`，防反复进出堆叠重复监听器 | 11（路由契约就位） | 0.5d | `pages/knowledge/index.ts` |
| 13 | Modal 无障碍 + 共享 showError() | 🟡 中 | P2 体验 | Modal 加 Escape 关闭 + 焦点陷阱 + `role/aria-modal`；抽单一 `showError()` 组件基于 `.nova-state-card.is-error` | 5 | 1d | `components/modal.ts` + 各页 |
| 14 | 统一 AI 错误格式化器 | 🟡 中 | P2 体验 | 抽单一 `formatAiError()` 共享工具，renderer 与 main 统一调用，消除两套平行格式化器 | 13（showError 就位） | 0.5d | `pages/ai`、`main/ai-service` |
| 15 | 集中 IPC 错误边界 | 🟡 中 | P2 体验 | 加全局 `unhandledrejection` 兜底 toast，防未包裹的 IPC 拒绝成静默异常 | 10 | 0.5d | `ipc-client.ts` + 基建 |
| 16 | Monaco worker + 大文件保护 | 🟡 中 | P2 性能* | 改用 monaco ESM 并显式配 `getWorker`；>2MB 文件提示并进入只读预览，防渲染线程冻结 | 8（editor 拆分后接入更顺） | 1d | `editor-manager` / `main` |
| 17 | CSS 合并去 !important | 🟢 低 | P3 视觉 | 合并 `nova-v29xx` 层入 `nova-ui-refresh.css`，消除 `inline-fixes.css` 约 30 条 `!important`（修特异性而非硬压） | 无 | 1d | `styles/*.css` |
| 18 | 令牌化硬编码渐变 | 🟢 低 | P3 视觉 | `components.css` 硬编码渐变改为引用 `--nova-burst` 等令牌，亮色对等自动 | 17 | 0.5d | `styles/components.css` |
| 19 | 主壳窄窗响应式折叠 | 🟢 低 | P3 视觉 | `.sidebar`+`.main-content` 加窄窗 `@media` 自动折叠/隐藏（替代仅手动 `.collapsed`） | 无 | 0.5d | `styles/layout.css` |
| 20 | 跨页助手函数收敛 | 🟢 低 | P3 重构 | `escAttr/formatRelativeTime/问候语` 等重复实现收敛进 `utils/` | 无 | 0.5d | `utils/escape.ts` 等 |
| 21 | IPC 包装重复收敛 | 🟢 低 | P3 重构 | `ipc-client.ts` 默认参数 + `preload` 重复声明经代码生成/收敛 | 10 | 0.5d | `ipc-client.ts`、`preload` |
| 22 | 提取魔法数字/路由白名单常量 | 🟢 低 | P3 重构 | `AI_TIMEOUT_MS`、图片 20MB、路由白名单数组等提为常量 | 6 | 0.5d | 多文件 |

> *任务 16 标注「性能」但本质是技术债修复，顺手解决真实性能点，不单列性能专项（见报告 §8.1 裁决）。

## 执行顺序速览（按阶段）
- **P0 正确性止血（🔴 高，约 3.5d）**：1 → 2 → 3 → 4 → 5（可并行，1–4 互不依赖）
- **P1 架构去债（🟡 中，约 9d）**：6 → 7 → 8 → 9 → 10（6 最早铺路，8/9 串行减迁移面）
- **P2 体验健壮性（🟡 中，约 4.5d）**：11 → 12 → 13 → 14 → 15 → 16（12 依赖 11，14 依赖 13，16 依赖 8）
- **P3 视觉收敛（🟢 低，约 3.5d）**：17 → 18 → 19 → 20 → 21 → 22（18 依赖 17，21 依赖 10）

## 关键依赖链（不可乱序）
- `5 → 8`：先替换原生对话框，再拆编辑器时新代码直接走 Modal
- `6 → 7/8/22`：ESLint 先就位，后续改写代码即合规
- `8 → 9`：先拆 editor 减少 `window.__*` 消费者，bus 迁移面更小
- `9 → 10`：全局耦合消除后，IPC 收敛同步进行
- `11 → 12`：路由契约先定义，页面清理 guard 才有依据
- `13 → 14`：`showError` 先有，AI 错误统一器才能接上

## 明确不做（避免资源错配）
- ❌ v3.0 全自主 Agent 工作流（继续延后做半自动 MVP）
- ❌ 引入 React/Vue 重写渲染层（先用拆文件+bus 拉回可控区间）
- ❌ 独立性能专项 / 打包深度优化（真实性能点已在任务 16 顺手消化）
- ❌ 知识库语义检索（向量库/本地嵌入，阶段 B，待 P0–P3 完成后再启）
