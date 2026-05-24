/**
 * IPC Channel 常量定义
 * 所有 IPC 通信的 channel 名称集中管理，避免硬编码魔术字符串
 */
export const IPC_CHANNELS = {
  WINDOW: {
    MINIMIZE: 'window:minimize',
    MAXIMIZE: 'window:maximize',
    CLOSE: 'window:close',
  },
  FS: {
    READ_DIR: 'fs:read-directory',
    READ_FILE: 'fs:read-file',
    WRITE_FILE: 'fs:write-file',
    CREATE_FILE: 'fs:create-file',
    CREATE_DIR: 'fs:create-directory',
    DELETE_ITEM: 'fs:delete-item',
    RENAME_ITEM: 'fs:rename-item',
    GET_HOME: 'fs:get-home-dir',
    SHOW_OPEN_DIALOG: 'fs:show-open-dialog',
  },
  TODO: {
    LOAD: 'todo:load',
    SAVE: 'todo:save',
    ADD_TASK: 'todo:add-task',
    UPDATE_TASK: 'todo:update-task',
    DELETE_TASK: 'todo:delete-task',
    ADD_CATEGORY: 'todo:add-category',
    DELETE_CATEGORY: 'todo:delete-category',
    CHECK_REMINDERS: 'todo:check-reminders',
  },
  RECENT: {
    GET: 'recent:get',
    ADD: 'recent:add',
    REMOVE: 'recent:remove',
    CLEAR: 'recent:clear',
  },
} as const;

export type IpcChannel = typeof IPC_CHANNELS;