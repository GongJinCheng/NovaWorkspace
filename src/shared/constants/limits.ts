/**
 * 跨进程共享的数值限制常量。
 * 集中提取散落在各处的魔法数字，便于统一调参与审计。
 */

/** AI 对话默认超时（毫秒）。 */
export const AI_TIMEOUT_MS = 30_000;

/** AI 连接测试超时（毫秒），短于常规对话以便快速失败。 */
export const AI_TEST_TIMEOUT_MS = 20_000;

/** AI 流式对话超时（毫秒），常规对话的两倍以容纳首 token 延迟。 */
export const AI_STREAM_TIMEOUT_MS = 60_000;

/** 图片读取上限（字节）。超过此大小的图片不允许编码后发送给 AI。 */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
