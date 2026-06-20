/**
 * Router - Page routing and navigation
 */
export type PageId = 'home' | 'project' | 'files' | 'ai' | 'todo' | 'knowledge' | 'settings';

const pageInits = new Map<PageId, () => void | Promise<void>>();
let currentPage: PageId | null = null;

export function registerPageInit(pageId: PageId, initFn: () => void | Promise<void>): void {
  pageInits.set(pageId, initFn);
}

export async function switchPage(pageId: PageId): Promise<void> {
  // Hide all pages
  document.querySelectorAll('.page').forEach(el => {
    el.classList.remove('active');
  });

  // Show target page
  const target = document.getElementById('page-' + pageId);
  if (target) {
    target.classList.add('active');
  }

  // Call page init every time the user navigates to a page.
  // Individual pages keep their own one-time binding guards, but this lets pages
  // refresh data/config after settings changes or background writes.
  if (currentPage !== pageId || pageId === 'ai' || pageId === 'todo' || pageId === 'files') {
    const initFn = pageInits.get(pageId);
    if (initFn) await initFn();
  }

  currentPage = pageId;

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', (el as HTMLElement).dataset.page === pageId);
  });
}

export function getCurrentPage(): PageId | null {
  return currentPage;
}

/**
 * Detect the currently active .page and fire its registered init once.
 * Covers the case where the app starts on a non-home page or the user
 * navigated before switchPage was wired up.
 */
export function initializeActivePage(): void {
  if (currentPage) return; // already tracked by switchPage
  const activeEl = document.querySelector('.page.active');
  if (!activeEl) return;
  const id = activeEl.id.replace('page-', '') as PageId;
  if (pageInits.has(id)) {
    currentPage = id;
    pageInits.get(id)?.();
  }
}