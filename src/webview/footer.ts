/// <reference lib="dom" />
/**
 * Header & Footer Rendering
 *
 * Model badge formatting, connection status, and TUI status bar updates.
 */
import { escapeHtml } from '../util/util';
import { state } from './state';

// ─── Model Provider Badge ─────────────────────────────

function getModelProvider(modelId: string): string | null {
  const id = modelId.toLowerCase();
  if (id.includes('claude') || id.includes('opus') || id.includes('sonnet') || id.includes('haiku')) return 'claude';
  if (id.includes('deepseek')) return 'deepseek';
  if (id.includes('gpt') || id.includes('o1') || id.includes('o3')) return 'gpt';
  if (id.includes('gemini')) return 'gemini';
  if (id.includes('ollama') || id.includes('llama')) return 'ollama';
  return null;
}

export function formatModelDisplay(modelId: string): string {
  if (!modelId) return 'NONE';
  const provider = getModelProvider(modelId);
  const shortName = modelId.split('/').pop() || modelId;
  if (provider) {
    return `<span class="model-badge"><span class="model-provider ${provider}">${provider.toUpperCase()}</span> ${escapeHtml(shortName)}</span>`;
  }
  return escapeHtml(shortName);
}

// ─── Connection Status ────────────────────────────────

export function updateConnectionStatus(connected: boolean): void {
  const footerStream = document.getElementById('footer-stream');
  if (!footerStream) return;
  const dot = document.createElement('span');
  dot.className = `connection-dot ${connected ? 'connected' : 'disconnected'}`;
  const oldDot = footerStream.querySelector('.connection-dot');
  if (oldDot) oldDot.remove();
  footerStream.prepend(dot);
}

// ─── Header Update ────────────────────────────────────

export function updateHeader(): void {
  const mn = document.getElementById('model-name');
  if (mn) mn.innerHTML = `MODEL // ${formatModelDisplay(state.modelId)}`;
  const pm = document.getElementById('perm-mode');
  if (pm) pm.innerText = `PERM // ${state.permissionMode || 'STANDARD'}`;
  const tc = document.getElementById('token-count');
  if (tc) tc.innerText = `TOKENS // P ${state.tokens.prompt.toLocaleString()} / C ${state.tokens.completion.toLocaleString()} / ${state.tokens.total.toLocaleString()}`;

  const hv = document.getElementById('header-version');
  if (hv) hv.textContent = state.cliVersion || 'v0.0.0';
  const hm = document.getElementById('header-models');
  if (hm) hm.textContent = state.modelsLabel || 'loading...';
  const hc = document.getElementById('header-cwd');
  if (hc) hc.textContent = state.context.workspaceRoot || '~';
}

// ─── Footer Update ────────────────────────────────────

export function updateFooter(): void {
  const el = (id: string) => document.getElementById(id);
  const fModel = el('footer-model');
  const fMode = el('footer-mode');
  const fTokens = el('footer-tokens');
  const fSession = el('footer-session');
  const fTurn = el('footer-turn');
  const fStream = el('footer-stream');

  if (fModel) fModel.innerHTML = `MODEL // ${formatModelDisplay(state.modelId)}`;
  if (fMode) fMode.textContent = `MODE // ${(state.agentMode || 'code').toUpperCase()} · ${state.permissionMode || 'STANDARD'}`;
  if (fTokens) fTokens.textContent = `T // P ${state.tokens.prompt.toLocaleString()} / C ${state.tokens.completion.toLocaleString()} / ${state.tokens.total.toLocaleString()}`;
  if (fSession) fSession.textContent = `SESSION // ${state.currentSessionId ? state.currentSessionId.slice(0, 8) : '--'}`;
  if (fTurn) fTurn.textContent = `TURN // ${state.turnCount}`;
  if (fStream) {
    fStream.classList.toggle('is-active', state.isStreaming);
    const hasDot = fStream.querySelector('.connection-dot');
    if (!hasDot) updateConnectionStatus(true);
  }
}

// ─── Context Panel ────────────────────────────────────

export function updateContextPanel(): void {
  const ctx = state.context;

  const hc = document.getElementById('header-cwd');
  if (hc) hc.textContent = ctx.workspaceRoot || '~';

  const gitBody = document.getElementById('context-git-body');
  if (gitBody) {
    if (ctx.gitBranch) {
      const dirtyText = ctx.dirtyFilesCount > 0
        ? `<span class="context-git-dirty">${ctx.dirtyFilesCount} dirty</span>`
        : '<span style="color:var(--accent)">&#x2713; clean</span>';
      gitBody.innerHTML = `
        <span class="context-git-branch">&#xF4B0; ${escapeHtml(ctx.gitBranch)}</span>
        ${dirtyText}
      `;
    } else {
      gitBody.innerHTML = '<span class="context-muted">No git repo</span>';
    }
  }

  const filesBody = document.getElementById('context-files-body');
  if (filesBody) {
    if (ctx.activeFile || ctx.openFiles.length > 0) {
      let html = '';
      const changedFiles = typeof ctx.dirtyFiles === 'object' && Array.isArray(ctx.dirtyFiles) ? ctx.dirtyFiles : [];
      const isChanged = (path: string) => changedFiles.some((df: string) => df.includes(path));
      if (ctx.activeFile) {
        const changed = isChanged(ctx.activeFile.path);
        html += `<div class="context-file ${changed ? 'changed' : ''}">
          <span class="context-file-path">&#x25B6; ${escapeHtml(ctx.activeFile.path)}</span>
          <span class="context-file-lang">${changed ? '<span class="context-file-change-indicator">&#x2713;</span>' : ctx.activeFile.language}</span>
        </div>`;
      }
      for (const f of ctx.openFiles) {
        if (f.path !== ctx.activeFile?.path) {
          const changed = isChanged(f.path);
          html += `<div class="context-file ${changed ? 'changed' : ''}">
            <span class="context-file-path">${escapeHtml(f.path)}</span>
            <span class="context-file-lang">${changed ? '<span class="context-file-change-indicator">M</span>' : f.language}</span>
          </div>`;
        }
      }
      filesBody.innerHTML = html;
    } else {
      filesBody.innerHTML = '<span class="context-muted">No files open</span>';
    }
  }

  const diagBody = document.getElementById('context-diag-body');
  if (diagBody) {
    if (ctx.diagnosticsCount > 0) {
      diagBody.innerHTML = `
        <div class="context-diag-row">
          <span class="context-diag-error">&#x26A0; ${ctx.diagnosticsCount} issues</span>
          <button class="context-diag-fix-btn" title="Fix diagnostics automatically">🔧 FIX</button>
        </div>
      `;
    } else {
      diagBody.innerHTML = '<span style="color:var(--accent)">&#x2713; No issues</span>';
    }
  }
}
