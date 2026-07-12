import { escHtml, escAttr } from '../utils/escape';
import { novaIcon, novaIconTile, NovaIconName } from '../utils/icons';

export type NovaHeroAction = {
  id?: string;
  label: string;
  icon?: NovaIconName | string;
  variant?: 'primary' | 'ghost' | 'soft';
};

export type NovaHeroOptions = {
  kicker?: string;
  title: string;
  subtitle?: string;
  meta?: string[];
  actions?: NovaHeroAction[];
  className?: string;
};

export function novaHero(options: NovaHeroOptions): string {
  const meta = (options.meta || []).filter(Boolean);
  const actions = (options.actions || []).map(action => {
    const variant = action.variant || 'ghost';
    const id = action.id ? ' id="' + escAttr(action.id) + '"' : '';
    return '<button class="nova-btn nova-btn-' + variant + '"' + id + ' type="button">' +
      (action.icon ? novaIcon(action.icon, 'nova-btn-icon') : '') +
      '<span>' + escHtml(action.label) + '</span>' +
    '</button>';
  }).join('');

  return '<section class="nova-hero-shell ' + escAttr(options.className || '') + '">' +
    '<div class="nova-hero-glow"></div>' +
    '<div class="nova-hero-copy">' +
      (options.kicker ? '<div class="nova-kicker">' + escHtml(options.kicker) + '</div>' : '') +
      '<h1>' + escHtml(options.title) + '</h1>' +
      (options.subtitle ? '<p>' + escHtml(options.subtitle) + '</p>' : '') +
      (meta.length ? '<div class="nova-meta-row">' + meta.map(item => '<span>' + escHtml(item) + '</span>').join('') + '</div>' : '') +
    '</div>' +
    (actions ? '<div class="nova-hero-actions">' + actions + '</div>' : '') +
  '</section>';
}

export type NovaEmptyStateOptions = {
  icon?: NovaIconName | string;
  title: string;
  description?: string;
  actionLabel?: string;
  actionId?: string;
};

export function novaEmptyState(options: NovaEmptyStateOptions): string {
  return '<div class="nova-empty-state">' +
    novaIconTile(options.icon || 'empty', 'nova-empty-illustration') +
    '<h3>' + escHtml(options.title) + '</h3>' +
    (options.description ? '<p>' + escHtml(options.description) + '</p>' : '') +
    (options.actionLabel ? '<button class="nova-btn nova-btn-primary"' + (options.actionId ? ' id="' + escAttr(options.actionId) + '"' : '') + ' type="button">' + escHtml(options.actionLabel) + '</button>' : '') +
  '</div>';
}

export function novaSkeleton(lines = 3): string {
  const rows = Array.from({ length: Math.max(1, lines) }, (_, index) => '<span class="nova-skeleton-line line-' + (index + 1) + '"></span>').join('');
  return '<div class="nova-skeleton-card">' + rows + '</div>';
}

export { novaIcon, novaIconTile };
