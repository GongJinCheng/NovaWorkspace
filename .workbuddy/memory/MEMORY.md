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
