/// <reference lib="dom" />
/**
 * TUI-Inspired Webview Renderer
 *
 * Mirrors the Command Code CLI TUI experience: persistent status footer,
 * context sidebar, structured message rendering (thought accordions, tool
 * calls, diff blocks), and session-aware state tracking for long-horizon goals.
 */
import { marked } from 'marked';

// @ts-expect-error acquireVsCodeApi is provided by VS Code webview
const vscode = acquireVsCodeApi();

interface SessionItem {
  id: string;
  label: string;
  model?: string;
  goalStatus?: string;
  startedAt?: number;
}

interface ContextInfo {
  workspaceRoot: string;
  activeFile: { path: string; language: string } | null;
  openFiles: Array<{ path: string; language: string; isActive: boolean }>;
  gitBranch: string | null;
  dirtyFilesCount: number;
  diagnosticsCount: number;
}

const state: {
  tokens: { prompt: number; completion: number; total: number };
  modelId: string;
  permissionMode: string;
  statusText: string;
  sessions?: SessionItem[];
  currentSessionId: string | null;
  turnCount: number;
  isStreaming: boolean;
  context: ContextInfo;
} = {
  tokens: { prompt: 0, completion: 0, total: 0 },
  modelId: '',
  permissionMode: '',
  statusText: '',
  currentSessionId: null,
  turnCount: 0,
  isStreaming: false,
  context: {
    workspaceRoot: '',
    activeFile: null,
    openFiles: [],
    gitBranch: null,
    dirtyFilesCount: 0,
    diagnosticsCount: 0,
  },
};

let isExecuting = false;

// ─── Utilities ───────────────────────────────────────

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Footer Status Bar ────────────────────────────────

function updateFooter() {
  const el = (id: string) => document.getElementById(id);
  const fModel = el('footer-model');
  const fMode = el('footer-mode');
  const fTokens = el('footer-tokens');
  const fSession = el('footer-session');
  const fTurn = el('footer-turn');
  const fStream = el('footer-stream');

  if (fModel) fModel.textContent = `MODEL // ${state.modelId || 'NONE'}`;
  if (fMode) fMode.textContent = `MODE // ${state.permissionMode || 'STANDARD'}`;
  if (fTokens)
    fTokens.textContent = `T // P ${state.tokens.prompt.toLocaleString()} / C ${state.tokens.completion.toLocaleString()} / ${state.tokens.total.toLocaleString()}`;
  if (fSession)
    fSession.textContent = `SESSION // ${state.currentSessionId ? state.currentSessionId.slice(0, 8) : '--'}`;
  if (fTurn) fTurn.textContent = `TURN // ${state.turnCount}`;
  if (fStream) fStream.classList.toggle('is-active', state.isStreaming);
}

// ─── Context Sidebar ──────────────────────────────────

