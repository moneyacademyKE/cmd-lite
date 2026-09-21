/// <reference lib="dom" />
/**
 * TUI-Inspired Webview Renderer — Main Entry Point
 *
 * Slim orchestration hub that imports focused modules and wires together
 * the event handling, UI initialization, and JSON-RPC message dispatch.
 */
import {
  vscode, state, saveState, addOrUpdateMessage, restoreState, sendAction,
} from './state';
import type { MessageItem, LoopIterationItem } from './state';
import {
  isNearBottom, scrollToBottom, setupScrollButton, getActiveScrollContainer,
} from './scroll';
import { cleanAndColorAnsi } from './highlight';
import { showToast } from './toast';
import { updateHeader, updateFooter, updateContextPanel } from './footer';
import {
  handleInputOrCursorChange, adjustTextareaHeight, hideAutocomplete,
  isAutocompleteActive, insertAutocompleteSelection,
  navigateAutocompleteDown, navigateAutocompleteUp,
} from './input';
import {
  isExecuting, setExecutingState, appendMessage, processMessageContent,
  renderDiffProposalHtml, setStreamingStartTime, streamingStartTime,
} from './messages';
import {
  switchPanel, renderSessionList, renderAgentList,
  renderLoopPanel, renderMcpPanel, renderStatus,
} from './panels';
import { buildAppHtml, buildOnboardingHtml } from './layout';



// ─── Taste UI ─────────────────────────────────────────

function updateTasteUI(): void {
  const toggle = document.getElementById('tui-taste-toggle');
  if (toggle) {
    toggle.innerHTML = state.continuousLearning ? '&#9745; TASTE' : '&#9634; TASTE';
    toggle.classList.toggle('active', state.continuousLearning);
  }
}

// ─── UI Hydration ─────────────────────────────────────

function hydrateUI(): void {
  const history = document.getElementById('chat-history');
  if (!history) return;
  history.innerHTML = '';
  if (state.messages.length === 0) {
    history.innerHTML = buildOnboardingHtml();
  } else {
    state.messages.forEach(m => {
      const div = document.createElement('div');
      div.id = m.id;
      div.className = `message message-${m.role}`;
      if (m.raw) div.dataset.raw = m.raw;
      let content = m.content;
      if ((m.role === 'system' || m.role === 'agent') && !content.startsWith('⠶') && !content.startsWith('<img') && !content.startsWith('<div class="diff-widget"')) {
        content = '⠶ ' + content;
      }
      div.innerHTML = `<span class="message-role">${m.role}</span><div class="message-content">${processMessageContent(content)}</div>`;
      history.appendChild(div);
    });
  }
  scrollToBottom(history);
  switchPanel(state.activePanel);
  const input = document.getElementById('chat-input') as HTMLTextAreaElement;
  if (input) { input.value = state.inputDraft; adjustTextareaHeight(input); }
  const statusContent = document.getElementById('status-content');
  if (statusContent && state.statusText) statusContent.innerHTML = cleanAndColorAnsi(state.statusText);
  if (state.agents && state.agents.length > 0) renderAgentList(state.agents);
  if (state.loop) renderLoopPanel(state.loop);
  if (state.mcpServers.length > 0) renderMcpPanel(state.mcpServers);
  updateHeader(); updateFooter(); updateContextPanel(); updateTasteUI();
}



// ─── Event Listeners (wiring) ─────────────────────────

