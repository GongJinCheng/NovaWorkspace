/**
 * Nova SVG Icon System
 *
 * Centralized inline SVG icons for renderer-generated UI. Keeping icons here
 * avoids mixing emoji/text placeholders with product surfaces and makes the UI
 * consistent across Home, Project, Files, AI, Todo, Knowledge and Settings.
 */

export type NovaIconName =
  | 'home'
  | 'project'
  | 'folder'
  | 'file'
  | 'markdown'
  | 'files'
  | 'task'
  | 'check'
  | 'warning'
  | 'history'
  | 'ai'
  | 'sparkles'
  | 'plus'
  | 'new-doc'
  | 'new-todo'
  | 'summary'
  | 'plan'
  | 'report'
  | 'pdf'
  | 'template'
  | 'meeting'
  | 'tech'
  | 'weekly'
  | 'bug'
  | 'learning'
  | 'prompt'
  | 'activity'
  | 'settings'
  | 'knowledge'
  | 'empty'
  | 'error'
  | 'loading';

const commonAttrs = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

const paths: Record<NovaIconName, string> = {
  home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  project: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 16V10"/><path d="M12 16V8"/><path d="M16 16v-4"/>',
  folder: '<path d="M3 7a3 3 0 0 1 3-3h4l2 3h6a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z"/>',
  file: '<path d="M14 2H7a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V8z"/><path d="M14 2v6h6"/>',
  markdown: '<path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M6 15V9l3 3 3-3v6"/><path d="M16 9v6"/><path d="m14 13 2 2 2-2"/>',
  files: '<path d="M8 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/><path d="M4 15V5a2 2 0 0 1 2-2h10"/>',
  task: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m8 12 2.5 2.5L16 9"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  warning: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>',
  ai: '<path d="M12 2v20"/><path d="M8 6a4 4 0 0 1 8 0c0 1.8-1.2 3.3-2.8 3.8"/><path d="M16 18a4 4 0 0 1-8 0c0-1.8 1.2-3.3 2.8-3.8"/><path d="M5 12h14"/>',
  sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  'new-doc': '<path d="M14 2H7a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V8z"/><path d="M14 2v6h6"/><path d="M12 12v6"/><path d="M9 15h6"/>',
  'new-todo': '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 12h5"/><path d="M8 16h8"/><path d="m15 9 1.5 1.5L20 7"/>',
  summary: '<path d="M4 5h16"/><path d="M4 12h10"/><path d="M4 19h16"/><path d="M18 10l2 2-2 2"/>',
  plan: '<path d="M4 19V5"/><path d="M4 7h12l-2 4 2 4H4"/><path d="M18 19v-6"/><path d="M15 16h6"/>',
  report: '<path d="M14 2H7a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V8z"/><path d="M14 2v6h6"/><path d="M8 14h8"/><path d="M8 18h5"/>',
  pdf: '<path d="M14 2H7a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V8z"/><path d="M14 2v6h6"/><path d="M8 17h1.5a1.5 1.5 0 0 0 0-3H8v4"/><path d="M13 14v4h1.2a2 2 0 0 0 0-4z"/><path d="M18 14h2"/><path d="M18 16h1.5"/>',
  template: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  meeting: '<path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M3 10h18"/><path d="M8 15h5"/><path d="M8 18h8"/>',
  tech: '<path d="m8 3-5 9 5 9"/><path d="m16 3 5 9-5 9"/><path d="M13 5 11 19"/>',
  weekly: '<path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M3 10h18"/><path d="M7 14h3"/><path d="M14 14h3"/><path d="M7 18h3"/>',
  bug: '<path d="M8 7a4 4 0 0 1 8 0"/><rect x="6" y="7" width="12" height="14" rx="6"/><path d="M3 13h3"/><path d="M18 13h3"/><path d="M4 19l3-2"/><path d="M20 19l-3-2"/><path d="M12 7v14"/>',
  learning: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/><path d="M8 7h8"/><path d="M8 11h7"/>',
  prompt: '<path d="M12 2v20"/><path d="M5 8h14"/><path d="M5 16h14"/><path d="M8 5l-3 3 3 3"/><path d="M16 13l3 3-3 3"/>',
  activity: '<path d="M22 12h-4l-3 8L9 4l-3 8H2"/>',
  settings: '<path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z"/>',
  knowledge: '<path d="M3 6a3 3 0 0 1 3-3h5v18H6a3 3 0 0 1-3-3z"/><path d="M13 3h5a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-5z"/><path d="M7 8h2"/><path d="M7 12h2"/><path d="M15 8h2"/><path d="M15 12h2"/>',
  empty: '<path d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"/><path d="M9 10h6"/><path d="M9 14h4"/>',
  error: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/>',
  loading: '<path d="M21 12a9 9 0 1 1-6-8.5"/><path d="M21 3v6h-6"/>'
};

export function novaIcon(name: NovaIconName | string, className = 'nova-icon'): string {
  const safeName = (name in paths ? name : 'sparkles') as NovaIconName;
  return '<svg class="' + className + ' nova-icon-' + safeName + '" ' + commonAttrs + '>' + paths[safeName] + '</svg>';
}

export function novaIconTile(name: NovaIconName | string, className = 'nova-icon-tile'): string {
  return '<span class="' + className + '" aria-hidden="true">' + novaIcon(name, 'nova-icon') + '</span>';
}

export function iconForTemplate(id: string): NovaIconName {
  switch (id) {
    case 'prd': return 'project';
    case 'meeting': return 'meeting';
    case 'tech-plan': return 'tech';
    case 'dev-plan': return 'plan';
    case 'bug-report': return 'bug';
    case 'weekly-report': return 'weekly';
    case 'retrospective': return 'history';
    case 'learning-note': return 'learning';
    case 'ai-prompt': return 'prompt';
    default: return 'markdown';
  }
}

export function iconForActivity(type: string): NovaIconName {
  switch (type) {
    case 'document': return 'markdown';
    case 'todo': return 'task';
    case 'history': return 'history';
    case 'project': return 'project';
    default: return 'activity';
  }
}
