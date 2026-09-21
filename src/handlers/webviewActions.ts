import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { getActiveCwd } from "../config";
import { listSessions } from "../ui/sessionView";
import { pickModel, pickPermissionMode } from "../ui/pickers";
import { setParticipantPermissionMode } from "../chat/participant";
import { getStatus } from "../cli/commands";
import { ensureIntegrationServices, dispatchMcpStatus } from "../lifecycle/integration";
import type { ChatViewProvider } from "../webview/ChatViewProvider";
import type { SessionManager } from "../sessionManager";

export let lastLoopReportPath: string | null = null;

export async function handleWebviewAction(
  msg: { type: "action"; action: string; payload?: Record<string, unknown> },
  chatProvider: ChatViewProvider,
  session: SessionManager
): Promise<void> {
  const cwd = getActiveCwd();

  switch (msg.action) {
    case "start":
      vscode.commands.executeCommand("cmd-lite.start");
      break;
    case "clear-session":
      session.activeAbortController?.abort();
      session.clearInteractiveState();
      for (const t of vscode.window.terminals) {
        if (t.name === "Command Code") {
          t.dispose();
        }
      }
      break;
    case "continue":
      vscode.commands.executeCommand("cmd-lite.continue");
      break;
    case "resume-session": {
      const sessionId = msg.payload?.sessionId as string | undefined;
      if (sessionId) {
        vscode.commands.executeCommand("cmd-lite.resume", sessionId);
      }
      break;
    }
    case "list-sessions": {
      await ensureIntegrationServices(chatProvider, session);
      const sessions = listSessions(cwd);
      chatProvider.dispatchEvent({
        jsonrpc: "2.0",
        method: "webview/dispatchEvent",
        params: {
          type: "SessionList",
          payload: { sessions },
        },
      });
      break;
    }
    case "pick-model": {
      const selected = await pickModel();
      if (selected) {
        chatProvider.updateModelsLabel();
        chatProvider.dispatchEvent({
          jsonrpc: "2.0",
          method: "webview/dispatchEvent",
          params: {
            type: "modelChanged",
            payload: {
              modelId: selected,
              modelsLabel: chatProvider.getModelsLabel()
            }
          }
        });
      }
      break;
    }
    case "pick-permission": {
      const selected = await pickPermissionMode();
      if (selected) {
        chatProvider.dispatchEvent({
          jsonrpc: "2.0",
          method: "webview/dispatchEvent",
          params: { type: "permChanged", payload: { permissionMode: selected } }
        });
      }
      break;
    }
    case "set-permission-mode": {
      const mode = msg.payload?.permissionMode as "standard" | "plan" | "auto-accept" | undefined;
      if (mode) {
        setParticipantPermissionMode(mode);
        chatProvider.dispatchEvent({
          jsonrpc: "2.0",
          method: "webview/dispatchEvent",
          params: { type: "permChanged", payload: { permissionMode: mode } }
        });
      }
      break;
    }
    case "interrupt-execution": {
      if (session.activeAbortController) {
        session.activeAbortController.abort();
        session.activeAbortController = null;
      }
      break;
    }
    case "checkpoint-restore": {
      vscode.commands.executeCommand("cmd-lite.checkpoint.restore");
      break;
    }
    case "open-in-editor": {
      const text = await vscode.window.showInputBox({
        prompt: "Type a message for Command Code",
        placeHolder: "Your prompt here... (multiline with Shift+Enter in some UIs)",
        value: "",
      });
      if (text && text.trim()) {
        chatProvider.dispatchEvent({
          jsonrpc: "2.0",
          method: "webview/dispatchEvent",
          params: {
            type: "chatInput",
            payload: { prompt: text.trim() }, // Fixed to object payload
          },
        });
      }
      break;
    }
    case "show-status": {
      await ensureIntegrationServices(chatProvider, session);
      try {
        const text = await getStatus(cwd);
        chatProvider.dispatchEvent({
          jsonrpc: "2.0",
          method: "webview/dispatchEvent",
          params: {
            type: "StatusResult",
            payload: { text },
          },
        });
      } catch (err) {
        chatProvider.dispatchEvent({
          jsonrpc: "2.0",
          method: "webview/dispatchEvent",
          params: {
            type: "StatusResult",
            payload: { text: `Error: ${err instanceof Error ? err.message : String(err)}` },
          },
        });
      }
      break;
    }
    case "open-context-file": {
      await ensureIntegrationServices(chatProvider, session);
      const relativePath = msg.payload?.path as string | undefined;
      if (!relativePath) break;
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const targetPath = workspaceRoot ? path.join(workspaceRoot, relativePath) : relativePath;
      // We will handle the actual file opening in `extension.ts` or via a command later
      // Wait, we can just open it here using vscode API directly instead of contextProvider.openFile
      try {
        const doc = await vscode.workspace.openTextDocument(targetPath);
        await vscode.window.showTextDocument(doc, { preview: false });
      } catch (err) {
        vscode.window.showWarningMessage(`Could not open context file: ${relativePath}`);
      }
      break;
    }
    case "run-loop": {
      vscode.commands.executeCommand("cmd-lite.loop");
      break;
    }
    case "list-mcp": {
      dispatchMcpStatus(chatProvider);
      break;
    }
    case "stop-loop": {
      vscode.commands.executeCommand("cmd-lite.loop.stop");
      break;
    }
    case "open-loop-report": {
      vscode.commands.executeCommand("cmd-lite.loop.openReport");
      break;
    }
    case "open-loop-report-path": {
      const reportPath = msg.payload?.reportPath as string | undefined;
      if (!reportPath || !fs.existsSync(reportPath)) break;
      lastLoopReportPath = reportPath;
      const doc = await vscode.workspace.openTextDocument(reportPath);
      await vscode.window.showTextDocument(doc, { preview: false });
      break;
    }
    case "generate-mcp-config": {
      await vscode.commands.executeCommand("cmd-lite.generateMcpConfig");
      break;
    }
  }
}
