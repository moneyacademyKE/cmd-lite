import { runCli } from "../cli/spawn";
import type { CliResult } from "../cli/types";
import { getActiveCwd, getEffectiveModel, getEffectiveMaxTurns, getEffectivePermissionMode } from "../config";
import { stripAnsi } from "../chat/format";

export interface AgentTask {
  label: string;
  prompt: string;
  model?: string;
  planMode?: boolean;
}

export interface AgentResult {
  label: string;
  prompt: string;
  result: CliResult;
}

export interface OrchestraOptions {
  cwd?: string;
  defaultModel?: string;
  maxTurns?: number;
  permissionMode?: "standard" | "plan" | "auto-accept";
  planMode?: boolean;
  onAgentProgress?: (label: string, chunk: string) => void;
  onAgentDone?: (label: string) => void;
  signal?: AbortSignal;
}

export async function runParallel(
  tasks: AgentTask[],
  options: OrchestraOptions = {},
): Promise<AgentResult[]> {
  const cwd = options.cwd ?? getActiveCwd();
  const defaultModel = options.defaultModel ?? getEffectiveModel();
  const maxTurns = options.maxTurns ?? getEffectiveMaxTurns();
  const permissionMode = options.permissionMode ?? getEffectivePermissionMode();

  const promises = tasks.map(async (task) => {
    const args: string[] = ["-p", task.prompt];
    args.push("--max-turns", String(maxTurns));
    const model = task.model ?? defaultModel;
    if (model) args.push("-m", model);
    args.push("--permission-mode", permissionMode);
    if (task.planMode ?? options.planMode) args.push("--plan");

    const result = await runCli(args, {
      cwd,
      timeoutMs: 10 * 60 * 1000,
      signal: options.signal,
      onStdoutChunk: options.onAgentProgress
        ? (chunk: string) => options.onAgentProgress!(task.label, chunk)
        : undefined,
      onStderrChunk: options.onAgentProgress
        ? (chunk: string) => options.onAgentProgress!(task.label, `[stderr] ${chunk}`)
        : undefined,
    });

    options.onAgentDone?.(task.label);

    return {
      label: task.label,
      prompt: task.prompt,
      result,
    };
  });

  return Promise.all(promises);
}

export function formatParallelResults(
  results: AgentResult[],
): string {
  const parts: string[] = [];
  for (const r of results) {
    const cleanOutput = stripAnsi(r.result.stdout).trim();
    const cleanStderr = stripAnsi(r.result.stderr).trim();

    parts.push(`### ${r.label}`);
    if (cleanOutput) {
      parts.push(cleanOutput);
    }
    if (cleanStderr) {
      parts.push(`\n<details><summary>stderr (exit ${r.result.exitCode})</summary>\n\n\`\`\`\n${cleanStderr}\n\`\`\`\n</details>\n`);
    }
    parts.push("");
  }
  return parts.join("\n");
}
