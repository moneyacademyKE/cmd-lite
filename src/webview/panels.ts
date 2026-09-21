/// <reference lib="dom" />
/**
 * Panel Renderers
 *
 * Renders the sessions, agents (kanban), loops, MCP, and status panels.
 */
import { escapeHtml } from '../util/util';
import { state, saveState, sendAction } from './state';
import type { SessionItem, LoopStateItem, McpServerItem, PanelId } from './state';
import { cleanAndColorAnsi } from './highlight';

// ─── Empty State Helper ──────────────────────────────

export function renderEmptyState(
  container: HTMLElement,
  icon: string,
  label: string,
  actionLabel?: string,
  actionFn?: () => void,
): void {
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <div class="empty-state-label">${escapeHtml(label)}</div>
      ${actionLabel ? `<button class="empty-state-action">${escapeHtml(actionLabel)}</button>` : ''}
    </div>
  `;
  if (actionLabel && actionFn) {
    const btn = container.querySelector('.empty-state-action') as HTMLElement;
    btn?.addEventListener('click', actionFn);
  }
}

// ─── Panel Switching ──────────────────────────────────

export function switchPanel(panel: PanelId): void {
  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('panel-active'));
  const target = document.getElementById(`${panel}-panel`);
  if (target) target.classList.add('panel-active');
  state.activePanel = panel;
  saveState();
}

// ─── Session List ─────────────────────────────────────

export function renderSessionList(sessions: SessionItem[]): void {
  const list = document.getElementById('session-list');
  if (!list) return;
  switchPanel('sessions');
  if (sessions.length === 0) {
    renderEmptyState(list, '\u2630', 'No recent sessions', 'Start a new session', () => sendAction('start'));
    return;
  }
  list.innerHTML = sessions.map((s) => `
    <div class="session-item" data-session-id="${s.id}">
      <span class="session-icon">${s.goalStatus === 'completed' ? '\u2713' : '\u25CB'}</span>
      <div class="session-info">
        <span class="session-label">${escapeHtml(s.label)}</span>
        <span class="session-meta">${s.model ? s.model.split('/').pop() : 'unknown'} \u00B7 ${s.id.slice(0, 8)}</span>
        <span class="session-meta-timestamp">${s.startedAt ? new Date(s.startedAt).toLocaleDateString() : ''}</span>
      </div>
    </div>
  `).join('');
}

// ─── Agent Kanban Board ───────────────────────────────

export function renderAgentList(agents: { name: string; task: string }[]): void {
  const list = document.getElementById('agent-list');
  if (!list) return;
  switchPanel('agents');
  if (agents.length === 0) {
    renderEmptyState(list, '\u2691', 'No active agents', 'Run parallel agents', () => sendAction('start'));
    return;
  }

  const planning: typeof agents = [];
  const execution: typeof agents = [];
  const verification: typeof agents = [];

  for (const a of agents) {
    const key = (a.name + ' ' + a.task).toLowerCase();
    if (key.includes('plan') || key.includes('design') || key.includes('analyze')) {
      planning.push(a);
    } else if (key.includes('test') || key.includes('doc') || key.includes('verify') || key.includes('lint')) {
      verification.push(a);
    } else {
      execution.push(a);
    }
  }

  const renderCol = (title: string, items: typeof agents) => {
    const cards = items.map(a => `
      <div class="kanban-card">
        <div class="kanban-card-title">${escapeHtml(a.name)}</div>
        <div class="kanban-card-desc">${escapeHtml(a.task)}</div>
      </div>
    `).join('');
    return `
      <div class="kanban-column">
        <div class="kanban-column-title">${title} (${items.length})</div>
        <div class="kanban-cards">${cards || '<div class="session-empty" style="padding:10px;">Idle</div>'}</div>
      </div>
    `;
  };

  list.innerHTML = `
    <div class="kanban-board">
      ${renderCol('Planning', planning)}
      ${renderCol('Execution', execution)}
      ${renderCol('Verification', verification)}
    </div>
  `;
}

// ─── Loop Panel ───────────────────────────────────────

export function renderLoopPanel(loop: LoopStateItem | null = state.loop): void {
  const list = document.getElementById('loop-list');
  if (!list) return;
  switchPanel('loops');
  if (!loop) {
    renderEmptyState(list, '\u27F3', 'No loop has run yet', 'Run bounded loop', () => sendAction('run-loop'));
    return;
  }

  const iterations = loop.iterations.map((item) => `
    <div class="loop-iteration loop-${escapeHtml(item.status)}">
      <div class="loop-iteration-title">ITERATION ${item.iteration} // ${escapeHtml(item.status.toUpperCase())}</div>
      <div class="loop-iteration-summary">${escapeHtml(item.summary || 'Waiting for output...')}</div>
    </div>
  `).join('');

  list.innerHTML = `
    <div class="loop-summary">
      <div class="loop-status">STATUS // ${escapeHtml(loop.status.toUpperCase())}</div>
      <div class="loop-task">${escapeHtml(loop.task)}</div>
      <div class="loop-verify">VERIFY // ${escapeHtml(loop.verify || 'project checks')}</div>
      ${loop.reportPath ? `<div class="loop-report">REPORT // ${escapeHtml(loop.reportPath)}</div>` : ''}
      <div class="loop-actions">
        <button class="action-btn loop-stop-btn" data-action="stop-loop">STOP LOOP</button>
        <button class="action-btn loop-report-btn" data-action="open-loop-report">OPEN REPORT</button>
      </div>
    </div>
    <div class="loop-timeline">${iterations || '<div class="session-empty">No iterations recorded</div>'}</div>
    <div class="loop-report-history">
      <div class="loop-iteration-title">REPORT HISTORY</div>
      ${state.loopReports.length > 0
        ? state.loopReports.map((report) => `<div class="loop-report-entry" data-report-path="${escapeHtml(report.path)}">${escapeHtml(report.label)}</div>`).join('')
        : '<div class="session-empty">No saved reports</div>'}
    </div>
  `;
}

// ─── MCP Panel ────────────────────────────────────────

export function renderMcpPanel(servers: McpServerItem[] = state.mcpServers): void {
  const list = document.getElementById('mcp-list');
  if (!list) return;
  switchPanel('mcp');
  if (servers.length === 0) {
    renderEmptyState(list, '\u2699', 'No MCP servers configured', 'Generate mcp.json', () => sendAction('generate-mcp-config'));
    return;
  }
  list.innerHTML = servers.map((server) => `
    <div class="kanban-card">
      <div class="kanban-card-title">${escapeHtml(server.name)}</div>
      <div class="kanban-card-desc">${escapeHtml(server.command)}</div>
    </div>
  `).join('');
}

// ─── Status Panel ─────────────────────────────────────

export function renderStatus(text: string): void {
  const content = document.getElementById('status-content');
  if (!content) return;
  switchPanel('status');
  const statusPanel = document.getElementById('status-panel');
  if (statusPanel && !statusPanel.querySelector('.status-terminal-bar')) {
    const header = statusPanel.querySelector('.panel-header');
    if (header) {
      const bar = document.createElement('div');
      bar.className = 'status-terminal-bar';
      bar.innerHTML = `
        <span class="status-terminal-dot close"></span>
        <span class="status-terminal-dot minimize"></span>
        <span class="status-terminal-dot maximize"></span>
        <span class="status-terminal-title">cmd status</span>
      `;
      header.after(bar);
    }
  }
  content.innerHTML = cleanAndColorAnsi(text);
}
