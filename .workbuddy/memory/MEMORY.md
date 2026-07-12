# Nova Workspace - 项目概览记忆

> 最后更新：2026-06-07

## 项目基本信息

- **名称**: Nova - All-in-one productivity workspace
- **版本**: v2.9.2
- **作者**: GongJinCheng
- **仓库**: GitHub GongJinCheng/NovaWorkspace
- **定位**: 本地优先的 AI 深度工作台

## 技术栈

- **桌面框架**: Electron 35
- **语言**: TypeScript 5.7 (strict mode)
- **构建**: esbuild (三个入口: main/preload/renderer)
- **编辑器**: Monaco Editor 0.52
- **样式**: 纯 CSS + CSS Variables (无框架)
- **AI**: OpenAI Compatible Chat Completions API (流式+非流式)
- **IPC**: contextBridge + ipcRenderer/ipcMain
- **包管理**: npm
- **打包**: electron-builder (Windows NSIS + portable)

## 项目结构 (src/ 下 62 个 TS 文件)

```
src/
├── main/           # Electron 主进程
│   ├── bootstrap/   # app-lifecycle.ts (应用生命周期)
│   ├── ipc/         # 7 个 handler: window, fs, todo, recent, workspace, update, ai
│   ├── services/    # ai-service, export-service, settings-store, todo-store, updater-service, workspace-store
│   ├── utils/       # logger, paths
│   └── windows/     # main-window
├── preload/         # contextBridge API 暴露
├── renderer/        # 渲染层 (无框架，纯 DOM 操作)
│   ├── app/         # index (入口+全局搜索), router (页面路由), theme
│   ├── components/  # modal
│   ├── pages/       # home, project, files (5 文件), ai (2 文件), todo (7 文件), settings
│   ├── services/    # ipc-client, template-service, export-service, workspace-context
│   ├── styles/      # variables, base, layout, components, index + pages/*.css
│   ├── utils/       # performance
│   └── widgets/     # ring-chart, toast
└── shared/          # 跨进程共享
    ├── constants/   # ipc-channels, app, ai-providers
    ├── schemas/     # todo.schema
    ├── types/       # todo, file, ai, workspace, ipc, update, index
    └── utils/       # id, logger, ai-capabilities
```

## 六大页面模块

| 页面 | 路由 ID | 功能 |
|------|---------|------|
| 首页工作台 | home | 今日待办、逾期任务、最近文档、最近项目、AI 状态 |
| 项目概览 | project | 项目信息、文档/Todo 统计、最近活动、项目级 AI、报告导出 |
| 文件管理 | files | 文件树、Monaco 编辑器、多标签、Markdown 预览、版本历史、文档导出 |
| AI 助手 | ai | OpenAI Compatible API、多 Provider、流式对话、图片输入、工具面板 |
| 待办中心 | todo | 项目级 Todo、分类、优先级、子任务、来源文档跳转、时间轴看板 |
| 设置 | settings | 主题切换、AI Provider 配置、快捷键说明 |

## 核心设计决策

1. **本地优先**: 数据保存在本地 .nova/ 目录，不强制账号体系
2. **项目级数据隔离**: 每个 .nova/ 独立，Todo 按项目隔离
3. **AI 三级上下文**: 普通聊天 / 当前文档 AI / 项目级 AI
4. **无框架渲染层**: 纯 DOM + CSS，无 React/Vue
5. **Electron 35 兼容**: 不使用 window.prompt()，统一自定义 Modal
6. **模型能力表**: v2.9.2 引入统一模型能力配置 (图片输入/文件输入/思考过程/工具调用)

## 数据存储位置

| 数据 | 位置 |
|------|------|
| Markdown 文档 | 当前工作区文件夹 |
| 项目信息 | .nova/project.json |
| 项目待办 | .nova/todos.json |
| 项目活动 | .nova/activity.json |
| 文档历史版本 | .nova/history/ |
| 应用配置 / AI Provider | Electron userData 目录 |

## 关键快捷键

- Ctrl+K: 全局命令面板 (搜索命令/文件/文档内容/Todo/模板)
- Ctrl+P: 快速打开文件
- Ctrl+S: 保存当前文件
- Ctrl+O: 打开工作区
- Ctrl+N: 新建文档
- Ctrl+W: 关闭当前标签页

## 版本演进 (v2.1.0 → v2.9.2)

