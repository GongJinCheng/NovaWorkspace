# Nova

> All-in-one productivity workspace — 文件管理、AI 助手、待办中心，一站集成。

[![Electron](https://img.shields.io/badge/Electron-35-47848f?logo=electron)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![esbuild](https://img.shields.io/badge/esbuild-0.24-ffcf00?logo=esbuild)](https://esbuild.github.io/)
[![Version](https://img.shields.io/badge/version-2.1.0-0066FF)](https://github.com/GongJinCheng/NovaWorkspace/releases)

---

## 🎬 Demo

[![Nova Showcase](https://img.shields.io/badge/Watch_Animation-0066FF?logo=youtube)](./NovaShowcase/renders/)

A 35-second product showcase built with [HyperFrames](https://hyperframes.heygen.com/), featuring Swiss Pulse design with grid-locked compositions, electric blue accents, and staggered entrance animations.

> Run `cd NovaShowcase && npm run dev` to preview, or `npm run render` to regenerate the MP4.

---

## 功能模块

| 页面 | 功能 |
|------|------|
| **首页** | 快捷入口、全局搜索 (Ctrl+K)、问候语 |
| **文件管理** | Monaco 编辑器、多标签页、文件树导航、AI 格式化、面包屑、收藏夹 |
| **AI 助手** | OpenAI 兼容 API、SSE 流式对话、可收起侧边栏 |
| **待办中心** | 任务 CRUD、子任务、分类过滤、智能筛选、抽屉详情 |
| **设置** | 主题切换、API Key 配置、快捷键总览 |

## 技术栈

- **桌面框架**: Electron 35
- **语言**: TypeScript 5.7
- **构建**: esbuild (零配置，三个 bundle: main / preload / renderer)
- **编辑器**: Monaco Editor
- **样式**: 纯 CSS + 自定义设计系统 (CSS 变量)
- **IPC**: Electron contextBridge + ipcRenderer/ipcMain

## 项目结构

```
electron-app/
├── src/
│   ├── main/           # 主进程 (窗口管理、IPC、生命周期)
│   ├── preload/        # 预加载脚本 (contextBridge API)
│   ├── renderer/       # 渲染进程
│   │   ├── app/        # 入口、路由、主题
│   │   ├── pages/      # 5 个页面模块 (home/files/ai/todo/settings)
│   │   ├── components/ # 通用组件 (modal 等)
│   │   ├── services/   # IPC 客户端
│   │   └── styles/     # CSS 设计系统
│   └── shared/         # 共享类型、常量、工具
├── assets/             # 图标资源
├── esbuild.*.mjs       # 构建脚本
├── index.html          # 入口 HTML
└── package.json
```

## 快速开始

```bash
# 安装依赖
npm install

# 开发 (构建 + 启动)
npm run dev

# 仅构建
npm run build

# 打包 Windows 安装包
npm run package
```

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+K` | 全局搜索 |
| `Ctrl+S` | 保存文件 |
| `Ctrl+N` | 新建文件 |
| `Ctrl+O` | 打开文件夹 |
| `Ctrl+W` | 关闭标签页 |

## License

MIT © GongJinCheng