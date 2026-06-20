import { IPCServer } from "./context/ipc-server";
import { CmdMcpServer } from "./mcp/server";
import { StreamingDiffManager } from "./diff/preview";
import { ParticipantState } from "./cli/store";

export class SessionManager {
  private static instance: SessionManager | null = null;

  public currentSessionId: string | null = null;
  public currentIdeName: string | null = null;
  public ipcServer: IPCServer | null = null;
  public mcpServer: CmdMcpServer | null = null;
  public activeAbortController: AbortController | null = null;
  public turnCount = 0;
  public lastCheckpointRef: string | null = null;
  public currentDiffManager: StreamingDiffManager | null = null;
  public currentSessionState: ParticipantState | undefined = undefined;

  private constructor() {}

  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  public incrementTurnCount(): number {
    return ++this.turnCount;
  }

  public resetTurnCount(): void {
    this.turnCount = 0;
  }

  public reset(): void {
    this.currentSessionId = null;
    this.currentIdeName = null;
    this.ipcServer = null;
    this.mcpServer = null;
    this.activeAbortController = null;
    this.turnCount = 0;
    this.lastCheckpointRef = null;
    this.currentDiffManager = null;
    this.currentSessionState = undefined;
  }
}
