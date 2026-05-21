/**
 * ID 生成工具
 */

/** 生成短唯一 ID */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
