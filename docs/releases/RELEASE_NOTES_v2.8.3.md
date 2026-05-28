# Nova v2.8.3 - 发布整理与代码结构优化

这个版本是 v2.8.x 导出系统之后的发布整理版，重点是稳定当前功能、整理仓库结构、更新文档，并为后续 v2.9.0 知识库导入做准备。

## 主要更新

- 更新 README 到当前功能状态
- 补充首页工作台、项目概览、模板系统、导出系统、快捷键等说明
- 将根目录下的 Release Notes 统一移动到 `docs/releases/`
- 抽离主进程导出逻辑到 `src/main/services/export-service.ts`
- 精简 `src/main/ipc/fs.handlers.ts` 中的导出实现，让它只负责 IPC 注册
- 更新版本号到 `2.8.3`

## 代码结构优化

### 主进程导出逻辑抽离

之前导出相关逻辑直接放在 `fs.handlers.ts` 中，包括：

- 导出文件名处理
- HTML fallback 构建
- HTML 转 PDF
- 保存弹窗处理
- PDF 隐藏窗口管理

v2.8.3 后改为：

```text
src/main/ipc/fs.handlers.ts
└── 只注册 IPC handler

src/main/services/export-service.ts
└── 处理导出 Markdown / HTML / PDF 的实际逻辑
```

这样 `fs.handlers.ts` 更聚焦，后续如果要扩展导出模板、PDF 样式、项目报告导出策略，也可以在服务层继续演进。

## 验证

- 已通过 TypeScript 类型检查
- 已通过项目构建

```bash
npm run typecheck
npm run build
```

## 建议发布前检查

- 启动后直接按 `Ctrl+K` 是否正常打开命令面板
- `Ctrl+P` 是否仍然只用于快速打开文件
- Markdown 编辑是否正常输入、自动保存
- 当前文档导出 HTML / PDF 是否正常
- 项目报告导出 Markdown / PDF 是否正常
- 模板创建和 AI 填充模板是否正常
