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
  APP: {
    GET_VERSION: 'app:get-version',
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
    CREATE_SAMPLE_WORKSPACE: 'fs:create-sample-workspace',
    GET_RECENT_MARKDOWN: 'fs:get-recent-markdown',
    SEARCH_WORKSPACE: 'fs:search-workspace',
    CREATE_BACKUP: 'fs:create-backup',
    LIST_BACKUPS: 'fs:list-backups',
    READ_BACKUP: 'fs:read-backup',
    RESTORE_BACKUP: 'fs:restore-backup',
    DELETE_BACKUP: 'fs:delete-backup',
    EXPORT_DOCUMENT: 'fs:export-document',
    READ_IMAGE_AS_DATA_URL: 'fs:read-image-as-data-url',
    COPY_FILE: 'fs:copy-file',
    WRITE_BINARY: 'fs:write-binary',
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
  WORKSPACE: {
    LIST: 'workspace:list',
    OPEN: 'workspace:open',
    REMOVE: 'workspace:remove',
    CLEAR: 'workspace:clear',
    GET_SESSION: 'workspace:get-session',
    SAVE_SESSION: 'workspace:save-session',
    GET_PROJECT_META: 'workspace:get-project-meta',
    UPDATE_PROJECT_META: 'workspace:update-project-meta',
    GET_PROJECT_OVERVIEW: 'workspace:get-project-overview',
  },
  UPDATE: {
    CHECK: 'update:check',
    DOWNLOAD: 'update:download',
    INSTALL: 'update:install',
    STATUS: 'update:status',
  },
  AI: {
    GET_SETTINGS: 'ai:get-settings',
    SAVE_PROVIDER: 'ai:save-provider',
    DELETE_PROVIDER: 'ai:delete-provider',
    SET_DEFAULT_PROVIDER: 'ai:set-default-provider',
    CHAT: 'ai:chat',
    FETCH_MODELS: 'ai:fetch-models',
    TEST_CONNECTION: 'ai:test-connection',
    STREAM_START: 'ai:stream-start',
    STREAM_CANCEL: 'ai:stream-cancel',
    STREAM_CHUNK: 'ai:stream-chunk',
    STREAM_DONE: 'ai:stream-done',
    STREAM_ERROR: 'ai:stream-error',
  },
  CHAT_HISTORY: {
    LIST: 'chat-history:list',
    GET: 'chat-history:get',
    SAVE: 'chat-history:save',
    DELETE: 'chat-history:delete',
  },
  KNOWLEDGE: {
    LIST: 'knowledge:list',
    GET: 'knowledge:get',
    CREATE: 'knowledge:create',
    DELETE: 'knowledge:delete',
    GET_TEXT: 'knowledge:get-text',
    UPDATE_SUMMARY: 'knowledge:update-summary',
    IMPORT_PDF: 'knowledge:import-pdf',
    IMPORT_WEB: 'knowledge:import-web',
    GET_STATS: 'knowledge:get-stats',
  },
  FS_WATCH: {
    /** Main → renderer push: a file/dir was added, changed, or deleted */
    CHANGED: 'fs-watch:changed',
    /** Renderer → main: start watching a workspace root */
    WATCH: 'fs-watch:watch',
    /** Renderer → main: stop watching a workspace root */
    UNWATCH: 'fs-watch:unwatch',
  },
} as const;

export type IpcChannel = typeof IPC_CHANNELS;