/**
 * 应用级常量
 */
export const APP_CONSTANTS = {
  /** 窗口默认配置 */
  WINDOW: {
    WIDTH: 1200,
    HEIGHT: 800,
    MIN_WIDTH: 800,
    MIN_HEIGHT: 600,
    BG_COLOR: '#1a1a2e',
  },
  /** 提醒配置 */
  REMINDER: {
    CHECK_INTERVAL_MS: 30_000,
    WINDOW_MINUTES: 30,
  },
  /** 默认主题 */
  DEFAULT_THEME: 'dark' as const,
} as const;
