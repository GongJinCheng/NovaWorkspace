/**
 * Reminders — 提醒系统
 * 轮询检查 + 声音提醒 + 系统通知 + Toast
 */

import { ipcClient } from '../../services/ipc-client';

const REMINDER_INTERVAL_MS = 30_000;
const TOAST_DURATION_MS = 8_000;

let reminderTimer: ReturnType<typeof setInterval> | null = null;

export function startReminderCheck(): void {
  if (reminderTimer) return;
  
  reminderTimer = setInterval(async () => {
    try {
      const alerts = await ipcClient.todo.checkReminders();
      if (alerts?.length > 0) {
        alerts.forEach(showReminder);
      }
    } catch (err) {
      console.error('[Reminders] check failed:', err);
    }
  }, REMINDER_INTERVAL_MS);
}

export function stopReminderCheck(): void {
  if (reminderTimer) {
    clearInterval(reminderTimer);
    reminderTimer = null;
  }
}

function showReminder(task: { title: string }): void {
  playNotificationSound();
  showSystemNotification(task.title);
  showInAppToast(task.title);
}

function playNotificationSound(): void {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.setValueAtTime(1000, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(800, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch (err) {
    console.warn('[Reminders] audio failed:', err);
  }
}

function showSystemNotification(title: string): void {
  if (Notification.permission === 'granted') {
    new Notification('任务即将到期', { body: title + ' 将在 30 分钟内到期' });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') {
        new Notification('任务即将到期', { body: title + ' 将在 30 分钟内到期' });
      }
    });
  }
}

function showInAppToast(title: string): void {
  const toast = document.createElement('div');
  toast.className = 'todo-notification-toast';
  toast.innerHTML = `
    <svg class="todo-notif-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
    <span class="todo-notif-text">${esc(title)} 将在 30 分钟内到期</span>
    <button class="todo-notif-close">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
    </button>`;
  document.body.appendChild(toast);
  toast.querySelector('.todo-notif-close')?.addEventListener('click', () => toast.remove());
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, TOAST_DURATION_MS);
}

function esc(text: string): string {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}
