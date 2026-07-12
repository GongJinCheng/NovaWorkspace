/**
 * Router - Page routing and navigation
 */
export type PageId = 'home' | 'project' | 'files' | 'ai' | 'todo' | 'knowledge' | 'settings';

/** All valid routes. Single source of truth for route validation. */
export const ALL_PAGES: readonly PageId[] = ['home', 'project', 'files', 'ai', 'todo', 'knowledge', 'settings'];

/**
 * Pages that should re-run their init (refresh data) on every visit.
 * Replaces the previous implicit whitelist hardcoded inside switchPage.
 */
export const REFRESH_ON_VISIT: ReadonlySet<PageId> = new Set<PageId>(['ai', 'todo', 'files']);

const pageInits = new Map<PageId, () => void | Promise<void>>();
const pageCleanups = new Map<PageId, () => void>();
let currentPage: PageId | null = null;

/** Guard against hashchange re-entrancy while switchPage writes the URL. */
let applyingProgrammaticHash = false;

export function registerPageInit(pageId: PageId, initFn: () => void | Promise<void>): void {
  pageInits.set(pageId, initFn);
}

/**
 * Register a cleanup function for a page. Called when navigating away from the page.
 * Pages should call this inside their init function each time to keep cleanup fresh.
 */
export function registerPageCleanup(pageId: PageId, cleanupFn: () => void): void {
  pageCleanups.set(pageId, cleanupFn);
}

/** Parse the current location hash into a validated PageId, or null if invalid. */
function parseHashRoute(): PageId | null {
  const raw = location.hash.replace(/^#\/?/, '').trim().toLowerCase();
  if (!raw) return 'home';
  return (ALL_PAGES as readonly string[]).includes(raw) ? (raw as PageId) : null;
}

/** Persist the active route into the URL hash (unless already matching). */
function syncHashRoute(pageId: PageId): void {
  const next = '#/' + pageId;
  if (location.hash === next) return;
  applyingProgrammaticHash = true;
  location.hash = next;
  // hashchange fires asynchronously; release the guard after the current task.
  queueMicrotask(() => {
    applyingProgrammaticHash = false;
  });
}

/** Show the fallback page for an unknown route. */
function showFallbackPage(): void {
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  const fallback = document.getElementById('page-unknown');
  if (fallback) fallback.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const pathEl = document.getElementById('route-fallback-path');
  if (pathEl) pathEl.textContent = location.hash || '#/';
}

function onHashChange(): void {
  if (applyingProgrammaticHash) return;
  const next = parseHashRoute();
  if (next === null) {
    showFallbackPage();
    return;
  }
  if (next === currentPage) return;
  void switchPage(next);
}

/**
 * Enable hash-based routing: deep links, back/forward, and URL persistence.
 * Also performs the initial navigation (replacing initializeActivePage at boot).
 */
export function initHashRouting(): void {
  window.addEventListener('hashchange', onHashChange);
  const fallbackBtn = document.getElementById('btn-route-fallback-home');
  fallbackBtn?.addEventListener('click', () => void switchPage('home'));

  const initial = parseHashRoute();
  if (initial && initial !== currentPage) {
    void switchPage(initial);
  }
}

export async function switchPage(pageId: PageId): Promise<void> {
  // Clean up previous page before switching
  if (currentPage && currentPage !== pageId) {
    const cleanupFn = pageCleanups.get(currentPage);
    if (cleanupFn) {
      cleanupFn();
      pageCleanups.delete(currentPage);
    }
  }

  // Hide all pages
  document.querySelectorAll('.page').forEach(el => {
    el.classList.remove('active', 'page-enter');
  });

  // Show target page
  const target = document.getElementById('page-' + pageId);
  if (target) {
    target.classList.add('active');
    target.classList.remove('page-enter');
    requestAnimationFrame(() => target.classList.add('page-enter'));
  }

  // Call page init on first navigation or for pages that opt into refresh-on-visit.
  if (currentPage !== pageId || REFRESH_ON_VISIT.has(pageId)) {
    const initFn = pageInits.get(pageId);
    if (initFn) await initFn();
  }

  currentPage = pageId;

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', (el as HTMLElement).dataset.page === pageId);
  });

  // Persist the route to the URL.
  syncHashRoute(pageId);
}

export function getCurrentPage(): PageId | null {
  return currentPage;
}

/**
 * Detect the currently active .page and fire its registered init once.
 * Kept for backward compatibility; boot now prefers initHashRouting().
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