- v2.1.x: AI 工作流闭环 + 兼容性修复
- v2.2.x: 首页工作台
- v2.3.x: 文档安全 (自动保存/版本历史)
- v2.4.0: 全局搜索/命令面板
- v2.5.0: 项目级 Todo 隔离
- v2.6.0: 项目概览页
- v2.7.x: 模板系统 + AI 模板生成
- v2.8.x: 导出系统 (HTML/PDF)
- v2.9.0: 自动更新 + AI 图片输入 + Mermaid
- v2.9.1: 待办时间轴 + 图片能力校验
- v2.9.2: 模型能力表 + 图片发送校验

## Roadmap

- v2.9.0+: 知识库导入 (PDF/TXT/网页/剪贴板)
- v3.0.0: AI Agent 工作流 (自动分析/生成计划/整理文档)

## 已定方向 (2026-07-12) — 升级为主，战略性升级打底，Agent 延后

> 经架构师技术盘点(健康度7.5/10) + 产品经理战略分析，主理人拍板。

- **总体结论**: 混合策略 = 「升级现有功能」为主轴，嵌入两项战略性升级，v3.0 Agent 工作流延后至下个里程碑做 MVP 验证。
- **阶段 A (约2周, P0)**: 解 Monaco 打包阻断风险 + 拆分 editor-manager.ts 巨文件；清 alert()/confirm() 残留改统一 Modal；统一 AI 错误文案；window.__* 全局耦合迁移到事件总线(bus)。
- **阶段 B (约3-4周, P0战略)**: 知识库本地语义检索 (默认本地嵌入模型离线，在线 Embeddings API 作可选开关)。把已有导入管线变成"可对话知识资产"，是 Nova 差异化护城河。本地嵌入后实现显著变重(模型选型+量化/onnxruntime 打包/切块索引/向量ANN检索/降级/在线开关)，独立约2.5-3.5周。
- **整体核心交付约4-5周** (阶段A 1周 + 阶段B 3-4周)；Agent 半自动 MVP 延后不在本期。
- **打包风险新增**: 本地嵌入模型文件需随包发布，与 Monaco 打包同属"资源拷贝阻断点"，本期共两个，建议阶段A一并验证。
- **语义检索实现要点(待实施)**: 本地嵌入模型候选 m3e-base / bge-small-zh (int8 约 20-90MB) + onnxruntime，WASM 单线程压内存防弱机 OOM；弱机降级四层: ①后台增量索引不阻塞UI ②算力超时(加载>15s或单批超阈)回退关键词+轻提示 ③轻量模式开关(弱机/大库可关语义) ④在线 API 逃生舱。
- **阶段B任务卡已拆(S0-S6, 架构师直发)**: S0 嵌入模型+onnxruntime 打包进产物(阶段A, 与Monaco同类的资源拷贝阻断点) / S1 模型选型与中文召回验收 / S2 knowledge-embed-service / S3 向量存储与增量索引 / S4 语义检索替换(向量+关键词混合, 接入既有knowledgeContext管线) / S5 四层降级通道 / S6 在线嵌入API可选开关。启动阶段B时由架构师复用作排期依据。
- **阶段 C (延后, 验证后)**: v3.0 Agent 工作流先做"半自动 MVP"(用户触发+步骤透明+可中断)，补齐工具注册表/沙箱/运行态 UI，先验证频率与价值再全自主。
- **关键决策点(待拍板)**: 语义检索默认本地vs在线; Agent 本周期是否启动; 文件拆分人力投入; 离线语义检索算力门槛可接受度; 首页升级优先级是否高于知识库。
- **竞品卡位**: 「你的本地 AI 知识工作台」= 数据主权(本地优先) + 单面集成(文档/项目/待办/AI/知识一个连贯界面) + 设备端语义 grounding(不依赖云)。填补 Cursor/Notion AI/Obsidian插件/LM Studio 交集的空白带。

## 开发命令

```bash
npm run dev          # 开发运行 (build + start)
npm run build        # 构建 (main + preload + renderer)
npm run typecheck    # 类型检查
npm run start        # 启动 Electron
npm run package      # 打包 Windows 安装包
npm run publish:win  # 发布到 GitHub Release
```

## 注意事项

- 渲染层无框架，所有 DOM 操作手写，全局状态通过 window 对象传递 (如 __editorManager, __fileTree, __filesStore)
- IPC 通道常量集中在 src/shared/constants/ipc-channels.ts
- preload 暴露的 API 类型定义在 src/shared/types/ipc.ts
- AI 流式通信使用 ipcRenderer.send/on 模式 (非 invoke)
- index.html 中内联了大量 CSS 修复 (特别是 todo 布局)
- esbuild 使用路径别名 @shared/*, @main/*, @renderer/*, @preload/*