function attachEventListeners(): void {
  // Action buttons
  document.querySelectorAll('.action-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.action;
      if (!action) return;
      if (action === 'toggle-context') { document.getElementById('context-panel')?.classList.toggle('hidden'); return; }
      if (['start', 'continue', 'pick-model', 'pick-permission', 'show-status', 'list-sessions'].includes(action)) {
        btn.classList.add('loading'); setTimeout(() => btn.classList.remove('loading'), 3000);
      }
      if (action === 'list-agents') { switchPanel('agents'); return; }
      if (action === 'list-loops') { renderLoopPanel(); return; }
      if (action === 'list-mcp') { renderMcpPanel(); return; }
      sendAction(action === 'list-sessions' || action === 'generate-mcp-config' || action === 'show-status' ? action : action);
    });
  });

  // Panel close
  document.querySelectorAll('.panel-close').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = (btn as HTMLElement).dataset.panel;
      if (panel && panel !== 'context') switchPanel('chat');
      else if (panel === 'context') document.getElementById('context-panel')?.classList.add('hidden');
    });
  });

  // Session clicks
  document.getElementById('session-list')?.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest('.session-item') as HTMLElement;
    if (item?.dataset.sessionId) sendAction('resume-session', { sessionId: item.dataset.sessionId });
  });

  // Loop clicks
  document.getElementById('loop-list')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const reportEntry = target.closest('[data-report-path]') as HTMLElement | null;
    if (reportEntry?.dataset.reportPath) { sendAction('open-loop-report-path', { reportPath: reportEntry.dataset.reportPath }); return; }
    const button = target.closest('[data-action]') as HTMLElement | null;
    const action = button?.dataset.action;
    if (action === 'stop-loop' || action === 'open-loop-report') sendAction(action);
  });

  // Chat input
  const input = document.getElementById('chat-input') as HTMLTextAreaElement;
  const sendBtn = document.getElementById('send-btn');
  const sendMessage = () => {
    if (!input || !input.value.trim() || isExecuting) return;
    const rawPrompt = input.value.trim();
    input.value = ''; state.inputDraft = ''; saveState(); adjustTextareaHeight(input); hideAutocomplete();
    if (rawPrompt.startsWith('/')) { handleSlashCommand(rawPrompt); return; }
    if (rawPrompt.startsWith('!')) { handleBashCommand(rawPrompt); return; }
    setExecutingState(true);
    vscode.postMessage({ type: 'chatInput', payload: { prompt: rawPrompt } });
    const userMsg = { id: 'local-' + Date.now(), role: 'user', content: rawPrompt };
    appendMessage(userMsg); addOrUpdateMessage(userMsg);
  };
  sendBtn?.addEventListener('click', sendMessage);

  // Keyboard
  let lastEscapeTime = 0;
  input?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (!isAutocompleteActive()) { if (handleScrollKeys(e)) return; }
    if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); cyclePermissionMode(); return; }
    if (e.key === 't' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); toggleContinuousLearning(); return; }
    if (e.key === 'o' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); toggleThoughtAccordions(); return; }
    if (e.key === 'g' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendAction('open-in-editor'); return; }
    if (e.key === 'p' && (e.altKey || e.metaKey)) { e.preventDefault(); sendAction('pick-model'); return; }
    if (e.key === 'Escape') { lastEscapeTime = handleEscape(lastEscapeTime); return; }
    if (isAutocompleteActive()) {
      if (e.key === 'ArrowDown') { e.preventDefault(); navigateAutocompleteDown(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); navigateAutocompleteUp(); return; }
      if (e.key === 'Enter') { e.preventDefault(); insertAutocompleteSelection(); return; }
      if (e.key === 'Escape') { e.preventDefault(); hideAutocomplete(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  input?.addEventListener('input', () => { state.inputDraft = input.value; saveState(); adjustTextareaHeight(input); handleInputOrCursorChange(input); });
  input?.addEventListener('click', () => handleInputOrCursorChange(input));

  // Taste toggle
  document.getElementById('tui-taste-toggle')?.addEventListener('click', () => toggleContinuousLearning());

  // Autocomplete clicks
  document.getElementById('autocomplete-list')?.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest('.autocomplete-item') as HTMLElement;
    if (item?.dataset.index !== undefined) { /* autocompleteSelectedIndex set via navigateAutocomplete* */ insertAutocompleteSelection(); }
  });

  // Drag & drop
  setupDragDrop();

  // Diff button delegation
  document.getElementById('chat-history')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('diff-btn')) {
      const action = target.classList.contains('accept') ? 'accept' : 'reject';
      const id = target.dataset.id;
      if (id) {
        sendAction('respond-diff', { id, response: action });
        target.parentElement!.innerHTML = `<span style="color:var(--accent)">[${action.toUpperCase()}]</span>`;
        const msg = state.messages.find(item => item.id === id);
        if (msg) { msg.diffResponse = action; msg.content = renderDiffProposalHtml(id, msg.diffText || '', action); saveState(); }
      }
    }
  });

  // Copy code delegation
  document.getElementById('app')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('copy-code-btn')) {
      const code = decodeURIComponent(target.dataset.code || '');
      navigator.clipboard.writeText(code).then(() => {
        const originalText = target.innerText; target.innerText = 'COPIED!'; target.style.color = 'var(--accent)';
        setTimeout(() => { target.innerText = originalText; target.style.color = ''; }, 1500);
      });
    }
  });

  // Context file click
  document.getElementById('context-panel')?.addEventListener('click', (e) => {
    const fileRow = (e.target as HTMLElement).closest('.context-file');
    if (fileRow) { const pathEl = fileRow.querySelector('.context-file-path'); const path = pathEl?.textContent?.replace(/^▶ /, '').trim(); if (path) sendAction('open-context-file', { path }); }
  });

  // Global keyboard scroll
  window.addEventListener('keydown', handleGlobalScroll);

  // Onboarding buttons
  document.getElementById('chat-history')?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.onboarding-btn') as HTMLButtonElement | null;
    if (btn) {
      if (btn.dataset.action === 'start') { sendAction('start'); return; }
      const promptVal = btn.dataset.prompt;
      if (promptVal) { const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement | null; if (chatInput) { chatInput.value = promptVal; chatInput.focus(); adjustTextareaHeight(chatInput); } }
    }
  });

  // Diagnostics FIX button
  document.getElementById('context-diag-body')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('context-diag-fix-btn') || target.closest('.context-diag-fix-btn')) {
      if (isExecuting) return;
      const userMsg = { id: 'local-' + Date.now(), role: 'user', content: '/fix' };
      appendMessage(userMsg); addOrUpdateMessage(userMsg); setExecutingState(true);
      vscode.postMessage({ type: 'chatInput', payload: { prompt: '/fix' } });
    }
  });
}

