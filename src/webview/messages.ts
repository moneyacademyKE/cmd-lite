/// <reference lib="dom" />
/**
 * Message Processing and Execution State
 *
 * Handles markdown rendering, structural replacements (thought/tool_call/diff),
 * message DOM appendage, and execution/streaming state updates.
 */
import { marked } from 'marked';
import { escapeHtml } from '../util/util';
import { state } from './state';
import { highlightCode } from './highlight';
import { isNearBottom, scrollToBottom } from './scroll';
import type { ScrollableElement } from './scroll';
import { switchPanel } from './panels';
import { updateFooter, updateConnectionStatus } from './footer';

// ─── Execution State ──────────────────────────────────

export let isExecuting = false;
export let executionStartTime = 0;
export let streamingStartTime = 0;
let statusTimer: ReturnType<typeof setInterval> | null = null;

export function setStreamingStartTime(time: number): void {
  streamingStartTime = time;
}

// ─── Marked Renderer Configuration ───────────────────

marked.use({
  renderer: {
    code({ text, lang }) {
      const highlighted = highlightCode(text, lang || '');
      const hasLang = !!lang;
      return `
        <div class="code-container">
          <div class="code-header">
            <span class="code-lang">${escapeHtml(lang || 'code')}</span>
            <button class="copy-code-btn" data-code="${encodeURIComponent(text)}">COPY</button>
          </div>
          <pre><code class="${hasLang ? 'language-' + escapeHtml(lang) : ''}">${highlighted}</code></pre>
        </div>
      `;
    },
  },
});

// ─── Status Timer ─────────────────────────────────────

function formatDuration(ms: number): string {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatThoughtDuration(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return seconds === 1 ? '1 second' : `${seconds} seconds`;
}

export function startStatusTimer(): void {
  const statusEl = document.getElementById('tui-active-status');
  if (!statusEl) return;
  statusEl.classList.remove('hidden');
  executionStartTime = Date.now();
  const spinnerEl = statusEl.querySelector('.tui-status-spinner') as HTMLElement;
  const timeEl = statusEl.querySelector('.tui-status-time') as HTMLElement;
  const tokensEl = statusEl.querySelector('.tui-status-tokens') as HTMLElement;
  const spinnerFrames = ['o', 'O', 'o', '.'];
  let frameIndex = 0;
  if (timeEl) timeEl.innerHTML = `&bull; 0s`;
  if (tokensEl) tokensEl.innerHTML = `&bull; &darr; 0`;
  statusTimer = setInterval(() => {
    const elapsed = Date.now() - executionStartTime;
    if (timeEl) timeEl.innerHTML = `&bull; ${formatDuration(elapsed)}`;
    if (spinnerEl) { spinnerEl.innerText = spinnerFrames[frameIndex]; frameIndex = (frameIndex + 1) % spinnerFrames.length; }
    if (tokensEl) tokensEl.innerHTML = `&bull; &darr; ${state.tokens.total.toLocaleString()}`;
  }, 250);
}

export function stopStatusTimer(): void {
  if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }
  const statusEl = document.getElementById('tui-active-status');
  if (statusEl) statusEl.classList.add('hidden');
}

// ─── Streaming Cursor ─────────────────────────────────

export function updateStreamingCursor(): void {
  const history = document.getElementById('chat-history');
  if (!history) return;
  const existing = document.getElementById('streaming-cursor');
  if (state.isStreaming) {
    if (!existing) {
      const cursor = document.createElement('div');
      cursor.id = 'streaming-cursor';
      cursor.className = 'streaming-cursor';
      history.appendChild(cursor);
      scrollToBottom(history);
    }
  } else {
    if (existing) existing.remove();
  }
}

export function setExecutingState(executing: boolean): void {
  isExecuting = executing;
  state.isStreaming = executing;
  const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
  const input = document.getElementById('chat-input') as HTMLTextAreaElement;
  if (sendBtn) {
    sendBtn.disabled = executing;
    sendBtn.innerText = executing ? 'RUNNING...' : 'EXECUTE';
    sendBtn.style.opacity = executing ? '0.5' : '1';
    sendBtn.style.cursor = executing ? 'not-allowed' : 'pointer';
  }
  if (input) { input.disabled = executing; if (!executing) input.focus(); }
  updateFooter();
  updateStreamingCursor();
  if (executing) { updateConnectionStatus(true); startStatusTimer(); }
  else { stopStatusTimer(); }
}

// ─── Message Processing ──────────────────────────────

