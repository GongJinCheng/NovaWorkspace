# Nova v2.8.0 - 导出系统

本版本新增导出系统，让 Nova 从“生产内容”进一步进入“交付内容”阶段。

## 新增功能

### 当前 Markdown 文档导出

文件管理器的 Markdown 工具栏新增：

- 导出 HTML
- 导出 PDF

导出时会自动使用 Nova 的文档样式包装 Markdown 内容，适合归档、分享或进一步排版。

### 项目报告导出

项目概览页新增：

- 导出项目报告
- 导出 PDF 报告

项目报告会基于当前工作区生成，包含：

- 项目信息
- 文档统计
- Todo 统计
- 版本历史统计
- 最近文档
- 最近活动
- 下一步建议

### 命令面板导出命令

`Ctrl+K` 新增导出相关命令：

- 导出当前文档为 HTML
- 导出当前文档为 PDF
- 导出项目报告 Markdown
- 导出项目报告 PDF

## 技术实现

- 新增主进程导出 IPC：`fs:export-document`
- HTML / PDF 导出使用统一 Nova 文档样式
- PDF 导出基于 Electron `webContents.printToPDF`
- 渲染层新增 `export-service`
- 项目报告 Markdown 由项目概览数据自动生成

## 验证

- `npm run typecheck`
- `npm run build`
