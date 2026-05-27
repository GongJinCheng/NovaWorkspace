# Nova Workspace

> All-in-one local-first AI workspace — 文件管理、Markdown 文档、AI 助手、项目待办、版本历史和项目概览，一站集成。

[![Electron](https://img.shields.io/badge/Electron-35-47848f?logo=electron)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![esbuild](https://img.shields.io/badge/esbuild-0.24-ffcf00?logo=esbuild)](https://esbuild.github.io/)
[![Version](https://img.shields.io/badge/version-2.6.0-0066FF)](https://github.com/GongJinCheng/NovaWorkspace/releases)
[![License](https://img.shields.io/badge/license-MIT-green)](#license)

---

## 简介

Nova Workspace 是一款基于 **Electron + TypeScript + Monaco Editor** 构建的桌面端效率工作台。

它不是单纯的 Markdown 编辑器，也不是普通 Todo 工具，而是围绕「本地项目工作区」组织文档、任务和 AI 能力，帮助你把想法、资料、计划、执行过程和 AI 输出集中管理。

Nova 的核心工作流是：

```text
打开一个本地文件夹
→ 作为一个项目工作区
→ 编写 Markdown 文档
→ 使用 AI 分析、改写、总结
→ 一键生成项目待办
→ 在首页和项目概览中持续推进
```

---

## 🎬 Demo

[![Nova Showcase](https://img.shields.io/badge/Watch_Animation-0066FF?logo=youtube)](./NovaShowcase/renders/)

A 35-second product showcase built with [HyperFrames](https://hyperframes.heygen.com/), featuring Swiss Pulse design with grid-locked compositions, electric blue accents, and staggered entrance animations.

> Run `cd NovaShowcase && npm run dev` to preview, or `npm run render` to regenerate the MP4.

---

## 核心理念

Nova 采用 **本地优先** 设计。

用户打开的本地文件夹就是一个工作区，也可以理解成一个项目。Nova 会在项目目录下创建 `.nova` 目录，用于保存项目元信息、项目级待办、活动记录和文档历史版本。

```text
你的项目/
├── README.md
├── 产品方案.md
├── 会议纪要.md
├── 开发计划.md
└── .nova/
    ├── project.json
    ├── todos.json
    ├── activity.json
    └── history/
```

这样做的好处是：

- Markdown 文档仍然是普通文件，离开 Nova 也能打开
- 项目可以直接用 Git、OneDrive、坚果云等工具备份或同步
- 每个项目拥有独立待办和历史版本
- 数据尽量保存在用户自己的本地目录中，不锁死数据

---

## 功能模块

| 页面 | 功能 |
|------|------|
| **首页** | 今日工作台、任务概览、最近文档、最近项目、AI 状态、快捷入口 |
| **项目概览** | 项目信息、项目统计、最近文档、最近活动、项目级 AI 入口 |
| **文件管理** | 文件树、Monaco 编辑器、多标签页、Markdown 预览、自动保存、版本历史、文档 AI |
| **AI 助手** | OpenAI Compatible API、多 Provider 配置、流式对话、国产模型兼容 |
| **待办中心** | 项目级 Todo、分类、优先级、截止时间、子任务、来源文档追踪 |
| **设置** | 主题切换、AI Provider 配置、模型配置、快捷键总览 |

---

## 功能特性

### 1. 本地优先的项目工作区

- 打开本地文件夹作为工作区
- 每个工作区都是一个独立项目
- 自动维护 `.nova/project.json`
- 自动维护 `.nova/todos.json`
- 支持项目名称和项目描述
- 支持项目统计和最近活动
- 数据可迁移、可备份、可 Git 管理

---

### 2. Markdown 文档管理

- 文件树浏览
- Monaco Editor 编辑体验
- 多标签页
- Markdown 查看和编辑
- Markdown 预览
- 自动保存
- 保存状态提示
- 手动保存版本
- 版本历史列表
- 历史版本预览
- 历史版本恢复
- 历史版本删除

---

### 3. 文档 AI 能力

在文件管理器中，Nova 可以基于当前 Markdown 文档直接使用 AI。

支持：

- 总结当前文档
- 生成文档大纲
- 改写选中文本
- 问当前文档
- 根据当前文档生成待办
- 将 AI 输出插入当前文档
- 将 AI 输出创建为待办任务

AI 修改或插入文档前会自动创建历史备份，避免误操作导致内容丢失。

---

### 4. AI 助手

Nova 支持 OpenAI Compatible API，可以接入多种模型服务。

支持：

- 多 Provider 配置
- 自定义 Base URL
- 自定义 API Key
- 自定义模型名称
- 流式响应
- 流式失败自动降级
- AI 配置状态同步
- 请求超时处理
- 中文友好错误提示

可接入的服务包括但不限于：

- OpenAI Compatible API
- DeepSeek
- 通义千问
- Kimi
- 智谱 GLM
- 硅基流动
- 小米 MiMo
- Ollama 本地模型
- 其他兼容 `/v1/chat/completions` 的模型服务

---

### 5. 项目级 Todo

Nova 的 Todo 按工作区 / 项目隔离。

每个项目的待办数据保存在：

```text
当前工作区/.nova/todos.json
```

支持：

- 创建待办
- 更新待办
- 删除待办
- 分类管理
- 优先级
- 截止时间
- 子任务
- 完成状态
- 今日到期
- 逾期提醒
- AI 批量创建待办
- 从 Markdown 文档提取待办
- Todo 来源文档记录
- 从 Todo 返回来源 Markdown 文档

这意味着：

```text
项目 A 的待办不会出现在项目 B 中
项目 B 的待办也不会污染项目 A
```

---

### 6. 首页工作台

首页用于快速判断当天应该继续推进什么。

支持展示：

- 未完成任务
- 今日到期
- 已逾期
- 已完成
- 今日工作台任务
- 最近编辑文档
- 最近打开项目
- 当前 AI Provider / 模型状态
- 快捷操作入口

---

### 7. 项目概览页

项目概览页是当前工作区的项目控制台。

支持：

- 项目名称
- 项目描述
- 项目路径
- AI 状态
- Markdown 文档数量
- 总文件数量
- 未完成任务数
- 今日到期任务数
- 逾期任务数
- 历史版本数量
- 最近文档
- 最近活动
- 项目快捷操作
- 项目级 AI 入口

项目快捷操作包括：

- 新建文档
- 新建待办
- 打开文件管理
- 打开 AI 助手
- 总结项目
- 生成计划

---

### 8. 全局命令面板

使用 `Ctrl + K` 打开全局命令面板。

支持：

- 搜索文件名
- 搜索 Markdown 内容
- 搜索代码 / 文本内容
- 搜索 Todo
- 打开项目概览
- 打开设置
- 打开 AI 助手
- 新建文档
- 新建待办
- 总结当前文档
- 根据当前文档生成待办
- 保存当前版本
- 查看版本历史

键盘操作：

```text
↑ / ↓ 选择
Enter 执行
Esc 关闭
```

---

### 9. 文档版本安全

Nova 提供文档版本保护能力。

支持：

- 自动保存
- 手动保存版本
- AI 修改前自动备份
- AI 插入前自动备份
- 历史版本预览
- 当前内容与历史内容对比查看
- 恢复历史版本
- 删除历史版本

版本历史保存在：

```text
当前工作区/.nova/history/
```

---

## 使用流程示例

### 从文档生成待办

```text
1. 打开一个工作区
2. 新建或打开 Markdown 文档
3. 编写产品方案 / 会议纪要 / 技术方案
4. 点击“生成待办”
5. AI 自动提取任务
6. 确认后创建到当前项目 Todo
7. 在首页或待办中心继续推进
```

### 使用当前文档问 AI

```text
1. 打开 Markdown 文档
2. 点击“问当前文档”
3. 输入问题
4. AI 根据当前文档内容回答
```

### 使用项目概览

```text
1. 打开工作区
2. 进入项目概览页
3. 查看文档数量、待办状态、最近活动
4. 使用“总结项目”或“生成计划”
```

---

## AI 配置说明

Nova 默认不内置模型服务，需要用户自行配置 API。

进入：

```text
设置 → AI Provider
```

填写：

```text
Provider 名称
Base URL
API Key
模型名称
```

示例：

```text
Provider: DeepSeek
Base URL: https://api.deepseek.com/v1
Model: deepseek-chat
```

或者使用其他兼容 OpenAI Chat Completions 的服务：

```text
Base URL: https://your-api-provider.com/v1
Model: your-model-name
```

Nova 会调用 Chat Completions 接口。

如果你填写的是完整接口地址，例如：

```text
https://xxx.com/v1/chat/completions
```

Nova 也会自动兼容处理。

---

## 数据存储说明

Nova 是本地优先应用。

不同数据的存储位置：

| 数据 | 位置 |
|---|---|
| Markdown 文档 | 当前工作区文件夹 |
| 项目信息 | `.nova/project.json` |
| 项目待办 | `.nova/todos.json` |
| 项目活动 | `.nova/activity.json` |
| 文档历史版本 | `.nova/history/` |
| 应用配置 | Electron userData 目录 |

---

## 技术栈

- **桌面框架**: Electron 35
- **语言**: TypeScript 5.7
- **构建**: esbuild
- **编辑器**: Monaco Editor
- **样式**: 纯 CSS + 自定义设计系统
- **IPC**: Electron contextBridge + ipcRenderer / ipcMain
- **AI 接口**: OpenAI Compatible Chat Completions API

---

## 项目结构

```text
electron-app/
├── src/
│   ├── main/           # 主进程：窗口管理、IPC、文件系统、数据存储
│   ├── preload/        # 预加载脚本：contextBridge API
│   ├── renderer/       # 渲染进程
│   │   ├── app/        # 入口、路由、主题、全局命令
│   │   ├── pages/      # 页面模块：home/files/ai/todo/settings/project
│   │   ├── components/ # 通用组件
│   │   ├── services/   # IPC 客户端
│   │   └── styles/     # CSS 设计系统
│   └── shared/         # 共享类型、常量、工具
├── assets/             # 图标资源
├── NovaShowcase/       # 产品展示动画
├── esbuild.*.mjs       # 构建脚本
├── index.html          # 入口 HTML
└── package.json
```

---

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发运行

```bash
npm run dev
```

### 类型检查

```bash
npm run typecheck
```

### 构建

```bash
npm run build
```

### 打包 Windows 安装包

```bash
npm run package
```

如果 Electron 下载较慢，可以设置镜像：

```bash
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm run package
```

打包产物会生成在：

```text
release/
```

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + K` | 打开全局命令面板 |
| `Ctrl + S` | 保存当前文件 |
| `Ctrl + N` | 新建文档 |
| `Ctrl + O` | 打开工作区 |
| `Ctrl + W` | 关闭当前标签页 |

---

## 版本记录

### v2.6.x

- 新增项目概览页
- 新增 `.nova/project.json`
- 支持项目统计
- 支持最近文档
- 支持最近活动
- 支持项目级 AI 入口

### v2.5.x

- Todo 按项目 / 工作区隔离
- 每个工作区独立保存 `.nova/todos.json`
- AI 生成待办写入当前项目
- 首页和命令面板只展示当前项目任务

### v2.4.x

- 全局命令面板增强
- 支持搜索文件
- 支持搜索 Markdown 内容
- 支持搜索 Todo
- 支持快速执行 AI / 文档 / 设置命令

### v2.3.x

- 文档自动保存
- 保存状态提示
- 版本历史
- 历史版本预览
- 历史版本恢复
- 历史版本删除

### v2.2.x

- 首页工作台
- 今日待办
- 最近文档
- AI 状态展示
- 首页宽屏布局优化

### v2.1.x

- 首次使用引导
- 示例工作区
- AI 配置同步修复
- 当前文档 AI
- AI 生成待办
- AI 稳定性增强

---

## Roadmap

### v2.7.0 - 模板系统

- 内置 Markdown 模板
- 新建文档时选择模板
- 产品需求文档模板
- 会议纪要模板
- 技术方案模板
- 周报模板
- 项目复盘模板
- AI 根据模板生成文档

### v2.8.0 - 导出系统

- 导出 Markdown
- 导出 HTML
- 导出 PDF
- 导出项目报告
- 导出周报

### v2.9.0 - 知识库导入

- PDF 导入
- 网页内容导入
- 文本资料导入
- 图片资料管理
- AI 总结资料

### v3.0.0 - AI Agent 工作流

- 项目自动分析
- 自动生成下一步计划
- 自动整理文档与待办
- 自动维护项目上下文

---

## 适合场景

Nova 适合：

- 独立开发者
- 产品经理
- 学生
- 研究人员
- 写作者
- AI 工具重度用户
- 本地优先工作流用户
- 需要管理文档、任务和 AI 输出的人

适合管理：

- 软件项目
- 产品规划
- 学习计划
- 会议纪要
- 技术方案
- 个人知识库
- AI 生成内容
- 日常待办任务

---

## 设计原则

```text
本地优先
文档开放
AI 可接入
任务可落地
项目可追踪
数据不锁死
```

---

## License

MIT © GongJinCheng
