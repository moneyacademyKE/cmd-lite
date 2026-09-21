/// <reference lib="dom" />
/**
 * Smart Scroll Anchoring
 *
 * Direction-aware auto-scroll that decomplects user scrolling from
 * content reflows. Uses per-element state to isolate scroll contexts.
 */
import { state } from './state';
import type { PanelId } from './state';

export interface ScrollableElement extends HTMLElement {
  wasNearBottom?: boolean;
}

export function isNearBottom(el: HTMLElement, threshold = 150): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

export function scrollToBottom(el: HTMLElement): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  });
}

export function getActiveScrollContainer(): HTMLElement | null {
  const panel: PanelId = state.activePanel;
  const idMap: Record<PanelId, string> = {
    chat: 'chat-history',
    sessions: 'session-list',
    agents: 'agent-list',
    loops: 'loop-list',
    mcp: 'mcp-list',
    status: 'status-content',
  };
  return document.getElementById(idMap[panel]) ?? null;
}

export function setupScrollButton(container: HTMLElement): void {
  (container as ScrollableElement).wasNearBottom = true;

  const btn = document.createElement('button');
  btn.id = container.id + '-scroll-bottom-btn';
  btn.className = 'scroll-bottom-btn';
  btn.textContent = '\u25BC BOTTOM';
  btn.addEventListener('click', () => {
    (container as ScrollableElement).wasNearBottom = true;
    scrollToBottom(container);
  });
  container.parentElement?.appendChild(btn);

  let lastScrollTop = container.scrollTop;

  container.addEventListener('scroll', () => {
    const currentScrollTop = container.scrollTop;

    if (isNearBottom(container)) {
      (container as ScrollableElement).wasNearBottom = true;
    } else if (currentScrollTop < lastScrollTop) {
      (container as ScrollableElement).wasNearBottom = false;
    } else if (currentScrollTop > lastScrollTop) {
      (container as ScrollableElement).wasNearBottom = false;
    }

    btn.classList.toggle('visible', !(container as ScrollableElement).wasNearBottom);
    lastScrollTop = currentScrollTop;
  });

  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      if ((container as ScrollableElement).wasNearBottom) {
        scrollToBottom(container);
      }
    });
    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  container.addEventListener('load', (e) => {
    const target = e.target as HTMLElement;
    if (target && target.tagName === 'IMG') {
      if ((container as ScrollableElement).wasNearBottom) {
        scrollToBottom(container);
      }
    }
  }, true);
}