// ─── Keyboard Helpers ─────────────────────────────────

function handleScrollKeys(e: KeyboardEvent): boolean {
  const history = document.getElementById('chat-history');
  if (!history) return false;
  const line = 40; const page = history.clientHeight - 40;
  if (e.key === 'PageDown') { e.preventDefault(); history.scrollTop += page; return true; }
  if (e.key === 'PageUp') { e.preventDefault(); history.scrollTop -= page; return true; }
  if (e.key === 'ArrowUp' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); history.scrollTop -= line; return true; }
  if (e.key === 'ArrowDown' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); history.scrollTop += line; return true; }
  if (e.key === 'Home' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); history.scrollTop = 0; return true; }
  if (e.key === 'End' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); history.scrollTop = history.scrollHeight; return true; }
  return false;
}

function cyclePermissionMode(): void {
  const current = state.permissionMode || 'standard';
  let nextMode: 'standard' | 'plan' | 'auto-accept';
  if (current === 'standard') nextMode = 'auto-accept';
  else if (current === 'auto-accept') nextMode = 'plan';
  else nextMode = 'standard';
  sendAction('set-permission-mode', { permissionMode: nextMode });
}

function toggleContinuousLearning(): void {
  state.continuousLearning = !state.continuousLearning;
  updateTasteUI(); saveState();
  const statusText = state.continuousLearning ? 'Continuous learning enabled' : 'Continuous learning disabled';
  const localMsg = { id: 'sys-' + Date.now(), role: 'system', content: `_${statusText}_` };
  appendMessage(localMsg); addOrUpdateMessage(localMsg);
}

