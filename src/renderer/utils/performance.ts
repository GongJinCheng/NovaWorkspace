/**
 * Lightweight renderer performance helpers.
 * Logs slow UI work without changing runtime behavior in production builds.
 */

const SLOW_FRAME_MS = 16;
const VERY_SLOW_MS = 50;

export function measure<T>(name: string, fn: () => T, threshold = SLOW_FRAME_MS): T {
  const start = performance.now();
  const result = fn();
  const cost = performance.now() - start;

  if (cost > threshold) {
    const level = cost > VERY_SLOW_MS ? 'warn' : 'debug';
    console[level](`[perf] ${name}: ${cost.toFixed(1)}ms`);
  }

  return result;
}

export async function measureAsync<T>(name: string, fn: () => Promise<T>, threshold = SLOW_FRAME_MS): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const cost = performance.now() - start;
    if (cost > threshold) {
      const level = cost > VERY_SLOW_MS ? 'warn' : 'debug';
      console[level](`[perf] ${name}: ${cost.toFixed(1)}ms`);
    }
  }
}

export function debounce<T extends (...args: any[]) => void>(fn: T, delay = 200): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delay);
  }) as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  return debounced;
}
