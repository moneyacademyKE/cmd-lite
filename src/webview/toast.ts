/// <reference lib="dom" />
/**
 * Toast Notification System
 *
 * Lightweight, auto-dismissing toast notifications rendered in the webview.
 */
import { escapeHtml } from '../util/util';

export function showToast(
  message: string,
  type: 'info' | 'error' | 'success' | 'warning' = 'info',
  durationMs = 4000,
): void {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.getElementById('app')?.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-content">${escapeHtml(message)}</span>
    <button class="toast-close">&times;</button>
  `;

  const closeBtn = toast.querySelector('.toast-close') as HTMLElement;
  closeBtn.addEventListener('click', () => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 200);
  });

  container.appendChild(toast);

  if (durationMs > 0) {
    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 200);
      }
    }, durationMs);
  }
}