function toggleThoughtAccordions(): void {
  const details = document.querySelectorAll('details.step-accordion');
  const anyOpen = Array.from(details).some(d => d.hasAttribute('open'));
  details.forEach(d => { if (anyOpen) d.removeAttribute('open'); else d.setAttribute('open', ''); });
}

function handleEscape(lastEscapeTime: number): number {
  if (isExecuting) { sendAction('interrupt-execution'); return 0; }
  const now = Date.now();
  if (now - lastEscapeTime < 400) { sendAction('checkpoint-restore'); return 0; }
  return now;
}

function handleGlobalScroll(e: KeyboardEvent): void {
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable)) return;
  const target = e.target as HTMLElement;
  if (target && target !== document.body) {
    let current: HTMLElement | null = target;
    const activeContainer = getActiveScrollContainer();
    while (current && current !== document.body && current !== activeContainer) {
      if (current.scrollHeight > current.clientHeight) { const oy = window.getComputedStyle(current).overflowY; if (oy === 'auto' || oy === 'scroll') return; }
      if (current.scrollWidth > current.clientWidth) { const ox = window.getComputedStyle(current).overflowX; if (ox === 'auto' || ox === 'scroll') return; }
      current = current.parentElement;
    }
  }
  const sc = getActiveScrollContainer(); if (!sc) return;
  const line = 40; const page = sc.clientHeight - 40;
  let handled = false;
  switch (e.key) {
    case 'ArrowUp': sc.scrollTop -= line; handled = true; break;
    case 'ArrowDown': sc.scrollTop += line; handled = true; break;
    case 'PageUp': sc.scrollTop -= page; handled = true; break;
    case 'PageDown': sc.scrollTop += page; handled = true; break;
    case ' ': sc.scrollTop += e.shiftKey ? -page : page; handled = true; break;
    case 'Home': sc.scrollTop = 0; handled = true; break;
    case 'End': sc.scrollTop = sc.scrollHeight; handled = true; break;
  }
  if (handled) e.preventDefault();
}

// ─── Slash/Bash Command Routing ───────────────────────

function handleSlashCommand(rawPrompt: string): void {
  const parts = rawPrompt.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const arg = rawPrompt.slice(parts[0].length).trim();

  if (cmd === '/clear') { state.messages = []; state.statusText = ''; state.agents = []; saveState(); hydrateUI(); sendAction('clear-session'); return; }
  if (cmd === '/help') { const helpMsg = buildHelpMessage(); appendMessage(helpMsg); addOrUpdateMessage(helpMsg); return; }
  if (cmd === '/plan') {
    if (!arg) { const err = { id: 'plan-err-' + Date.now(), role: 'system', content: 'Usage: /plan <task>' }; appendMessage(err); addOrUpdateMessage(err); return; }
    setExecutingState(true); vscode.postMessage({ type: 'chatInput', payload: { prompt: arg, plan: true } });
    const planMsg = { id: 'local-' + Date.now(), role: 'user', content: `/plan ${arg}` }; appendMessage(planMsg); addOrUpdateMessage(planMsg); return;
  }
  if (cmd === '/sessions') { sendAction('list-sessions'); return; }
  if (cmd === '/agents') { switchPanel('agents'); return; }
  if (cmd === '/loops') { renderLoopPanel(); return; }
  if (cmd === '/mcp') { renderMcpPanel(); return; }

  // All other slash commands route to CLI
  const cliSlashMsg = { id: 'local-' + Date.now(), role: 'user', content: rawPrompt };
  appendMessage(cliSlashMsg); addOrUpdateMessage(cliSlashMsg); setExecutingState(true);
  vscode.postMessage({ type: 'chatInput', payload: { prompt: rawPrompt } });
}

