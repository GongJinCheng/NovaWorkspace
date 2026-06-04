# Nova v2.9.0

本版本围绕自动更新、AI 多模态、Markdown 预览和待办中心小屏体验做了集中改造。

## 新增

- 接入 `electron-updater`：打包安装后启动自动检查 GitHub Release，发现新版本后可下载并重启安装。
- AI 助手支持图片输入：可点击图片按钮选择本地图片，也可以直接粘贴/拖拽图片。
- AI 助手支持识别本地图片路径：用户输入 `C:\...\image.png` 这类路径时，会在主进程读取图片并作为多模态输入发送。
- Markdown 预览支持 Mermaid 代码块渲染。
- 侧边栏右下角用户信息改造为本地登录，仅保存到当前电脑 localStorage。

## 优化

- 推理模型输出的 `reasoning_content` 会被包装为“思考过程”折叠块，默认隐藏，不再直接铺满聊天区。
- 待办中心时间轴看板改为响应式布局，小分辨率下自动换列/换行，避免右侧待办被裁切。
- AI 输入框增加附件预览、移除、拖拽高亮和图片数量限制。

## 打包发布说明

1. 配置好 GitHub token 后运行：

```bash
npm run publish:win
```

2. electron-builder 会生成安装包与 `latest.yml`，并发布到 `GongJinCheng/NovaWorkspace` 的 GitHub Release。
3. 已安装的 Nova 在下次启动后会自动检查 Release 中的最新版本。
