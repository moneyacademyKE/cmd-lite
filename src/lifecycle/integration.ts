import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { getSocketPath, detectIdeName, writeSessionFile, cleanupSocket, cleanupStaleSockets } from "../context/session";
import { ContextProvider } from "../context/provider";
import { IPCServer } from "../context/ipc-server";
import { CmdMcpServer } from "../mcp/server";
import { terminalTool } from "../mcp/tools/terminal";
import { diffProposeTool } from "../mcp/tools/diff";
import { diagnosticsTool } from "../mcp/tools/diagnostics";
import { fileSearchTool } from "../mcp/tools/fileSearch";
import { Logger } from "../logger";
import { SessionManager } from "../sessionManager";
import { listLoopReports } from "../agents/loop";
import { setCurrentSessionId } from "../webview/ChatViewProvider";
import type { ChatViewProvider } from "../webview/ChatViewProvider";

let contextProviderInstance: ContextProvider | null = null;
let integrationStartupPromise: Promise<void> | null = null;

export async function pushCurrentContext(chatProvider: ChatViewProvider): Promise<void> {
  if (!contextProviderInstance) return;
  try {
    const ctx = await contextProviderInstance.getContext();
    chatProvider.dispatchContext(ctx);
  } catch (err) {
    Logger.warn("Context push failed:", err);
  }
}

export function dispatchLoopReports(chatProvider: ChatViewProvider): void {
  chatProvider.dispatchEvent({
    jsonrpc: "2.0",
    method: "webview/dispatchEvent",
    params: {
      type: "LoopReports",
      payload: {
        reports: listLoopReports().map((report) => ({ label: report.label, path: report.path })),
      },
    },
  });
}

export function dispatchMcpStatus(chatProvider: ChatViewProvider): void {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const servers: Array<{ name: string; command: string }> = [];
  if (workspaceRoot) {
    const mcpConfigPath = path.join(workspaceRoot, "mcp.json");
    if (fs.existsSync(mcpConfigPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(mcpConfigPath, "utf8")) as { mcpServers?: Record<string, { command?: string; args?: string[] }> };
        for (const [name, config] of Object.entries(parsed.mcpServers ?? {})) {
          const command = [config.command ?? "", ...(config.args ?? [])].join(" ").trim();
          servers.push({ name, command });
        }
      } catch (err) {
        Logger.warn("Failed to read mcp.json:", err);
      }
    }
  }
  chatProvider.dispatchEvent({
    jsonrpc: "2.0",
    method: "webview/dispatchEvent",
    params: { type: "McpStatus", payload: { servers } },
  });
}

export async function ensureIntegrationServices(chatProvider: ChatViewProvider, session: SessionManager): Promise<void> {
  if (session.ipcServer && session.mcpServer && contextProviderInstance) return;
  if (integrationStartupPromise) return integrationStartupPromise;

  integrationStartupPromise = (async () => {
    const sessionId = session.currentSessionId ?? crypto.randomUUID();
    session.currentSessionId = sessionId;
    setCurrentSessionId(sessionId);

    const ideName = session.currentIdeName ?? detectIdeName();
    session.currentIdeName = ideName;
    const socketPath = getSocketPath(sessionId, ideName);
    const mcpSocketPath = getSocketPath(sessionId + "-mcp", ideName);
    const authToken = crypto.randomUUID();

    cleanupSocket(socketPath);
    cleanupSocket(mcpSocketPath);
    cleanupStaleSockets(ideName);

    const contextProvider = contextProviderInstance ?? new ContextProvider();
    contextProviderInstance = contextProvider;

    const ipcServer = new IPCServer(contextProvider, socketPath, authToken);
    ipcServer.setWebviewDispatcher((eventPayload) => {
      chatProvider.dispatchEvent(eventPayload);
    });

    const mcpServer = new CmdMcpServer(mcpSocketPath, [
      terminalTool,
      diffProposeTool,
      diagnosticsTool,
      fileSearchTool,
    ]);

    session.ipcServer = ipcServer;
    session.mcpServer = mcpServer;

    await mcpServer.start();
    await ipcServer.start();

    const workspaceFolders = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];
    writeSessionFile(sessionId, socketPath, mcpSocketPath, workspaceFolders, ideName, authToken);

    await pushCurrentContext(chatProvider);
  })().catch((error) => {
    session.ipcServer = null;
    session.mcpServer = null;
    integrationStartupPromise = null;
    Logger.error("CommandCode: integration startup failed:", error);
    vscode.window.showErrorMessage("CommandCode: Failed to start context services. CLI integration may not work.");
    throw error;
  });

  return integrationStartupPromise;
}

export function cleanupIntegration(): void {
  contextProviderInstance?.dispose();
  contextProviderInstance = null;
  integrationStartupPromise = null;
}
