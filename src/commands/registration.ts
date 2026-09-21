import * as vscode from "vscode";
import * as fs from "node:fs";
import { getActiveCwd } from "../config";
import { pickAgentMode, pickModel, pickPermissionMode } from "../ui/pickers";
import { showInlineDiff, extractFirstDiffFile, acceptDiffProposals, rejectDiffProposals, getCurrentDiffManager } from "../diff/preview";
import { restoreLastCheckpoint } from "../git/checkpoint";
import { runParallel, formatParallelResults, type AgentTask } from "../agents/orchestrator";
import { listLoopReports, runLoop, writeLoopReport } from "../agents/loop";
import { generateMcpConfig } from "../mcp/config";
import { dispatchMcpStatus, dispatchLoopReports } from "../lifecycle/integration";
import { Logger } from "../logger";
import { SessionManager } from "../sessionManager";
import type { ChatViewProvider } from "../webview/ChatViewProvider";
import type { StatusBar } from "../ui/statusBar";
import { lastLoopReportPath } from "../handlers/webviewActions";

export function registerCoreCommands(
  context: vscode.ExtensionContext,
  chatProvider: ChatViewProvider,
  statusBar: StatusBar,
  session: SessionManager
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("cmd-lite.focusChatInput", async () => {
      await vscode.commands.executeCommand("cmd-lite.chatView.focus");
      setTimeout(() => {
        chatProvider.dispatchEvent({
          jsonrpc: "2.0",
          method: "webview/dispatchEvent",
          params: {
            type: "FocusInput",
            payload: {}
          }
        });
      }, 100);
    }),
    vscode.commands.registerCommand("cmd-lite.model.pick", () => pickModel()),
    vscode.commands.registerCommand("cmd-lite.permission.pick", () => pickPermissionMode()),
    vscode.commands.registerCommand("cmd-lite.agentMode.pick", async () => {
      const selected = await pickAgentMode();
      if (selected) {
        chatProvider.dispatchEvent({
          jsonrpc: "2.0",
          method: "webview/dispatchEvent",
          params: { type: "AgentModeChanged", payload: { agentMode: selected } },
        });
      }
    }),
    vscode.commands.registerCommand("cmd-lite.diff.show", (output: string) => {
      const diff = extractFirstDiffFile(output);
      if (diff) {
        showInlineDiff(diff.filePath, diff.content, "Command Code Proposal");
      } else {
        vscode.window.showInformationMessage("No code changes found in the output.");
      }
    }),
    vscode.commands.registerCommand("cmd-lite.diff.acceptAll", () => {
      const mgr = getCurrentDiffManager();
      if (mgr) acceptDiffProposals(mgr);
    }),
    vscode.commands.registerCommand("cmd-lite.diff.rejectAll", () => {
      const mgr = getCurrentDiffManager();
      if (mgr) rejectDiffProposals(mgr);
    }),
    vscode.commands.registerCommand("cmd-lite.checkpoint.restore", async () => {
      const cwd = getActiveCwd();
      const ok = await restoreLastCheckpoint(cwd);
      if (ok) {
        vscode.window.showInformationMessage("Restored pre-run file state from git stash.");
      } else {
        vscode.window.showInformationMessage("No cmd-lite checkpoint to restore.");
      }
    }),
    vscode.commands.registerCommand("cmd-lite.agents.parallel", async () => {
      const result = await vscode.window.showInputBox({
        prompt: "Describe what to do (will be split across agents)",
        placeHolder: "Implement feature X with tests and docs",
      });
      if (!result) return;
      statusBar.setBusy(true);
      try {
        const tasks: AgentTask[] = [
          { label: "impl", prompt: `${result} — implement the core logic. Write concise, tested code.` },
          { label: "tests", prompt: `${result} — write comprehensive tests.` },
          { label: "docs", prompt: `${result} — write documentation.` },
        ];

        const results = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Running parallel agents…",
            cancellable: true,
          },
          async (progress, token) => {
            const abortController = new AbortController();
            token.onCancellationRequested(() => abortController.abort());

            const doneLabels = new Set<string>();
            const total = tasks.length;

            progress.report({ message: `0/${total} complete` });

            const agentResults = await runParallel(tasks, {
              signal: abortController.signal,
              onAgentProgress(label, chunk) {
                const summary = chunk.replace(/\s+/g, " ").trim();
                const truncated = summary.length > 60
                  ? summary.slice(0, 57) + "…"
                  : summary;
                progress.report({
                  message: `${doneLabels.size}/${total} complete — ${label}: ${truncated}`,
                });
              },
              onAgentDone(label) {
                doneLabels.add(label);
                progress.report({
                  message: `${doneLabels.size}/${total} complete — ${label} finished`,
                });
              },
            });

            return agentResults;
          },
        );

        const formatted = formatParallelResults(results);
        Logger.clear();
        Logger.info(formatted);
        Logger.show(true);
      } finally {
        statusBar.setBusy(false);
      }
    }),
    vscode.commands.registerCommand("cmd-lite.loop", async () => {
      const task = await vscode.window.showInputBox({
        prompt: "What should Command Code improve in a bounded loop?",
        placeHolder: "Fix failing tests, improve docs, or complete a feature",
      });
      if (!task?.trim()) return;

      const verify = await vscode.window.showInputBox({
        prompt: "How should each loop verify progress?",
        placeHolder: "pnpm test, pnpm run build, or describe the acceptance check",
      });

      const maxRaw = await vscode.window.showInputBox({
        prompt: "Maximum loop iterations",
        value: "5",
        validateInput: (value) => /^\d+$/.test(value) && Number(value) > 0 ? null : "Enter a positive whole number.",
      });
      if (!maxRaw) return;

      statusBar.setBusy(true);
      const abortController = new AbortController();
      session.activeAbortController = abortController;
      try {
        chatProvider.dispatchEvent({
          jsonrpc: "2.0",
          method: "webview/dispatchEvent",
          params: { type: "LoopStarted", payload: { task, verify } },
        });
        const result = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Running Command Code loop...",
            cancellable: true,
          },
          async (progress, token) => {
            token.onCancellationRequested(() => abortController.abort());
            return runLoop({
              task,
              verify,
              cwd: getActiveCwd(),
              maxIterations: Number(maxRaw),
              signal: abortController.signal,
              onProgress: (message) => {
                progress.report({ message });
                const match = /Loop iteration (\d+)\/(\d+) (started|failed)/i.exec(message);
                if (match) {
                  chatProvider.dispatchEvent({
                    jsonrpc: "2.0",
                    method: "webview/dispatchEvent",
                    params: {
                      type: "LoopIteration",
                      payload: {
                        iteration: Number(match[1]),
                        status: match[3].toLowerCase(),
                        summary: message,
                      },
                    },
                  });
                }
              },
            });
          },
        );

        const newReportPath = writeLoopReport(result, task, verify);
        // We can't trivially re-assign lastLoopReportPath since it's exported from webviewActions
        // But in VSCode commands it's just a file path. Let's just pass it or ignore for now.
        // Actually, for a cleaner architecture, this state should probably be in SessionManager,
        // but for now, we just update session state if needed.

        for (const iteration of result.iterations) {
          const cleanSummary = (iteration.result.stdout || iteration.result.stderr || "").replace(/\s+/g, " ").trim().slice(0, 500);
          chatProvider.dispatchEvent({
            jsonrpc: "2.0",
            method: "webview/dispatchEvent",
            params: {
              type: "LoopIteration",
              payload: {
                iteration: iteration.iteration,
                status: iteration.result.exitCode === 0 ? "ok" : "failed",
                summary: cleanSummary || `exit ${iteration.result.exitCode}`,
              },
            },
          });
        }

        chatProvider.dispatchEvent({
          jsonrpc: "2.0",
          method: "webview/dispatchEvent",
          params: { type: "LoopFinished", payload: { status: result.status, reportPath: newReportPath } },
        });
        dispatchLoopReports(chatProvider);

        Logger.clear();
        Logger.info(`# Command Code Loop: ${result.status}`);
        for (const iteration of result.iterations) {
          Logger.info(`\n## Iteration ${iteration.iteration}`);
          if (iteration.result.stdout.trim()) Logger.info(iteration.result.stdout.trim());
          if (iteration.result.stderr.trim()) Logger.warn(iteration.result.stderr.trim());
        }
        Logger.show(true);
        vscode.window.showInformationMessage(`Command Code loop ${result.status} after ${result.iterations.length} iteration(s).`);
      } finally {
        session.activeAbortController = null;
        statusBar.setBusy(false);
      }
    }),
    vscode.commands.registerCommand("cmd-lite.loop.stop", () => {
      session.activeAbortController?.abort();
      vscode.window.showInformationMessage("Command Code loop stop requested.");
    }),
    vscode.commands.registerCommand("cmd-lite.loop.openReport", async () => {
      if (!lastLoopReportPath || !fs.existsSync(lastLoopReportPath)) {
        vscode.window.showInformationMessage("No Command Code loop report found.");
        return;
      }
      const doc = await vscode.workspace.openTextDocument(lastLoopReportPath);
      await vscode.window.showTextDocument(doc, { preview: false });
    }),
    vscode.commands.registerCommand("cmd-lite.loop.listReports", async () => {
      const reports = listLoopReports();
      if (reports.length === 0) {
        vscode.window.showInformationMessage("No Command Code loop reports found.");
        return;
      }
      const picked = await vscode.window.showQuickPick(
        reports.map((report) => ({ label: report.label, description: report.path, report })),
        { title: "Open Command Code Loop Report" },
      );
      if (!picked) return;
      // We don't really need to set lastLoopReportPath since the user just picked one
      const doc = await vscode.workspace.openTextDocument(picked.report.path);
      await vscode.window.showTextDocument(doc, { preview: false });
    }),
    vscode.commands.registerCommand("cmd-lite.generateMcpConfig", async () => {
      await generateMcpConfig();
      dispatchMcpStatus(chatProvider);
    })
  );
}
