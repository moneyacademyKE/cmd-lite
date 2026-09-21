import * as vscode from "vscode";
import { registerChatParticipant } from "./chat/participant";
import {
  getActiveCwd,
  showStatusBarEnabled,
  getEffectiveModel,
  getEffectivePermissionMode,
} from "./config";
import {
  resolveCliPath,
  validateCliPath,
  checkCliVersion,
  clearCliPathCache,
  detectLocalCli,
  setLocalCliPathOverride,
  installOrUpdateLocalCli,
  fetchLatestTarballInfo,
} from "./cli/resolve";
import { registerSessionCommands } from "./ui/sessionCommands";
import { SessionTreeProvider } from "./ui/sessionView";
import { StatusBar } from "./ui/statusBar";
import { defineHeadlessTask } from "./ui/headless";
import { registerTasteCommands } from "./taste/commands";
import {
  registerTasteWatcher,
  TasteTreeProvider,
} from "./taste/tasteView";
import { ChatViewProvider } from "./webview/ChatViewProvider";
import { removeSessionFile } from "./context/session";
import { registerLmTools } from "./tools/lm-tools";
import { proposedDiffProvider } from "./diff/preview";
import { initializePermissionStore } from "./permission/store";
import { Logger } from "./logger";
import { SessionManager } from "./sessionManager";
import { handleChatInput } from "./handlers/chatInput";
import { handleWebviewAction } from "./handlers/webviewActions";
import { pushCurrentContext, ensureIntegrationServices, cleanupIntegration } from "./lifecycle/integration";
import { registerCoreCommands } from "./commands/registration";

const session = SessionManager.getInstance();
async function checkLatestVersionBackground(currentVersion: string): Promise<void> {
  try {
    const latest = await fetchLatestTarballInfo();
    if (latest.version !== currentVersion) {
      vscode.window.showInformationMessage(
        `A new version of Command Code CLI is available (v${latest.version}). Update now?`,
        "Update",
        "Later"
      ).then(async (choice) => {
        if (choice === "Update") {
          await vscode.commands.executeCommand("cmd-lite.update");
        }
      });
    }
  } catch (err) {
    // ignore network errors for background checks
  }
}

async function bootstrapLocalCli(context: vscode.ExtensionContext): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Setting up Command Code CLI...",
      cancellable: false,
    },
    async (progress) => {
      try {
        progress.report({ message: "Bootstrapping dependencies..." });
        const { version } = await installOrUpdateLocalCli(context.globalStorageUri, (pct) => {
          progress.report({ message: `Downloading CLI... ${pct}%` });
        });
        vscode.window.showInformationMessage(`Command Code CLI successfully installed: v${version}`);
        
        const localPath = detectLocalCli(context.globalStorageUri);
        if (localPath) {
          setLocalCliPathOverride(localPath);
          void vscode.window.setStatusBarMessage(`Command Code CLI resolved to local v${version}`, 3000);
        }
      } catch (err) {
        vscode.window.showErrorMessage(
          `Failed to bootstrap local CLI: ${err instanceof Error ? err.message : String(err)}. Please try running 'cmd-lite.update' manually.`
        );
      }
    }
  );
}

