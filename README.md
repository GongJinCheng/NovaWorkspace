# Nova Workspace

> 一个本地优先的 AI 深度工作台，集成 Markdown 文档、AI 助手、知识库、项目待办、版本历史、项目概览、模板系统、导出系统和全局命令面板。

[![Electron](https://img.shields.io/badge/Electron-35-47848f?logo=electron)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![esbuild](https://img.shields.io/badge/esbuild-0.24-ffcf00?logo=esbuild)](https://esbuild.github.io/)
[![Version](https://img.shields.io/badge/version-2.9.3-0066FF)](https://github.com/GongJinCheng/NovaWorkspace/releases)

---

## Demo

https://github.com/user-attachments/assets/27173837-4057-4099-97b0-f92940fdeb9b

A product showcase built with [HyperFrames](https://hyperframes.heygen.com/), featuring project workspace, Markdown editing, AI document assistant, AI-generated todos, project dashboard, templates, export workflow, and document version safety.

> Run `cd NovaShowcase && npm run dev` to preview, or `npm run render` to regenerate the MP4.

---

## 核心理念

Nova 的核心使用方式是：

```
打开一个本地文件夹
→ 作为一个项目工作区
→ 编写 Markdown 文档
→ 导入资料到知识库，AI 自动总结
→ 使用 AI 分析和生成内容
→ 一键提取待办
→ 在首页和项目概览中持续推进
→ 通过版本历史保护内容
→ 导出文档或项目报告
```

每个工作区都是一个独立项目。Nova 会在项目目录下创建 `.nova` 目录，用于保存项目元信息、待办数据、知识库、版本历史和活动记录。

```
你的项目/
├── README.md
├── 产品方案.md
├── 会议纪要.md
├── 开发计划.md
└── .nova/
    ├── project.json
    ├── todos.json
    ├── activity.json
    ├── conversations.json
    ├── knowledge/
    │   ├── index.json
    │   └── *.txt
    └── history/
```

---

## 功能模块

| 页面 / 模块 | 功能 |
|---|---|
| **首页工作台** | 今日待办、逾期任务、最近文档、最近项目、AI 状态、快捷入口 |
| **项目概览** | 项目信息、文档统计、Todo 统计、最近活动、项目级 AI、项目报告导出 |
| **文件管理** | 文件树、Monaco 编辑器、多标签、Markdown 预览、自动保存、版本历史、文档导出 |
| **AI 助手** | OpenAI Compatible API、多 Provider、流式对话、国产模型兼容、连接测试 |
| **知识库** | PDF 导入、网页摘录、剪贴板文本导入、TXT/MD 导入、AI 总结、资料管理 |
| **待办中心** | 项目级 Todo、分类、优先级、截止时间、子任务、时间轴看板、分类看板 |
| **模板系统** | PRD、会议纪要、技术方案、周报、复盘等内置模板，支持 AI 填充 |
| **导出系统** | 当前文档导出 HTML / PDF，项目报告导出 Markdown / PDF |
| **命令面板** | `Ctrl+K` 搜索命令、AI 操作、模板、Todo、文件和文档内容 |
| **快速打开** | `Ctrl+P` 快速搜索并打开当前工作区文件 |
| **设置** | 主题切换、AI Provider 配置、快捷键说明 |

---

## 主要能力

### 本地优先工作区

- 打开本地文件夹作为项目工作区
- Markdown 文件保持普通文件格式
- 项目数据保存在当前工作区 `.nova` 目录中
- 支持 Git / 云盘 / 手动复制迁移
- 不强制账号体系，不锁死用户数据

### 知识库

- 四种导入方式：PDF 文件、网页摘录、剪贴板文本、TXT/MD 文件
- AI 一键生成摘要，自动保存到资料卡片
- 每个工作区独立存储，不跨项目混淆
- 资料存放在 `.nova/knowledge/` 目录，随项目迁移

### Markdown + AI 工作流

- 总结当前文档
- 生成文档大纲
- 改写选中文本
- 问当前文档
- 根据当前文档生成待办
- 将 AI 输出插入当前文档
- AI 修改前自动创建历史备份

### 项目级 Todo

- 每个工作区拥有独立 `.nova/todos.json`
- 项目 A 的任务不会出现在项目 B
- AI 生成的任务自动写入当前项目
- Todo 支持来源文档记录，可返回上下文

### 文档安全

- 自动保存
- 保存状态提示
- 手动保存版本
- AI 改写 / 插入前自动备份
- 历史版本预览、恢复、删除

### 模板与 AI 生成

内置模板包括：

- 空白文档
- 产品需求文档 PRD
- 会议纪要
- 技术方案
- 开发计划
- Bug 记录
- 周报
- 项目复盘
- 学习笔记
- AI Prompt

创建方式支持：

- 仅创建模板结构
- 使用 AI 根据主题填充完整 Markdown 文档

### 导出系统

支持：

- 当前 Markdown 导出 HTML
- 当前 Markdown 导出 PDF
- 项目报告导出 Markdown
- 项目报告导出 PDF

PDF 导出使用 Electron 原生 `printToPDF`，不额外引入重型浏览器依赖。

---

## 技术栈

- **桌面框架**：Electron 35
- **语言**：TypeScript 5.7
- **构建**：esbuild
- **编辑器**：Monaco Editor
- **样式**：纯 CSS + CSS Variables
- **IPC**：Electron contextBridge + ipcRenderer / ipcMain
- **AI 接入**：OpenAI Compatible Chat Completions API
- **PDF 解析**：pdf-parse

---

## 项目结构

```
NovaWorkspace/
├── src/
│   ├── main/                 # Electron 主进程
│   │   ├── bootstrap/        # 应用生命周期
│   │   ├── ipc/              # IPC handlers
│   │   ├── services/         # 主进程服务：AI、设置、Todo、知识库、导出、工作区
│   │   ├── utils/            # 主进程工具
│   │   └── windows/          # 窗口管理
│   ├── preload/              # contextBridge API
│   ├── renderer/             # 渲染层
│   │   ├── app/              # 入口、路由、主题
│   │   ├── components/       # 通用 UI 组件
│   │   ├── pages/            # home / files / ai / todo / knowledge / settings / project
│   │   ├── services/         # IPC client、模板、导出、工作区上下文
│   │   ├── styles/           # CSS 设计系统
│   │   ├── utils/            # 渲染层工具
│   │   └── widgets/          # 可复用小组件
│   └── shared/               # 共享类型、常量、schema、工具
├── assets/                   # 图标资源
├── docs/
│   └── releases/             # 各版本 Release Notes
├── esbuild.*.mjs             # 构建脚本
├── index.html                # 入口 HTML
└── package.json
```

---

## 快速开始

```bash
# 安装依赖
npm install

# 开发运行
npm run dev

# 类型检查
npm run typecheck

# 构建
npm run build

# 打包 Windows 安装包
npm run package
```

如果 Electron 下载较慢，可以设置镜像：

```bash
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm run package
```

打包产物会生成在：

```
release/
```

---

## AI 配置说明

Nova 默认不内置模型服务，需要用户自行配置 API。

进入：

```
设置 → AI Provider
```

填写：

```
Provider 名称
Base URL
API Key
模型名称
```

示例：

```
Provider: DeepSeek
Base URL: https://api.deepseek.com/v1
Model: deepseek-chat
```

Nova 会调用 OpenAI Compatible Chat Completions 接口。Base URL 可以填写 `/v1`，也可以填写完整 `/v1/chat/completions`，应用会自动兼容处理。

---

## 数据存储说明

| 数据 | 位置 |
|---|---|
| Markdown 文档 | 当前工作区文件夹 |
| 项目信息 | `.nova/project.json` |
| 项目待办 | `.nova/todos.json` |
| 项目活动 | `.nova/activity.json` |
| 知识库资料 | `.nova/knowledge/` |
| 对话历史 | `.nova/conversations.json` |
| 文档历史版本 | `.nova/history/` |
| 应用配置 / AI Provider | Electron userData 目录 |

---

## 快捷键

| 快捷键 | 功能 |
|---|---|
| `Ctrl + P` | 快速打开文件 |
| `Ctrl + K` | 全局命令面板 |
| `Ctrl + S` | 保存当前文件 |
| `Ctrl + O` | 打开工作区 |
| `Ctrl + N` | 新建文档 |
| `Ctrl + W` | 关闭当前标签页 |

简单理解：

```
Ctrl+P = 找文件
Ctrl+K = 找功能 / 做事情
```

---

## 当前版本

### v2.9.3 — 知识库

- PDF 导入（pdf-parse 解析文本）
- 网页摘录导入（Electron net.fetch 抓取）
- 剪贴板文本导入
- TXT / Markdown 文件导入
- 知识库资料 CRUD 管理
- AI 一键总结资料，摘要自动保存
- 知识库按工作区隔离，数据存储在 `.nova/knowledge/`

### v2.8.x — 编辑器体验优化

- Mermaid 图表渲染支持
- 图片拖拽粘贴到 Markdown
- 大纲侧栏导航，支持分屏模式与预览联动
- Todo 分类看板，支持拖拽缩进和列内滚动
- 编辑器模式切换（编辑 / 预览 / 分屏）

### v2.7.x — AI 助手增强

- AI 聊天 Markdown 渲染
- 对话历史持久化（按工作区隔离）
- 支持引用项目文件作为 AI 上下文
- 流式对话 typewriter 效果

---

## Roadmap

### v3.0.0 — AI Agent 工作流

- 自动分析项目
- 自动生成下一步计划
- 自动整理文档与 Todo
- 自动维护项目上下文
- 自动生成项目报告

---

## License

MIT © GongJinCheng
