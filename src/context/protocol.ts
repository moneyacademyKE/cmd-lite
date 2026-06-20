export const IPC_ACTIONS = {
  GET_CONTEXT: "getContext",
  GET_DIAGNOSTICS: "getDiagnostics",
  DISPATCH_WEBVIEW_EVENT: "dispatchWebviewEvent",
  CLAIM_UI_LOCK: "claimUiLock",
  APPLY_EDIT: "applyEdit",
  OPEN_FILE: "openFile",
} as const;

export const IPC_AUTH_TIMEOUT_MS = 5000;

export type AuthMessage = {
  type: string;
  token: string;
};

export function isAuthMessage(msg: unknown): msg is AuthMessage {
  return (
    msg !== null &&
    typeof msg === "object" &&
    (msg as Record<string, unknown>).type === "auth" &&
    typeof (msg as Record<string, unknown>).token === "string"
  );
}

export function isIpcRequest(msg: unknown): msg is IpcRequest {
  if (msg === null || typeof msg !== "object") return false;
  const record = msg as Record<string, unknown>;
  if (record.type !== "request") return false;
  if (typeof record.id !== "string") return false;
  
  const payload = record.payload as Record<string, unknown> | undefined;
  if (payload === null || typeof payload !== "object") return false;
  const action = payload.action;
  if (typeof action !== "string") return false;
  
  // General validation for fields if present
  if (payload.filePaths !== undefined) {
    if (!Array.isArray(payload.filePaths)) return false;
    if (!payload.filePaths.every((f) => typeof f === "string")) return false;
  }
  if (payload.filePath !== undefined && typeof payload.filePath !== "string") {
    return false;
  }
  
  if (action === IPC_ACTIONS.OPEN_FILE) {
    if (typeof payload.filePath !== "string") return false;
  } else if (action === IPC_ACTIONS.APPLY_EDIT) {
    const editPayload = payload.editPayload;
    if (editPayload === null || typeof editPayload !== "object") return false;
    for (const [uri, edits] of Object.entries(editPayload)) {
      if (typeof uri !== "string") return false;
      if (!Array.isArray(edits)) return false;
      for (const edit of edits) {
        if (edit === null || typeof edit !== "object") return false;
        const e = edit as Record<string, unknown>;
        if (typeof e.newText !== "string") return false;
        if (!Array.isArray(e.range) || e.range.length !== 2) return false;
        for (const pos of e.range) {
          if (pos === null || typeof pos !== "object") return false;
          const p = pos as Record<string, unknown>;
          if (typeof p.line !== "number" || typeof p.character !== "number") return false;
        }
      }
    }
  } else if (action === IPC_ACTIONS.DISPATCH_WEBVIEW_EVENT) {
    if (payload.eventPayload === undefined) return false;
  }
  
  return true;
}


export type IpcAction =
  (typeof IPC_ACTIONS)[keyof typeof IPC_ACTIONS];

export interface IpcRequest {
  type: "request";
  id: string;
  payload: {
    action: string;
    filePaths?: string[];
    eventPayload?: unknown;
    editPayload?: unknown; // generic object for VS Code workspace edit
    filePath?: string; // for openFile action
  };
}

export interface IpcResponse {
  type: "response";
  id: string;
  payload: unknown;
}

export interface IpcError {
  type: "error";
  id: string;
  payload: {
    message: string;
    code: string;
  };
}

export interface IpcEvent {
  type: "event";
  payload: {
    event: string;
    data: unknown;
  };
}

export type IpcMessage = IpcRequest | IpcResponse | IpcError | IpcEvent;

export const MAX_BUFFER_BYTES = 8 * 1024 * 1024;
export const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
export const MAX_CONNECTIONS = 16;
export const IDLE_TIMEOUT_MS = 60000;

export interface CursorInfo {
  line: number;
  column: number;
}

export interface ActiveFileInfo {
  path: string;
  relativePath: string;
  language: string;
  lineCount: number;
  cursor: CursorInfo;
  encoding: string;
  tabSize: number;
}

export interface SelectionInfo {
  text: string;
  startLine: number;
  endLine: number;
  lineCount: number;
}

export interface OpenFileInfo {
  path: string;
  relativePath: string;
  language: string;
  isActive: boolean;
}

export interface WorkspaceInfo {
  rootPath: string;
  name: string | undefined;
}

export interface EditorContext {
  timestamp: number;
  workspace: WorkspaceInfo;
  activeFile: ActiveFileInfo | null;
  selection: SelectionInfo | null;
  openFiles: OpenFileInfo[];
  git: GitContext | null;
}

export interface GitContext {
  branch: string;
  headCommit: string;
  headCommitMessage: string;
  dirtyFiles: string[];
}

export interface DiagnosticEntry {
  range: {
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
  };
  message: string;
  severity: string;
  source: string | null;
  code: string | null;
}

export interface FileDiagnostics {
  file: string;
  relativePath: string;
  diagnostics: DiagnosticEntry[];
}
