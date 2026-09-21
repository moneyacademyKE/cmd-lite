/// <reference lib="dom" />
/**
 * Webview State Management
 *
 * Central state singleton, type definitions, and VS Code persistence helpers.
 * All webview modules import state from here to avoid circular dependencies.
 */

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

export const vscode = acquireVsCodeApi();

// ─── Type Definitions ─────────────────────────────────

export interface SessionItem {
  id: string;
  label: string;
  model?: string;
  goalStatus?: string;
  startedAt?: number;
}

export interface ContextInfo {
  workspaceRoot: string;
  activeFile: { path: string; language: string } | null;
  openFiles: Array<{ path: string; language: string; isActive: boolean }>;
  gitBranch: string | null;
  dirtyFilesCount: number;
  dirtyFiles: string[];
  diagnosticsCount: number;
}

export interface MessageItem {
  id: string;
  role: string;
  content: string;
  raw?: string;
  isImage?: boolean;
  isDiffProposal?: boolean;
  dataUri?: string;
  diffText?: string;
  diffResponse?: 'accept' | 'reject';
}

export interface LoopIterationItem {
  iteration: number;
  status: string;
  summary?: string;
}

export interface LoopStateItem {
  status: string;
  task: string;
  verify?: string;
  reportPath?: string;
  iterations: LoopIterationItem[];
}

export interface LoopReportItem {
  label: string;
  path: string;
}

export interface McpServerItem {
  name: string;
  command: string;
}

export type PanelId = 'chat' | 'sessions' | 'status' | 'agents' | 'loops' | 'mcp';

// ─── State Singleton ──────────────────────────────────

export const state: {
  tokens: { prompt: number; completion: number; total: number };
  modelId: string;
  permissionMode: string;
  statusText: string;
  sessions?: SessionItem[];
  currentSessionId: string | null;
  turnCount: number;
  isStreaming: boolean;
  context: ContextInfo;
  messages: MessageItem[];
  activePanel: PanelId;
  inputDraft: string;
  agents: { name: string; task: string }[];
  loop: LoopStateItem | null;
  loopReports: LoopReportItem[];
  agentMode: string;
  mcpServers: McpServerItem[];
  continuousLearning: boolean;
  cliVersion: string;
  modelsLabel: string;
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
    dirtyFiles: [],
    diagnosticsCount: 0,
  },
  messages: [],
  activePanel: 'chat',
  inputDraft: '',
  agents: [],
  loop: null,
  loopReports: [],
  agentMode: 'code',
  mcpServers: [],
  continuousLearning: true,
  cliVersion: '',
  modelsLabel: '',
};

// ─── Persistence ──────────────────────────────────────

export function saveState(): void {
  vscode.setState({
    tokens: state.tokens,
    modelId: state.modelId,
    permissionMode: state.permissionMode,
    statusText: state.statusText,
    sessions: state.sessions,
    currentSessionId: state.currentSessionId,
    turnCount: state.turnCount,
    context: state.context,
    messages: state.messages,
    activePanel: state.activePanel,
    inputDraft: state.inputDraft,
    agents: state.agents,
    loop: state.loop,
    loopReports: state.loopReports,
    agentMode: state.agentMode,
    mcpServers: state.mcpServers,
    continuousLearning: state.continuousLearning,
    cliVersion: state.cliVersion,
    modelsLabel: state.modelsLabel,
  });
}

export function addOrUpdateMessage(m: MessageItem): void {
  const idx = state.messages.findIndex(item => item.id === m.id);
  if (idx !== -1) {
    state.messages[idx] = { ...state.messages[idx], ...m };
  } else {
    state.messages.push(m);
  }
  saveState();
}

export function restoreState(): void {
  const previousState = vscode.getState() as Partial<typeof state> | null;
  if (!previousState) return;

  state.tokens = previousState.tokens || state.tokens;
  state.modelId = previousState.modelId || state.modelId;
  state.permissionMode = previousState.permissionMode || state.permissionMode;
  state.statusText = previousState.statusText || state.statusText;
  state.sessions = previousState.sessions;
  state.currentSessionId = previousState.currentSessionId || null;
  state.turnCount = previousState.turnCount || 0;
  state.context = previousState.context || state.context;
  if (!state.context.dirtyFiles) state.context.dirtyFiles = [];
  state.messages = previousState.messages || [];
  state.activePanel = previousState.activePanel || 'chat';
  state.inputDraft = previousState.inputDraft || '';
  state.agents = previousState.agents || [];
  state.loop = previousState.loop || null;
  state.loopReports = previousState.loopReports || [];
  state.agentMode = previousState.agentMode || 'code';
  state.mcpServers = previousState.mcpServers || [];
  state.continuousLearning = previousState.continuousLearning !== undefined
    ? previousState.continuousLearning
    : state.continuousLearning;
  state.cliVersion = previousState.cliVersion || '';
  state.modelsLabel = previousState.modelsLabel || '';
}

// ─── Helpers ──────────────────────────────────────────

export function sendAction(action: string, payload?: Record<string, unknown>): void {
  vscode.postMessage({ type: 'action', action, payload });
}
