# NovaShowcase

Nova Workspace 的 HyperFrames 宣传视频工程。

定位：**本地优先的 AI 深度工作台**  
时长：约 45 秒  
比例：16:9，默认 1920×1080  
风格：深色科技感、Swiss grid、electric blue、玻璃拟态卡片、产品 UI 动效。

## 预览

```bash
npm install
npm run preview
```

## 渲染 MP4

```bash
npm run render
```

输出位置：

```text
renders/nova-v2.6.2-showcase.mp4
```

## 安装 HyperFrames skills

HyperFrames 官方推荐让 AI coding agent 使用 skills 来生成和维护视频工程：

```bash
npm run skills
```

## 视频结构

| 时间 | 场景 | 内容 |
|---|---|---|
| 0-4s | Hero | Nova Workspace 定位 |
| 4-9s | Workspace | 打开本地文件夹作为项目 |
| 9-15s | Markdown | Markdown 编辑与文档 AI |
| 15-22s | AI | 问当前文档、总结、生成方案 |
| 22-27s | Todo | AI 生成待办并落地执行 |
| 27-32s | Home | 首页今日工作台 |
| 32-38s | Project Dashboard | 项目概览、统计、最近活动 |
| 38-42s | Version Safety | 自动保存、版本历史、恢复 |
| 42-45s | CTA | GitHub 下载 / 本地优先 |

## 推荐旁白

> Nova Workspace，一个本地优先的 AI 深度工作台。  
> 打开一个文件夹，就是一个项目。  
> 在 Markdown 中沉淀想法，用 AI 理解当前文档。  
> 一键生成待办，让输出真正落地。  
> 首页追踪今日任务，项目概览掌握整体进展。  
> 自动保存与版本历史，让每一次 AI 修改都有保障。  
> Nova，把文档、AI 和执行连接起来。



## v2.6.2 Render Compatibility Fix

This build registers a real paused GSAP timeline on `window.__timelines`, removes template-literal selectors from the timeline setup, and avoids timed duplicate image nodes for newer HyperFrames renderers.
