/**
 * Extract actionable tasks from arbitrary text or AI JSON output.
 * Extracted from EditorManager (parseTodoCandidates / parseJsonTasks /
 * dedupeTasks) — pure functions, no editor state.
 */

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ExtractedTask {
  title: string;
  description: string;
  priority: TaskPriority;
}

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

/** Heuristic: pull list-item lines (-, *, 1.) as candidate tasks. */
export function parseTodoCandidates(text: string): ExtractedTask[] {
  return text
    .split(/\r?\n/)
    .map(line =>
      line
        .trim()
        .replace(/^[-*]\s+\[[ xX]\]\s*/, '')
        .replace(/^[-*]\s+/, '')
        .replace(/^\d+[.)]\s*/, ''),
    )
    .filter(line => line.length >= 3 && line.length <= 120)
    .slice(0, 12)
    .map(title => ({ title, description: '', priority: 'medium' as TaskPriority }));
}

/** Parse an AI JSON task array; fall back to heuristics on any failure. */
export function parseJsonTasks(raw: string): ExtractedTask[] {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return parseTodoCandidates(raw);
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: Record<string, unknown>) => {
        const priority = String(item.priority ?? '');
        const validPriority: TaskPriority = (PRIORITIES as string[]).includes(priority)
          ? (priority as TaskPriority)
          : 'medium';
        return {
          title: String(item.title ?? '').trim(),
          description: String(item.description ?? '').trim(),
          priority: validPriority,
        };
      })
      .filter(item => item.title)
      .slice(0, 20);
  } catch {
    return parseTodoCandidates(raw);
  }
}

/** Remove duplicate tasks by normalised (whitespace-stripped, lowercased) title. */
export function dedupeTasks(tasks: ExtractedTask[]): ExtractedTask[] {
  const seen = new Set<string>();
  const result: ExtractedTask[] = [];
  for (const task of tasks) {
    const title = task.title.trim();
    const key = title.replace(/\s+/g, '').toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    result.push({ ...task, title });
  }
  return result.slice(0, 20);
}
