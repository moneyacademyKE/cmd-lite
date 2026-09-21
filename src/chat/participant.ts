import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { runPrint } from "../cli/commands";
import type { PermissionMode } from "../cli/types";
import { getActiveCwd, getEffectivePermissionMode, getEffectiveModel, getEffectiveMaxTurns } from "../config";
import { markdownFromCli } from "./format";
import { hasCodeProposal, StreamingDiffManager, setCurrentDiffManager } from "../diff/preview";

import { readSessionState, writeSessionState, type ParticipantState } from "../cli/store";
import { SessionManager } from "../sessionManager";
import { collectDiagnostics } from "../context/diagnostics";
import type { DiagnosticEntry } from "../context/protocol";

const session = SessionManager.getInstance();

export function registerChatParticipant(context: vscode.ExtensionContext): void {
  loadPersistedState();

  const participant = vscode.chat.createChatParticipant(
    "cmd-lite.chat",
    async (
      request: vscode.ChatRequest,
      _chatContext: vscode.ChatContext,
      stream: vscode.ChatResponseStream,
      token: vscode.CancellationToken,
    ) => {
      const state = readState();
      const command = request.command;
      const prompt = buildPrompt(request, state, command);
      const isPlanMode = state.planMode || command === "plan";

      stream.progress(`Running cmd -p ${summarize(prompt)}…`);

      // Create streaming diff manager for plan mode
      const diffManager = new StreamingDiffManager();
      setCurrentDiffManager(diffManager);

      try {
        const abortController = new AbortController();
        token.onCancellationRequested(() => abortController.abort());

        const result = await runPrint(prompt, {
          cwd: getActiveCwd(),
          model: state.model ?? getEffectiveModel(),
          maxTurns: getEffectiveMaxTurns(),
          permissionMode: state.permissionMode ?? getEffectivePermissionMode(),
          plan: isPlanMode,
          onStdoutChunk: (chunk: string) => {
            stream.markdown(markdownFromCli(chunk));
            if (isPlanMode) {
              diffManager.feed(chunk);
            }
          },
          timeoutMs: 0,
        });
        abortController.abort();

        if (result.timedOut) {
          stream.markdown("\n\n_(Command Code was cancelled.)_\n");
        }

        if (result.exitCode !== 0 && result.stderr.trim()) {
          stream.markdown(
            `\n\n<details><summary>stderr (exit ${result.exitCode})</summary>\n\n\`\`\`\n${escape(result.stderr.trim())}\n\`\`\`\n</details>\n`,
          );
        }

        if (diffManager.hasBlocks()) {
          stream.button({
            command: "cmd-lite.diff.acceptAll",
            title: "✅ Accept All",
          });
          stream.button({
            command: "cmd-lite.diff.rejectAll",
            title: "❌ Reject All",
          });
        } else if (hasCodeProposal(result.stdout)) {
          stream.button({
            command: "cmd-lite.diff.show",
            title: "📊 Show Diff",
            arguments: [result.stdout],
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        stream.markdown(`\n\n**Error:** ${escape(message)}\n`);
        setCurrentDiffManager(null);
      }

      updateState(state);
      persistState();
      return { metadata: { command, planMode: state.planMode } } satisfies vscode.ChatResult;
    },
  );

  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, "assets", "icon.png");
  participant.followupProvider = {
    provideFollowups(
      result: vscode.ChatResult,
      _context: vscode.ChatContext,
      _token: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.ChatFollowup[]> {
      const metadata = result.metadata as { command?: string; planMode?: boolean } | undefined;
      if (metadata?.command === "plan" || metadata?.planMode) {
        return [
          { prompt: "Start implementing the plan", label: "Implement" },
          { prompt: "Refine the plan with more detail", label: "Refine" },
          { prompt: "Split the plan into smaller steps", label: "Split" },
        ];
      }
      if (metadata?.command === "review") {
        return [
          { prompt: "Apply the suggested fix", label: "Apply fix" },
          { prompt: "Explain the issue in more detail", label: "Explain more" },
          { prompt: "Check for similar issues elsewhere", label: "Check elsewhere" },
        ];
      }
      if (metadata?.command === "taste") {
        return [
          { prompt: "Apply the taste to the current file", label: "Apply taste" },
          { prompt: "Show me the raw taste file", label: "Show taste" },
          { prompt: "Learn more taste from other repositories", label: "Learn more" },
        ];
      }
      if (metadata?.command === "design") {
        return [
          { prompt: "Enhance visual animations and contrast", label: "Polish animations" },
          { prompt: "Audit accessibility and semantic HTML", label: "Audit a11y" },
          { prompt: "Apply responsive mobile breakpoints", label: "Mobile layouts" },
        ];
      }
      if (metadata?.command === "fix") {
        return [
          { prompt: "Verify fixes by running build", label: "Run build" },
          { prompt: "Check for any remaining warnings", label: "Check warnings" },
          { prompt: "Run the test suite", label: "Run tests" },
        ];
      }
      return [
        { prompt: "Show me the taste learned so far", label: "Show taste" },
        { prompt: "Plan the next change", label: "Plan next" },
        { prompt: "Run the test suite", label: "Run tests" },
      ];
    },
  };

  context.subscriptions.push(participant);
}

function readState(): ParticipantState {
  const stored = session.currentSessionState;
  return stored ?? { permissionMode: "standard", model: undefined, planMode: false, agentMode: "code" };
}

function updateState(next: ParticipantState): void {
  session.currentSessionState = next;
}

function persistState(): void {
  if (session.currentSessionState) {
    writeSessionState(session.currentSessionState);
  }
}

function loadPersistedState(): void {
  const stored = readSessionState();
  if (stored) {
    session.currentSessionState = stored;
  }
}

export function setParticipantPermissionMode(mode: PermissionMode): void {
  const state = readState();
  session.currentSessionState = { ...state, permissionMode: mode, planMode: mode === "plan" };
  persistState();
}

export function setParticipantModel(model: string | undefined): void {
  const state = readState();
  session.currentSessionState = { ...state, model };
  persistState();
}

export function getParticipantModel(): string | undefined {
  return readState().model;
}

export function setParticipantAgentMode(agentMode: ParticipantState["agentMode"]): void {
  const state = readState();
  session.currentSessionState = { ...state, agentMode, planMode: agentMode === "plan" ? true : state.planMode };
  persistState();
}

export function getParticipantAgentMode(): ParticipantState["agentMode"] {
  return readState().agentMode;
}

function buildPrompt(
  request: vscode.ChatRequest,
  state: ParticipantState,
  command: string | undefined,
): string {
  const prefix: string[] = [];
  if (command === "plan") {
    prefix.push("Use plan mode. Do not modify files. Output a concrete plan.");
  }
  if (command === "review") {
    prefix.push("Review the current changes (or specified PR). Be specific and actionable.");
  }
  if (command === "taste") {
    prefix.push("Summarize and apply the project's learned taste from .commandcode/taste/.");
  }
  if (command === "learn") {
    prefix.push("Run `cmd taste learn .` to learn taste from the current repository, then summarize what was learned.");
  }
  if (command === "design") {
    prefix.push('Act as an expert frontend UI/UX designer. Create a "Thin Glass", visually stunning and robust frontend design using modern web design best practices (vibrant colors, glassmorphism, dynamic micro-animations, semantic HTML). Prioritize visual excellence.');
  }
  if (command === "fix") {
    prefix.push(formatFixPrompt(request.prompt.trim()));
  }
  if (state.planMode && command !== "plan") {
    prefix.push("Operate in plan mode: do not modify files, only propose.");
  }
  if (state.agentMode === "ask") {
    prefix.push("Answer questions about the codebase without modifying files.");
  }
  if (state.agentMode === "debug") {
    prefix.push("Prioritize debugging, root cause analysis, reproduction, and verification.");
  }
  if (state.agentMode === "review") {
    prefix.push("Operate as a reviewer: inspect risks, regressions, and missing tests before proposing changes.");
  }
  const userText = request.prompt.trim();
  const refs = formatReferences(request.references);
  const pieces = [...prefix];
  if (refs) pieces.push(refs);
  if (userText && command !== "fix") pieces.push(userText);
  return pieces.join("\n\n").trim();
}

function formatFixPrompt(extraInstruction: string): string {
  const EXCLUDED_PATTERNS = [/node_modules/i, /\.git/i, /dist/i, /build/i, /\.svelte-kit/i, /\.next/i, /\.nuxt/i];
  const fileDiags = collectDiagnostics();
  const filteredDiags = fileDiags
    .filter(fd => !EXCLUDED_PATTERNS.some(pattern => pattern.test(fd.file)))
    .map(fd => ({
      ...fd,
      diagnostics: fd.diagnostics.filter(d => d.severity === "error" || d.severity === "warning"),
    }))
    .filter(fd => fd.diagnostics.length > 0);

  const allDiagnostics: { file: string; relativePath: string; diag: DiagnosticEntry }[] = [];
  for (const fd of filteredDiags) {
    for (const d of fd.diagnostics) {
      allDiagnostics.push({ file: fd.file, relativePath: fd.relativePath, diag: d });
    }
  }

  allDiagnostics.sort((a, b) => (a.diag.severity === "error" ? 0 : 1) - (b.diag.severity === "error" ? 0 : 1));
  const MAX_DIAGNOSTICS = 30;
  const cappedDiagnostics = allDiagnostics.slice(0, MAX_DIAGNOSTICS);

  if (cappedDiagnostics.length === 0) {
    return extraInstruction
      ? `No compilation errors or warnings found in the active workspace. Instruction: ${extraInstruction}`
      : "No compilation errors or warnings found in the active workspace.";
  }

  let formatted = "Please resolve the compilation diagnostics (errors and warnings) in the active workspace.";
  if (extraInstruction) formatted += `\nAdditional instruction: "${extraInstruction}"`;
  formatted += "\n\nDiagnostics found:";

  const fileGroups: Record<string, { relativePath: string; diagnostics: DiagnosticEntry[] }> = {};
  for (const item of cappedDiagnostics) {
    if (!fileGroups[item.file]) fileGroups[item.file] = { relativePath: item.relativePath, diagnostics: [] };
    fileGroups[item.file].diagnostics.push(item.diag);
  }

  for (const [file, group] of Object.entries(fileGroups)) {
    formatted += `\n\nFile: ${group.relativePath || file}`;
    for (const d of group.diagnostics) {
      const severity = d.severity.toUpperCase();
      formatted += `\n- Line ${d.range.startLine}, Col ${d.range.startCol}: [${severity}] ${d.message}${d.source ? ` [${d.source}]` : ""}${d.code ? ` (${d.code})` : ""}`;
    }
  }

  if (allDiagnostics.length > MAX_DIAGNOSTICS) {
    formatted += `\n\n*Note: Showing first ${MAX_DIAGNOSTICS} out of ${allDiagnostics.length} diagnostics in the workspace.*`;
  }
  return formatted;
}

function formatReferences(refs: readonly vscode.ChatPromptReference[]): string {
  if (!refs || refs.length === 0) return "";
  const lines: string[] = [];
  for (const ref of refs) {
    const id = ref.id;
    const value = ref.value;
    if (value instanceof vscode.Uri) {
      try {
        const maxLen = vscode.workspace
          .getConfiguration("cmd-lite")
          .get<number>("context.maxSelectionLength", 10000);
        const content = fs.readFileSync(value.fsPath, "utf-8").slice(0, maxLen);
        const ext = path.extname(value.fsPath).slice(1);
        lines.push(`File: ${value.fsPath}\n\`\`\`${ext}\n${content}\n\`\`\``);
      } catch {
        lines.push(`Reference: ${value.fsPath} (id: ${id})`);
      }
    } else if (typeof value === "string") {
      lines.push(`Reference: ${value} (id: ${id})`);
    }
  }
  return lines.join("\n");
}

function escape(input: string): string {
  return input.replace(/`/g, "\\`");
}

function summarize(input: string): string {
  const collapsed = input.replace(/\s+/g, " ").trim();
  return collapsed.length > 80 ? collapsed.slice(0, 77) + "…" : collapsed;
}
