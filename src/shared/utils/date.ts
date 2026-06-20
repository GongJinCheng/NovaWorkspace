/**
 * Shared date utilities — usable in both main process and renderer.
 * No DOM dependencies, pure TypeScript.
 */

/** Get a Date at the start (midnight) of the given date's day. */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Check if a due date string represents a date before the start of today. */
export function isOverdue(dueDate: string | null | undefined, now: Date = new Date()): boolean {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  return !Number.isNaN(due.getTime()) && due < startOfDay(now);
}

/** Check if a due date string falls on today. */
export function isDueToday(dueDate: string | null | undefined, now: Date = new Date()): boolean {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  return !Number.isNaN(due.getTime()) && due.toDateString() === now.toDateString();
}