function updateContextPanel() {
  const ctx = state.context;

  const gitBody = document.getElementById('context-git-body');
  if (gitBody) {
    if (ctx.gitBranch) {
      const dirtyText =
        ctx.dirtyFilesCount > 0
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
      if (ctx.activeFile) {
        html += `<div class="context-file">
          <span class="context-file-path">&#x25B6; ${escapeHtml(ctx.activeFile.path)}</span>
          <span class="context-file-lang">${ctx.activeFile.language}</span>
        </div>`;
      }
      for (const f of ctx.openFiles) {
        if (f.path !== ctx.activeFile?.path) {
          html += `<div class="context-file">
            <span class="context-file-path">${escapeHtml(f.path)}</span>
            <span class="context-file-lang">${f.language}</span>
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
      diagBody.innerHTML = `<span class="context-diag-error">&#x26A0; ${ctx.diagnosticsCount} issues</span>`;
    } else {
      diagBody.innerHTML = '<span style="color:var(--accent)">&#x2713; No issues</span>';
    }
  }
}

// ─── Streaming Cursor ─────────────────────────────────

function updateStreamingCursor() {
  const history = document.getElementById('chat-history');
  if (!history) return;
  const existing = document.getElementById('streaming-cursor');
  if (state.isStreaming) {
    if (!existing) {
      const cursor = document.createElement('div');
      cursor.id = 'streaming-cursor';
      cursor.className = 'streaming-cursor';
      history.appendChild(cursor);
      history.scrollTop = history.scrollHeight;
    }
  } else {
    if (existing) existing.remove();
  }
}

// ─── Executing State ──────────────────────────────────

function setExecutingState(executing: boolean) {
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
  if (input) {
    input.disabled = executing;
    if (!executing) input.focus();
  }
  updateFooter();
  updateStreamingCursor();
}

// ─── Enhanced Message Processing ──────────────────────

function processMessageContent(raw: string): string {
  // If it's already HTML (images or diff widgets), return as-is
  if (raw.startsWith('<img') || raw.startsWith('<div class="diff-widget"')) {
    return raw;
  }

  let processed = raw;

  // Turn <thought> blocks into expandable accordions
  processed = processed.replace(
    /<thought>([\s\S]*?)<\/thought>/gi,
    (_m: string, inner: string) => {
      const html = marked.parse(inner.trim()) as string;
      return `<details class="step-accordion" open><summary>&#x1F914; Reasoning</summary><div class="thought-content">${html}</div></details>`;
    },
  );

  // Turn <tool_call> blocks into tool call widgets
  processed = processed.replace(
    /<tool_call>([\s\S]*?)<\/tool_call>/gi,
    (_m: string, inner: string) => {
      const nameMatch = inner.match(/name:\s*(\S+)/);
      const toolName = nameMatch ? nameMatch[1] : 'unknown';
      return `<div class="tool-call"><span class="tool-call-header">&#x1F527; TOOL CALL // ${escapeHtml(toolName)}</span><pre class="tool-call-body">${escapeHtml(inner)}</pre></div>`;
    },
  );

  // Turn <result> blocks into result widgets
  processed = processed.replace(
    /<result>([\s\S]*?)<\/result>/gi,
    (_m: string, inner: string) => {
      return `<div class="tool-result"><span class="tool-call-header">&#x1F4CB; RESULT</span><pre class="tool-call-body">${escapeHtml(inner)}</pre></div>`;
    },
  );

  // Highlight ```diff blocks
  processed = processed.replace(
    /```diff\n([\s\S]*?)```/g,
    (_m: string, inner: string) => {
      const lines = inner.split('\n');
      const formatted = lines
        .map((line) => {
          if (line.startsWith('+'))
            return `<span class="diff-line add">${escapeHtml(line)}</span>`;
          if (line.startsWith('-'))
            return `<span class="diff-line sub">${escapeHtml(line)}</span>`;
          if (line.startsWith('@@'))
            return `<span class="diff-line hunks">${escapeHtml(line)}</span>`;
          return escapeHtml(line);
        })
        .join('\n');
      return `<pre class="diff-block">${formatted}</pre>`;
    },
  );

  // If nothing matched, run through marked parser
  if (processed === raw) {
    processed = marked.parse(raw) as string;
  }

  return processed;
}

// ─── Message Rendering ────────────────────────────────

function appendMessage(m: { id: string; role: string; content: string }) {
  const history = document.getElementById('chat-history');
  if (!history) return;
  switchPanel('chat');
  let div = document.getElementById(m.id);
  if (!div) {
    div = document.createElement('div');
    div.id = m.id;
    div.className = `message message-${m.role}`;
    history.appendChild(div);
  }

  let parsedContent: string;
  try {
    parsedContent = processMessageContent(m.content);
  } catch {
    parsedContent = `<pre>${escapeHtml(m.content)}</pre>`;
  }

  div.innerHTML = `<span class="message-role">${m.role}</span><div class="message-content">${parsedContent}</div>`;
  history.scrollTop = history.scrollHeight;
}

// ─── Panel System ─────────────────────────────────────

function switchPanel(panel: 'chat' | 'sessions' | 'status' | 'agents') {
  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('panel-active'));
  const target = document.getElementById(`${panel}-panel`);
  if (target) target.classList.add('panel-active');
}

// ─── Renderers ────────────────────────────────────────

function renderSessionList(sessions: SessionItem[]) {
  const list = document.getElementById('session-list');
  if (!list) return;
  switchPanel('sessions');
  if (sessions.length === 0) {
    list.innerHTML = '<div class="session-empty">No recent sessions.</div>';
    return;
  }
  list.innerHTML = sessions
    .map(
      (s) => `
    <div class="session-item" data-session-id="${s.id}">
      <span class="session-icon">${s.goalStatus === 'completed' ? '\u2713' : '\u25CB'}</span>
      <div class="session-info">
        <span class="session-label">${escapeHtml(s.label)}</span>
        <span class="session-meta">${s.model ? s.model.split('/').pop() : 'unknown'} \u00B7 ${s.id.slice(0, 8)}</span>
      </div>
    </div>
  `,
    )
    .join('');
}

function renderAgentList(agents: { name: string; task: string }[]) {
  const list = document.getElementById('agent-list');
  if (!list) return;
  switchPanel('agents');
  if (agents.length === 0) {
    list.innerHTML = '<div class="session-empty">No active agents.</div>';
    return;
  }
  list.innerHTML = agents
    .map(
      (a) => `
    <div class="agent-item">
      <span class="agent-icon">&#x2699;</span>
      <div class="agent-info">
        <span class="agent-name">${escapeHtml(a.name)}</span>
        <span class="agent-task">${escapeHtml(a.task)}</span>
      </div>
    </div>
  `,
    )
    .join('');
}

function renderStatus(text: string) {
  const content = document.getElementById('status-content');
  if (!content) return;
  switchPanel('status');
  content.textContent = text;
}

// ─── Event Listeners ─────────────────────────────────

function sendAction(action: string, payload?: Record<string, unknown>) {
  vscode.postMessage({ type: 'action', action, payload });
}

function attachEventListeners() {
  // Action buttons
  document.querySelectorAll('.action-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.action;
      if (!action) return;

      if (action === 'toggle-context') {
        const sidebar = document.getElementById('context-panel');
        if (sidebar) sidebar.classList.toggle('hidden');
        return;
      }

      if (action === 'list-sessions') {
        sendAction('list-sessions');
      } else if (action === 'show-status') {
        sendAction('show-status');
      } else {
        sendAction(action);
      }
    });
  });

  // Panel close buttons
  document.querySelectorAll('.panel-close').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = (btn as HTMLElement).dataset.panel;
      if (panel && panel !== 'context') switchPanel('chat');
      else if (panel === 'context') {
        const sidebar = document.getElementById('context-panel');
        if (sidebar) sidebar.classList.add('hidden');
      }
    });
  });

  // Session list click delegation
  const sessionList = document.getElementById('session-list');
  sessionList?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const item = target.closest('.session-item') as HTMLElement;
    if (item && item.dataset.sessionId) {
      sendAction('resume-session', { sessionId: item.dataset.sessionId });
    }
  });

  // Chat input
  const input = document.getElementById('chat-input') as HTMLTextAreaElement;
  const sendBtn = document.getElementById('send-btn');

  const sendMessage = () => {
    if (input && input.value.trim() && !isExecuting) {
      setExecutingState(true);
      const prompt = input.value;
      vscode.postMessage({
        type: 'chatInput',
        payload: { prompt },
      });
      appendMessage({ id: 'local-' + Date.now(), role: 'user', content: prompt });
      input.value = '';
    }
  };

  sendBtn?.addEventListener('click', sendMessage);
  input?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Drag and Drop for context
  const inputContainer = document.querySelector(
    '.chat-input-container',
  ) as HTMLElement;
  if (inputContainer) {
    inputContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      inputContainer.classList.add('dropzone-active');
    });
    inputContainer.addEventListener('dragleave', (e) => {
      e.preventDefault();
      inputContainer.classList.remove('dropzone-active');
    });
    inputContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      inputContainer.classList.remove('dropzone-active');
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
          sendAction('file-dropped', {
            name: file.name,
            type: file.type,
            data: ev.target?.result,
          });
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Diff button delegation
  const chatHistory = document.getElementById('chat-history');
  chatHistory?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('diff-btn')) {
      const action = target.classList.contains('accept') ? 'accept' : 'reject';
      const id = target.dataset.id;
      if (id) {
        sendAction('respond-diff', { id, response: action });
        target.parentElement!.innerHTML = `<span style="color:var(--accent)">[${action.toUpperCase()}]</span>`;
      }
    }
  });

  // Context file click — send action to open file (future use)
  document.getElementById('context-panel')?.addEventListener('click', (e) => {
    const fileRow = (e.target as HTMLElement).closest('.context-file');
    if (fileRow) {
      const pathEl = fileRow.querySelector('.context-file-path');
      if (pathEl) {
        const path = pathEl.textContent?.replace(/^▶ /, '').trim();
        if (path) sendAction('open-context-file', { path });
      }
    }
  });
}