export function renderDiffProposalHtml(id: string, diffText: string, response?: 'accept' | 'reject'): string {
  const diffLines = escapeHtml(diffText)
    .replace(/^(\+.*)$/gm, '<span class="diff-line add">$1</span>')
    .replace(/^(-.*)$/gm, '<span class="diff-line sub">$1</span>');
  if (response) {
    return `<div class="diff-widget"><div class="diff-header"><span>PROPOSAL</span><div class="diff-actions"><span style="color:var(--accent)">[${response.toUpperCase()}]</span></div></div><div class="diff-content">${diffLines}</div></div>`;
  }
  return `<div class="diff-widget"><div class="diff-header"><span>PROPOSAL</span><div class="diff-actions"><button class="diff-btn accept" data-id="${id}">ACCEPT</button><button class="diff-btn reject" data-id="${id}">REJECT</button></div></div><div class="diff-content">${diffLines}</div></div>`;
}

function applyStructuralReplacements(raw: string): string {
  let processed = raw;
  processed = processed.replace(/<thought>([\s\S]*?)<\/thought>/gi, (_m: string, inner: string) => {
    const html = marked.parse(inner.trim()) as string;
    return `<details class="step-accordion" open><summary>Thought ${streamingStartTime ? 'for ' + formatThoughtDuration(Date.now() - streamingStartTime) + ' ' : ''}[ctrl+o to expand]</summary><div class="thought-content">${html}</div></details>`;
  });
  processed = processed.replace(/<tool_call>([\s\S]*?)<\/tool_call>/gi, (_m: string, inner: string) => {
    const nameMatch = inner.match(/name:\s*(\S+)/);
    const toolName = nameMatch ? nameMatch[1] : 'unknown';
    return `<div class="tool-call"><span class="tool-call-header">&#x1F527; TOOL CALL // ${escapeHtml(toolName)}</span><pre class="tool-call-body">${escapeHtml(inner)}</pre></div>`;
  });
  processed = processed.replace(/<result>([\s\S]*?)<\/result>/gi, (_m: string, inner: string) => {
    return `<div class="tool-result"><span class="tool-call-header">&#x1F4CB; RESULT</span><pre class="tool-call-body">${escapeHtml(inner)}</pre></div>`;
  });
  processed = processed.replace(/```diff\n([\s\S]*?)```/g, (_m: string, inner: string) => {
    const formatted = inner.split('\n').map((line) => {
      if (line.startsWith('+')) return `<span class="diff-line add">${escapeHtml(line)}</span>`;
      if (line.startsWith('-')) return `<span class="diff-line sub">${escapeHtml(line)}</span>`;
      if (line.startsWith('@@')) return `<span class="diff-line hunks">${escapeHtml(line)}</span>`;
      return escapeHtml(line);
    }).join('\n');
    return `<pre class="diff-block">${formatted}</pre>`;
  });
  return processed;
}

export function processMessageContentLight(raw: string): string {
  if (raw.startsWith('<img') || raw.startsWith('<div class="diff-widget"') || raw.startsWith('<div class="code-container"')) return raw;
  return applyStructuralReplacements(raw);
}

export function processMessageContent(raw: string): string {
  if (raw.startsWith('<img') || raw.startsWith('<div class="diff-widget"') || raw.startsWith('<div class="code-container"')) return raw;
  const processed = applyStructuralReplacements(raw);
  if (processed === raw) return marked.parse(raw) as string;
  return processed;
}

// ─── Message Rendering ────────────────────────────────

export function appendMessage(m: { id: string; role: string; content: string }, streaming?: boolean): void {
  const history = document.getElementById('chat-history');
  if (!history) return;
  switchPanel('chat');
  const onboarding = history.querySelector('.onboarding-welcome');
  if (onboarding) onboarding.remove();
  if (m.role === 'user') (history as ScrollableElement).wasNearBottom = true;
  const shouldScroll = (history as ScrollableElement).wasNearBottom || isNearBottom(history);
  let div = document.getElementById(m.id);
  if (!div) { div = document.createElement('div'); div.id = m.id; div.className = `message message-${m.role}`; history.appendChild(div); }
  let contentToRender = m.content;
  if ((m.role === 'system' || m.role === 'agent') && !contentToRender.startsWith('⠶') && !contentToRender.startsWith('<img') && !contentToRender.startsWith('<div class="diff-widget"')) {
    contentToRender = '⠶ ' + contentToRender;
  }
  let parsedContent: string;
  try { parsedContent = streaming ? processMessageContentLight(contentToRender) : processMessageContent(contentToRender); }
  catch { parsedContent = `<pre>${escapeHtml(contentToRender)}</pre>`; }
  div.innerHTML = `<span class="message-role">${m.role}</span><div class="message-content">${parsedContent}</div>`;
  if (div.classList.contains('message-system')) {
    const lower = m.content.toLowerCase();
    if (lower.includes('**error:**') || lower.includes('error (exit')) div.classList.add('is-error');
    else if (lower.includes('_(') || lower.includes('cancelled')) div.classList.add('is-warning');
    else if (lower.includes('completed') || lower.includes('done') || lower.includes('✓')) div.classList.add('is-success');
  }
  if (shouldScroll) { (history as ScrollableElement).wasNearBottom = true; scrollToBottom(history); }
}