function handleBashCommand(rawPrompt: string): void {
  const cmdStr = rawPrompt.slice(1).trim();
  if (!cmdStr) { const err = { id: 'bash-err-' + Date.now(), role: 'system', content: 'Usage: !<command>' }; appendMessage(err); addOrUpdateMessage(err); return; }
  setExecutingState(true);
  vscode.postMessage({ type: 'chatInput', payload: { prompt: cmdStr, isBash: true } });
  const bashMsg = { id: 'local-' + Date.now(), role: 'user', content: `!${cmdStr}` }; appendMessage(bashMsg); addOrUpdateMessage(bashMsg);
}

function buildHelpMessage(): MessageItem {
  return {
    id: 'help-' + Date.now(), role: 'system',
    content: `### Command Code Webview Guide\n\n` +
      `**Slash Commands**\n` +
      `- \`/help\` - Show this help guide\n` +
      `- \`/clear\` - Clear chat history\n` +
      `- \`/plan <task>\` - Execute task in plan mode (dry-run)\n` +
      `- \`/design <mode>\` - Run the frontend UI/UX design agent\n` +
      `- \`/fix [instruction]\` - Analyze and fix compilation errors and warnings in workspace\n` +
      `- \`/sessions\` - Switch to recent sessions panel\n` +
      `- \`/agents\` - Switch to active agents board\n` +
      `- \`/taste\` - Manage Taste learning and usage\n` +
      `- \`/context\` - Show context window usage\n` +
      `- \`/status\` - Show comprehensive environment status\n` +
      `- \`/login\` - Log in to Command Code\n` +
      `- \`/logout\` - Log out of Command Code\n` +
      `- \`/update\` - Update Command Code to the latest version\n` +
      `- \`/exit\` - Exit Command Code\n\n` +
      `All other CLI slash commands (\`/goal\`, \`/memory\`, \`/taste\`, \`/skills\`, \`/mcp\`, \`/review\`, \`/pr-comments\`, \`/usage\`, \`/feedback\`, etc.) are routed to the CLI and handled there.\n\n` +
      `**Direct Bash**\n- \`!<command>\` - Run bash commands (e.g. \`!pnpm test\`)\n\n` +
      `**Autocomplete**\n- \`/<text>\` - Slash commands\n- \`@<text>\` - File context paths\n- \`!<text>\` - Bash history\n\n` +
      `**Keyboard Shortcuts**\n` +
      `- \`Shift+Tab\` - Cycle permission mode\n- \`Ctrl+T\` - Toggle continuous learning\n- \`Ctrl+O\` - Toggle expanded thought blocks\n` +
      `- \`Alt+P\` - Switch model\n- \`Ctrl+G\` - Open input in external editor\n- \`Esc\` - Interrupt execution\n- \`Esc\` (×2) - Rewind to last checkpoint\n`,
  };
}

// ─── Drag & Drop ──────────────────────────────────────

function setupDragDrop(): void {
  const inputContainer = document.querySelector('.chat-input-container') as HTMLElement;
  if (!inputContainer) return;
  inputContainer.addEventListener('dragover', (e) => { e.preventDefault(); inputContainer.classList.add('dropzone-active'); });
  inputContainer.addEventListener('dragleave', (e) => { e.preventDefault(); inputContainer.classList.remove('dropzone-active'); });
  inputContainer.addEventListener('drop', (e) => {
    e.preventDefault(); inputContainer.classList.remove('dropzone-active');
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]; const reader = new FileReader();
      reader.onload = (ev) => sendAction('file-dropped', { name: file.name, type: file.type, data: ev.target?.result });
      reader.readAsDataURL(file);
    }
  });
}

// ─── UI Layout ────────────────────────────────────────



// ─── Initialization ───────────────────────────────────

function initUI(): void {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = buildAppHtml();
  attachEventListeners();
  updateFooter();
  const chatHistory = document.getElementById('chat-history');
  if (chatHistory) setupScrollButton(chatHistory);
  const statusContent = document.getElementById('status-content');
  if (statusContent) setupScrollButton(statusContent);
  restoreState();
  if (state.messages.length > 0 || state.statusText || state.agents.length > 0) {
    hydrateUI();
  } else {
    updateTasteUI();
  }
}