async function validateAndCheckCli(context: vscode.ExtensionContext): Promise<void> {
  const configured = vscode.workspace.getConfiguration("cmd-lite").get<string>("cliPath", "cmd").trim();
  const isDefault = configured === "cmd" || configured === "command-code";

  if (isDefault) {
    const localPath = detectLocalCli(context.globalStorageUri);
    if (localPath) {
      setLocalCliPathOverride(localPath);
    } else if (validateCliPath(configured).valid) {
      clearCliPathCache();
    } else {
      await bootstrapLocalCli(context);
      return;
    }
  }

  const resolvedCliPath = resolveCliPath();
  const validation = validateCliPath(resolvedCliPath);
  if (!validation.valid) {
    vscode.window.showErrorMessage(
      `Command Code: ${validation.message}`,
      "Install CLI",
      "Settings",
    ).then((choice) => {
      if (choice === "Settings") {
        vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "cmd-lite.cliPath",
        );
      }
    });
  } else {
    const version = await checkCliVersion(resolvedCliPath);
    if (!version.compatible && version.message) {
      vscode.window.showWarningMessage(
        `Command Code: ${version.message}`,
        "Update",
      ).then((choice) => {
        if (choice === "Update") {
          vscode.commands.executeCommand("cmd-lite.update");
        }
      });
    } else if (isDefault && version.version) {
      void checkLatestVersionBackground(version.version);
    }
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const localCli = detectLocalCli(context.globalStorageUri);
  if (localCli) {
    setLocalCliPathOverride(localCli);
  }

  const cliPath = resolveCliPath();

  void vscode.window.setStatusBarMessage(
    `Command Code extension loaded (cli: ${cliPath})`,
    3000,
  );

  validateAndCheckCli(context);

  Logger.initialize("Command Code");

  const statusBar = new StatusBar();
  if (showStatusBarEnabled()) statusBar.show();

  const tasteProvider = new TasteTreeProvider(getActiveCwd());
  const sessionProvider = new SessionTreeProvider();

  const chatProvider = new ChatViewProvider(
    context.extensionUri,
    async (eventName, data) => {
      // Handle chatInput directly by running runPrint and streaming back to webview
      if (
        eventName === "webview_interaction" &&
        data &&
        typeof data === "object" &&
        "type" in data &&
        (data as { type: string }).type === "chatInput"
      ) {
        const input = data as { type: "chatInput"; payload: { prompt: string; isBash?: boolean; plan?: boolean } };
        await handleChatInput(input, chatProvider, session);
        return;
      }

      // Handle action messages from webview buttons
      if (
        eventName === "webview_interaction" &&
        data &&
        typeof data === "object" &&
        "type" in data &&
        (data as { type: string }).type === "action"
      ) {
        const msg = data as { type: "action"; action: string; payload?: Record<string, unknown> };
        await handleWebviewAction(msg, chatProvider, session);
        return;
      }

      // Fall through to IPC for other message types (e.g. when CLI is connected)
      session.ipcServer?.dispatchToWebviewOwner(eventName, data);
    }
  );

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "cmd-lite.tasteView",
      tasteProvider,
    ),
    vscode.window.registerTreeDataProvider(
      "cmd-lite.sessionView",
      sessionProvider,
    ),
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      chatProvider
    ),
  );

  registerTasteWatcher(context, tasteProvider);
  registerTasteCommands(context, tasteProvider, Logger.instance);
  initializePermissionStore(context);
  registerSessionCommands(context, statusBar, sessionProvider, Logger.instance, chatProvider, () => ensureIntegrationServices(chatProvider, session));
  registerChatParticipant(context);
  registerLmTools(context);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      "cmd-lite-diff",
      proposedDiffProvider,
    ),
  );

  registerCoreCommands(context, chatProvider, statusBar, session);

  statusBar.setPermissionMode(
    (vscode.workspace
      .getConfiguration("cmd-lite")
      .get<string>("defaultPermissionMode", "standard") as
      | "standard"
      | "plan"
      | "auto-accept") ?? "standard",
  );

  vscode.tasks.registerTaskProvider("cmd-lite", {
    provideTasks: () => [defineHeadlessTask()],
    resolveTask: () => undefined,
  });

  context.subscriptions.push({
    dispose: () => {
      statusBar.hide();
      Logger.dispose();
    },
  });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("cmd-lite.cliPath")) {
        clearCliPathCache();
        validateAndCheckCli(context);
      }
      if (e.affectsConfiguration("cmd-lite.showStatusBar")) {
        if (showStatusBarEnabled()) statusBar.show();
        else statusBar.hide();
      }
      if (e.affectsConfiguration("cmd-lite.defaultModel")) {
        chatProvider.updateModelsLabel();
        chatProvider.dispatchEvent({
          jsonrpc: "2.0",
          method: "webview/dispatchEvent",
          params: {
            type: "modelChanged",
            payload: {
              modelId: getEffectiveModel() ?? '',
              modelsLabel: chatProvider.getModelsLabel()
            }
          }
        });
      }
      if (e.affectsConfiguration("cmd-lite.defaultPermissionMode")) {
        chatProvider.dispatchEvent({
          jsonrpc: "2.0",
          method: "webview/dispatchEvent",
          params: {
            type: "permChanged",
            payload: { permissionMode: getEffectivePermissionMode() }
          }
        });
      }
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => pushCurrentContext(chatProvider)),
    vscode.workspace.onDidSaveTextDocument(() => pushCurrentContext(chatProvider)),
    vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document === vscode.window.activeTextEditor?.document) {
          void pushCurrentContext(chatProvider);
        }
      },
    ),
  );
}

export function deactivate(): void {
  if (session.currentSessionId && session.currentIdeName) {
    removeSessionFile(session.currentSessionId, session.currentIdeName);
  }
  session.ipcServer?.dispose();
  session.mcpServer?.stop();
  cleanupIntegration();
}