// ─── UI Initialization ────────────────────────────────

function initUI() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <div class="crosshair tl"></div>
    <div class="crosshair tr"></div>
    <div class="crosshair bl"></div>
    <div class="crosshair br"></div>

    <div class="header">
      <h2>Command Code</h2>
      <div class="metrics">
        <span class="metric" id="token-count">TOKENS // P ${state.tokens.prompt.toLocaleString()} / C ${state.tokens.completion.toLocaleString()} / ${state.tokens.total.toLocaleString()}</span>
        <span class="metric" id="model-name">MODEL // ${state.modelId || 'NONE'}</span>
        <span class="metric" id="perm-mode">PERM // ${state.permissionMode || 'STANDARD'}</span>
      </div>
    </div>

    <div class="action-bar">
      <button class="action-btn" data-action="start" title="Start New Session">&#x25B6; START</button>
      <button class="action-btn" data-action="continue" title="Continue Last Session">&#x21BB; CONTINUE</button>
      <button class="action-btn" data-action="list-sessions" title="Recent Sessions">&#x2630; SESSIONS</button>
      <button class="action-btn" data-action="list-agents" title="Active Agents">&#x2691; AGENTS</button>
      <button class="action-btn" data-action="toggle-context" title="Toggle Context Panel">&#x2630; CTX</button>
      <button class="action-btn" data-action="pick-model" title="Pick Model">&#x2699; MODEL</button>
      <button class="action-btn" data-action="pick-permission" title="Pick Permission">&#x2699; PERM</button>
      <button class="action-btn" data-action="show-status" title="Show Status">&#x2139; STATUS</button>
    </div>

    <div class="main-content">
      <div class="panel-container">
        <div id="chat-panel" class="panel panel-active">
          <div class="chat-history" id="chat-history"></div>
          <div class="chat-input-container">
            <textarea id="chat-input" placeholder="Type a message..."></textarea>
            <div class="chat-input-row">
              <div class="qr-code"></div>
              <button id="send-btn">Execute</button>
            </div>
          </div>
        </div>

        <div id="sessions-panel" class="panel">
          <div class="panel-header">
            <span>RECENT SESSIONS</span>
            <button class="panel-close" data-panel="sessions">&#x2715;</button>
          </div>
          <div class="session-list" id="session-list"></div>
        </div>

        <div id="agents-panel" class="panel">
          <div class="panel-header">
            <span>ACTIVE AGENTS</span>
            <button class="panel-close" data-panel="agents">&#x2715;</button>
          </div>
          <div class="session-list" id="agent-list"></div>
        </div>

        <div id="status-panel" class="panel">
          <div class="panel-header">
            <span>STATUS</span>
            <button class="panel-close" data-panel="status">&#x2715;</button>
          </div>
          <pre class="status-content" id="status-content"></pre>
        </div>
      </div>

      <div id="context-panel" class="sidebar hidden">
        <div class="panel-header">
          <span>CONTEXT</span>
          <button class="panel-close" data-panel="context">&#x2715;</button>
        </div>
        <div class="context-section">
          <div class="context-section-title">GIT</div>
          <div class="context-section-body" id="context-git-body">
            <span class="context-muted">No git data</span>
          </div>
        </div>
        <div class="context-section">
          <div class="context-section-title">FILES</div>
          <div class="context-section-body" id="context-files-body">
            <span class="context-muted">No files open</span>
          </div>
        </div>
        <div class="context-section">
          <div class="context-section-title">DIAGNOSTICS</div>
          <div class="context-section-body" id="context-diag-body">
            <span class="context-muted">No diagnostics</span>
          </div>
        </div>
      </div>
    </div>

    <div class="footer-bar">
      <span class="footer-item" id="footer-model">MODEL // ${state.modelId || 'NONE'}</span>
      <span class="footer-item" id="footer-mode">MODE // ${state.permissionMode || 'STANDARD'}</span>
      <span class="footer-item" id="footer-tokens">T // P 0 / C 0 / 0</span>
      <span class="footer-item" id="footer-session">SESSION // --</span>
      <span class="footer-item" id="footer-turn">TURN // 0</span>
      <span class="footer-item streaming-indicator" id="footer-stream"></span>
    </div>
  `;

  attachEventListeners();
  updateFooter();
}

// ─── Message Event Handler ────────────────────────────

window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data;
  if (message?.jsonrpc === '2.0' && message.method === 'webview/dispatchEvent') {
    const { type, payload } = message.params;

    switch (type) {
      case 'RenderMessage': {
        const { id, role, content } = payload as {
          id: string;
          role: string;
          content: string;
        };
        appendMessage({ id, role, content });
        break;
      }

      case 'RenderImage': {
        const { id, role, dataUri } = payload as {
          id: string;
          role: string;
          dataUri: string;
        };
        appendMessage({
          id,
          role,
          content: `<img src="${dataUri}" class="chat-image" />`,
        });
        break;
      }

      case 'RenderDiffProposal': {
        const { id, diffText } = payload as { id: string; diffText: string };
        const html = `
          <div class="diff-widget">
            <div class="diff-header">
              <span>PROPOSAL</span>
              <div class="diff-actions">
                <button class="diff-btn accept" data-id="${id}">ACCEPT</button>
                <button class="diff-btn reject" data-id="${id}">REJECT</button>
              </div>
            </div>
            <div class="diff-content">${escapeHtml(diffText)
              .replace(/^(\+.*)$/gm, '<span class="diff-line add">$1</span>')
              .replace(/^(-.*)$/gm, '<span class="diff-line sub">$1</span>')}</div>
          </div>
        `;
        appendMessage({ id, role: 'system', content: html });
        break;
      }

      case 'UpdateAgents': {
        renderAgentList(payload.agents ?? []);
        break;
      }

      case 'UpdateTokens': {
        state.tokens = payload;
        const tc = document.getElementById('token-count');
        if (tc)
          tc.innerText = `TOKENS // P ${state.tokens.prompt.toLocaleString()} / C ${state.tokens.completion.toLocaleString()} / ${state.tokens.total.toLocaleString()}`;
        updateFooter();
        break;
      }

      case 'StreamMessageChunk': {
        const { id, role, chunk } = payload as {
          id: string;
          role: string;
          chunk: string;
        };
        const history = document.getElementById('chat-history');
        if (!history) break;
        switchPanel('chat');

        let div = document.getElementById(id);
        if (!div) {
          div = document.createElement('div');
          div.id = id;
          div.className = `message message-${role}`;
          div.dataset.raw = '';
          history.appendChild(div);
          // Remove streaming cursor when first chunk arrives
          const cursor = document.getElementById('streaming-cursor');
          if (cursor) cursor.remove();
        }

        div.dataset.raw += chunk;

        const raw = div.dataset.raw ?? '';
        let parsedContent: string;
        try {
          parsedContent = processMessageContent(raw);
        } catch {
          parsedContent = `<pre>${escapeHtml(raw)}</pre>`;
        }

        div.innerHTML = `<span class="message-role">${role}</span><div class="message-content">${parsedContent}</div>`;
        history.scrollTop = history.scrollHeight;
        break;
      }

      case 'StreamFinished': {
        setExecutingState(false);
        break;
      }

      case 'StdoutChunk': {
        const content = document.getElementById('status-content');
        if (content) {
          switchPanel('status');
          content.textContent += payload.chunk;
          content.scrollTop = content.scrollHeight;
        }
        break;
      }

      case 'initState': {
        const { modelId, permissionMode, tokens, sessionId, turnCount } =
          payload as {
            modelId: string;
            permissionMode: string;
            tokens: {
              prompt: number;
              completion: number;
              total: number;
            };
            sessionId?: string;
            turnCount?: number;
          };
        state.modelId = modelId;
        state.permissionMode = permissionMode;
        state.tokens = tokens;
        state.currentSessionId = sessionId ?? null;
        state.turnCount = turnCount ?? 0;

        const mn = document.getElementById('model-name');
        if (mn) mn.innerText = `MODEL // ${state.modelId || 'NONE'}`;
        const pm = document.getElementById('perm-mode');
        if (pm)
          pm.innerText = `PERM // ${state.permissionMode || 'STANDARD'}`;
        const tc = document.getElementById('token-count');
        if (tc)
          tc.innerText = `TOKENS // P ${state.tokens.prompt.toLocaleString()} / C ${state.tokens.completion.toLocaleString()} / ${state.tokens.total.toLocaleString()}`;
        updateFooter();
        break;
      }

      case 'permChanged': {
        state.permissionMode = payload.permissionMode;
        const pm = document.getElementById('perm-mode');
        if (pm)
          pm.innerText = `PERM // ${state.permissionMode || 'STANDARD'}`;
        updateFooter();
        break;
      }

      case 'modelChanged':
      case 'ModelChanged': {
        state.modelId = payload.modelId;
        const mn = document.getElementById('model-name');
        if (mn) mn.innerText = `MODEL // ${state.modelId || 'NONE'}`;
        updateFooter();
        break;
      }

      case 'SessionList': {
        state.sessions = payload.sessions ?? [];
        renderSessionList(state.sessions ?? []);
        break;
      }

      case 'StatusResult': {
        setExecutingState(false);
        state.statusText = payload.text ?? '';
        renderStatus(state.statusText);
        break;
      }

      case 'Notification': {
        appendMessage({
          id: 'sys-' + Date.now(),
          role: 'system',
          content: payload.text,
        });
        break;
      }

      case 'BackgroundTaskNotification': {
        const data = payload.data as Record<string, unknown> | undefined;
        const title =
          typeof data?.title === 'string'
            ? data.title
            : 'Background Task Completed';
        const message =
          typeof data?.message === 'string'
            ? data.message
            : 'A background task has finished execution.';
        const html = `
          <div class="diff-widget" style="border-color: var(--vscode-notificationsInfoIcon-foreground);">
            <div class="diff-header" style="background: var(--vscode-notificationsInfoIcon-foreground); color: var(--vscode-editor-background);">
              <span>&#x1F514; NOTIFICATION</span>
            </div>
            <div class="diff-content" style="padding: 8px;">
              <strong>${escapeHtml(title)}</strong><br/>
              ${escapeHtml(message)}
            </div>
          </div>
        `;
        appendMessage({ id: 'bg-' + Date.now(), role: 'system', content: html });
        break;
      }

      case 'UpdateContext': {
        const { workspace, activeFile, openFiles, git } = payload as {
          workspace?: { rootPath: string };
          activeFile?: { relativePath: string; language: string };
          openFiles?: Array<{
            relativePath: string;
            language: string;
            isActive?: boolean;
          }>;
          git?: { branch: string; dirtyFiles: Array<unknown> };
        };
        state.context.workspaceRoot = workspace?.rootPath ?? '';
        state.context.activeFile = activeFile
          ? { path: activeFile.relativePath, language: activeFile.language }
          : null;
        state.context.openFiles = (openFiles ?? []).map((f) => ({
          path: f.relativePath,
          language: f.language,
          isActive: f.isActive ?? false,
        }));
        state.context.gitBranch = git?.branch ?? null;
        state.context.dirtyFilesCount = git?.dirtyFiles?.length ?? 0;
        updateContextPanel();
        break;
      }

      case 'UpdateSessionInfo': {
        const { sessionId, turnCount: tCount } = payload as {
          sessionId: string;
          turnCount: number;
        };
        state.currentSessionId = sessionId;
        state.turnCount = tCount ?? 0;
        updateFooter();
        break;
      }

      case 'UpdateTurnCount': {
        state.turnCount = payload.turnCount;
        updateFooter();
        break;
      }

      case 'UpdateDiagnostics': {
        const diags = payload.diagnostics as
          | Array<{ diagnostics: Array<unknown> }>
          | undefined;
        state.context.diagnosticsCount =
          diags?.reduce(
            (sum: number, f: { diagnostics: unknown[] }) =>
              sum + (f.diagnostics?.length ?? 0),
            0,
          ) ?? 0;
        updateContextPanel();
        break;
      }
    }
  }
});

initUI();