// ─── Message Event Handler ────────────────────────────

window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data;
  if (message?.jsonrpc !== '2.0' || message.method !== 'webview/dispatchEvent') return;
  const { type, payload } = message.params;
  switch (type) {
    case 'RenderMessage': { const { id, role, content } = payload; appendMessage({ id, role, content }); addOrUpdateMessage({ id, role, content }); break; }
    case 'RenderImage': { const { id, role, dataUri } = payload; const content = `<img src="${dataUri}" class="chat-image" />`; appendMessage({ id, role, content }); addOrUpdateMessage({ id, role, content, isImage: true, dataUri }); break; }
    case 'RenderDiffProposal': { const { id, diffText } = payload; const html = renderDiffProposalHtml(id, diffText); appendMessage({ id, role: 'system', content: html }); addOrUpdateMessage({ id, role: 'system', content: html, isDiffProposal: true, diffText }); break; }
    case 'UpdateAgents': { state.agents = payload.agents ?? []; saveState(); renderAgentList(state.agents); break; }
    case 'LoopStarted': { state.loop = { status: 'running', task: payload.task ?? '', verify: payload.verify, iterations: [] }; saveState(); renderLoopPanel(state.loop); break; }
    case 'LoopIteration': { if (!state.loop) state.loop = { status: 'running', task: '', iterations: [] }; const item = payload as LoopIterationItem; const idx = state.loop.iterations.findIndex((e) => e.iteration === item.iteration); if (idx >= 0) state.loop.iterations[idx] = { ...state.loop.iterations[idx], ...item }; else state.loop.iterations.push(item); saveState(); renderLoopPanel(state.loop); break; }
    case 'LoopFinished': { if (!state.loop) state.loop = { status: payload.status ?? 'completed', task: '', iterations: [] }; state.loop.status = payload.status ?? state.loop.status; state.loop.reportPath = payload.reportPath; saveState(); renderLoopPanel(state.loop); break; }
    case 'LoopReports': { state.loopReports = payload.reports ?? []; saveState(); if (state.activePanel === 'loops') renderLoopPanel(state.loop); break; }
    case 'McpStatus': { state.mcpServers = payload.servers ?? []; saveState(); renderMcpPanel(state.mcpServers); break; }
    case 'UpdateTokens': { state.tokens = payload; saveState(); updateHeader(); updateFooter(); break; }
    case 'StreamMessageChunk': {
      const { id, role, chunk } = payload;
      if (!streamingStartTime) setStreamingStartTime(Date.now());
      const history = document.getElementById('chat-history'); if (!history) break; switchPanel('chat');
      let div = document.getElementById(id);
      if (!div) { div = document.createElement('div'); div.id = id; div.className = `message message-${role}`; div.dataset.raw = ''; history.appendChild(div); document.getElementById('streaming-cursor')?.remove(); }
      div.dataset.raw += chunk; const raw = div.dataset.raw ?? '';
      appendMessage({ id, role, content: raw }, true); addOrUpdateMessage({ id, role, content: raw, raw }); break;
    }
    case 'StreamFinished': { setExecutingState(false); setStreamingStartTime(0); const { id } = payload; if (id) { const msg = state.messages.find(m => m.id === id); if (msg) { appendMessage({ id: msg.id, role: msg.role, content: msg.content || msg.raw || '' }, false); addOrUpdateMessage({ id: msg.id, role: msg.role, content: msg.content || msg.raw || '' }); } } break; }
    case 'StdoutChunk': { const content = document.getElementById('status-content'); if (content) { switchPanel('status'); const wasAtBottom = isNearBottom(content); state.statusText += payload.chunk; saveState(); content.innerHTML = cleanAndColorAnsi(state.statusText); if (wasAtBottom) scrollToBottom(content); } break; }
    case 'ClearChat': case 'ResetSession': { state.messages = []; state.statusText = ''; state.agents = []; saveState(); hydrateUI(); switchPanel('chat'); break; }
    case 'FocusInput': { (document.getElementById('chat-input') as HTMLTextAreaElement | null)?.focus(); break; }
    case 'initState': { const { modelId, permissionMode, tokens, sessionId, turnCount, cliVersion, modelsLabel, agentMode } = payload; state.modelId = modelId; state.permissionMode = permissionMode; state.tokens = tokens; state.currentSessionId = sessionId ?? null; state.turnCount = turnCount ?? 0; if (agentMode) state.agentMode = agentMode; if (cliVersion) state.cliVersion = cliVersion; if (modelsLabel) state.modelsLabel = modelsLabel; saveState(); updateHeader(); updateFooter(); break; }
    case 'permChanged': { state.permissionMode = payload.permissionMode; saveState(); updateHeader(); updateFooter(); break; }
    case 'modelChanged': case 'ModelChanged': { state.modelId = payload.modelId; if (payload.modelsLabel) state.modelsLabel = payload.modelsLabel; saveState(); updateHeader(); updateFooter(); break; }
    case 'AgentModeChanged': { state.agentMode = payload.agentMode ?? state.agentMode; saveState(); updateFooter(); break; }
    case 'SessionList': { state.sessions = payload.sessions ?? []; saveState(); renderSessionList(state.sessions ?? []); break; }
    case 'StatusResult': { setExecutingState(false); state.statusText = payload.text ?? ''; saveState(); renderStatus(state.statusText); break; }
    case 'Notification': { showToast(payload.text ?? '', 'info', 5000); break; }
    case 'BackgroundTaskNotification': { const data = payload.data as Record<string, unknown> | undefined; const title = typeof data?.title === 'string' ? data.title : 'Background Task Completed'; const msg = typeof data?.message === 'string' ? data.message : 'A background task has finished execution.'; showToast(`${title}: ${msg}`, 'success', 6000); break; }
    case 'UpdateContext': { const { workspace, activeFile, openFiles, git } = payload; state.context.workspaceRoot = workspace?.rootPath ?? ''; state.context.activeFile = activeFile ? { path: activeFile.relativePath, language: activeFile.language } : null; state.context.openFiles = (openFiles ?? []).map((f: { relativePath: string; language: string; isActive?: boolean }) => ({ path: f.relativePath, language: f.language, isActive: f.isActive ?? false })); state.context.gitBranch = git?.branch ?? null; state.context.dirtyFilesCount = git?.dirtyFiles?.length ?? 0; state.context.dirtyFiles = (git?.dirtyFiles as string[]) ?? []; saveState(); updateContextPanel(); break; }
    case 'UpdateSessionInfo': { state.currentSessionId = payload.sessionId; state.turnCount = payload.turnCount ?? 0; saveState(); updateFooter(); break; }
    case 'UpdateTurnCount': { state.turnCount = payload.turnCount; saveState(); updateFooter(); break; }
    case 'UpdateDiagnostics': { const diags = payload.diagnostics as Array<{ diagnostics: Array<unknown> }> | undefined; state.context.diagnosticsCount = diags?.reduce((sum: number, f) => sum + (f.diagnostics?.length ?? 0), 0) ?? 0; saveState(); updateContextPanel(); break; }
  }
});

// ─── Boot ─────────────────────────────────────────────

try { initUI(); } catch (err) {
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `<div style="padding: 20px; color: var(--vscode-errorForeground); font-family: sans-serif;">
      <h3>⚠️ Something went wrong</h3><p>Failed to initialize the CommandCode+ UI.</p>
      <pre style="background: rgba(0,0,0,0.1); padding: 10px; border-radius: 4px; overflow-x: auto;">${err instanceof Error ? err.stack || err.message : String(err)}</pre>
      <button onclick="window.location.reload()" style="background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 12px; border-radius: 2px; cursor: pointer;">Reload Window</button>
    </div>`;
  }
}
