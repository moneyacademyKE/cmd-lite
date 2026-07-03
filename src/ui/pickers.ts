import * as vscode from "vscode";
import { listModels } from "../cli/commands";
import type { PermissionMode } from "../cli/types";
import { getActiveCwd } from "../config";
import {
  getParticipantAgentMode,
  setParticipantModel,
  setParticipantAgentMode,
  setParticipantPermissionMode,
} from "../chat/participant";

export async function pickModel(): Promise<string | undefined> {
  const cwd = getActiveCwd();
  const models = await listModels(cwd);
  if (models.length === 0) {
    vscode.window.showWarningMessage(
      "Could not enumerate Command Code models. Run `cmd --list-models` in a terminal to verify.",
    );
    return;
  }
  const picks = models.map((m) => ({
    label: m.id,
    description: m.label ?? m.provider ?? "",
  }));
  const selected = await vscode.window.showQuickPick(picks, {
    title: "Pick a Command Code model",
    placeHolder: "Select a model",
  });
  if (selected) {
    setParticipantModel(selected.label);
    vscode.window.showInformationMessage(`Switched to ${selected.label}`);
  }
  return selected?.label;
}

export async function pickPermissionMode(): Promise<PermissionMode | undefined> {
  const options: { label: string; mode: PermissionMode; description: string }[] = [
    {
      label: "Standard",
      mode: "standard",
      description: "Ask before running tools and edits.",
    },
    {
      label: "Plan",
      mode: "plan",
      description: "Plan first; do not modify files until approved.",
    },
    {
      label: "Auto-Accept",
      mode: "auto-accept",
      description: "Run tools and apply edits without prompting.",
    },
  ];
  const picked = await vscode.window.showQuickPick(options, {
    title: "Pick permission mode",
    placeHolder: "How should Command Code handle tool use and edits?",
  });
  if (picked) {
    setParticipantPermissionMode(picked.mode);
    vscode.window.showInformationMessage(`Permission mode: ${picked.label}`);
  }
  return picked?.mode;
}

export async function pickAgentMode(): Promise<"code" | "plan" | "ask" | "debug" | "review" | undefined> {
  const current = getParticipantAgentMode();
  const options = [
    { label: "Code", mode: "code", description: current === "code" ? "Current" : "Implement and edit code." },
    { label: "Plan", mode: "plan", description: current === "plan" ? "Current" : "Design without editing first." },
    { label: "Ask", mode: "ask", description: current === "ask" ? "Current" : "Answer questions without changing files." },
    { label: "Debug", mode: "debug", description: current === "debug" ? "Current" : "Troubleshoot, reproduce, and verify." },
    { label: "Review", mode: "review", description: current === "review" ? "Current" : "Inspect risks and regressions first." },
  ] as const;

  const picked = await vscode.window.showQuickPick(options, {
    title: "Pick agent mode",
    placeHolder: "Choose how Command Code should operate by default",
  });
  if (picked) {
    setParticipantAgentMode(picked.mode);
    vscode.window.showInformationMessage(`Agent mode: ${picked.label}`);
  }
  return picked?.mode;
}
