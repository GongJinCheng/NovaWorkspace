/**
 * Shared formatting helpers.
 *
 * These were previously duplicated across multiple pages
 * (home, project, app entry, onboarding). Consolidated here so the
 * behavior stays identical in one place.
 */

/**
 * Format an ISO timestamp as a Chinese relative-time string.
 * Semantics match the previous per-page copies exactly.
 */
export function formatRelativeTime(isoStr: string): string {
  const date = new Date(isoStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (Number.isNaN(date.getTime())) return '时间未知';
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return minutes + ' 分钟前';
  if (hours < 24) return hours + ' 小时前';
  if (days === 1) return '昨天';
  if (days < 7) return days + ' 天前';
  return date.toLocaleDateString('zh-CN');
}

/**
 * Greeting text by hour of day.
 * Returns plain text; callers may append an emoji if desired.
 */
export function getGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 6) return '夜深了';
  if (hour < 9) return '早上好';
  if (hour < 12) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  if (hour < 22) return '晚上好';
  return '夜深了';
}
