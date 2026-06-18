import * as vscode from "vscode";
import { resolveCliPath } from "../cli/resolve";
import { buildSessionArgs } from "../cli/commands";
import type { StartSessionOptions } from "../cli/commands";
import { PermissionGate, type PermissionRequest, type PermissionChoice } from "./gate";

export async function startInteractiveSession(
  extensionUri: vscode.Uri,
  options: StartSessionOptions,
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();

  const permissionRequest: PermissionRequest = {
    action: options.prompt
      ? `Run: cmd ${options.prompt.length > 80 ? options.prompt.slice(0, 77) + "…" : options.prompt}`
      : "Start Command Code interactive session",
    description: options.trust
      ? "Starting in trusted mode — all permissions auto-granted for this session."
      : "This will start a Command Code session. The AI agent may read files, run commands, and modify code.",
    filePaths: options.addDirs?.length ? options.addDirs : undefined,
    category: "shell",
  };

  if (options.trust || options.autoAccept || options.yolo) {
    launchTerminal(cwd, options);
    return;
  }

  const gate = new PermissionGate(extensionUri, [permissionRequest]);
  const choice = await gate.waitForChoice();

  if (choice === "deny-once" || choice === "deny-always") {
    vscode.window.showInformationMessage(
      "Command Code: Session cancelled by user.",
    );
    return;
  }

  if (choice === "allow-always") {
    options.trust = true;
  }

  gate.dispose();
  launchTerminal(cwd, options);
}

export async function runWithPermissionGate(
  extensionUri: vscode.Uri,
  action: string,
  description: string,
  category: PermissionRequest["category"],
  filePaths?: string[],
): Promise<PermissionChoice> {
  const gate = new PermissionGate(extensionUri, [
    { action, description, filePaths, category },
  ]);
  const choice = await gate.waitForChoice();
  gate.dispose();
  return choice;
}

function launchTerminal(cwd: string, options: StartSessionOptions): void {
  const cliPath = resolveCliPath();
  const args = buildSessionArgs(options);
  const terminal = vscode.window.createTerminal({
    name: "Command Code",
    cwd,
  });
  terminal.sendText([cliPath, ...args].join(" "));
  terminal.show();
}
