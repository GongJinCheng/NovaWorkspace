import { setupAppLifecycle } from './bootstrap/app-lifecycle';
import { registerAllHandlers } from './ipc';

// 注册所有 IPC handlers
registerAllHandlers();

// 启动应用生命周期
setupAppLifecycle();
