/**
 * Toast — 轻量非阻塞提示，替代阻塞式 alert()。
 * 用于信息类提示；需要用户确认的交互请使用 modal。
 */

export function toast(message: string, ms = 2600): void {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.className = 'mini-toast';
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  window.setTimeout(() => {
    el.classList.remove('show');
    window.setTimeout(() => el.remove(), 220);
  }, ms);
}
