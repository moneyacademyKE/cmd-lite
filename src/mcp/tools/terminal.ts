import * as cp from "node:child_process";
import * as vscode from "vscode";
import { getActiveCwd } from "../../config";
import type { McpTool } from "../server";

export const terminalTool: McpTool = {
  name: "vscode_execute_terminal",
  description:
    "Execute a shell command in the VS Code workspace and return the output. Use this for running tests, linters, or build scripts.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute.",
      },
      cwd: {
        type: "string",
        description:
          "Optional working directory. Defaults to the active workspace folder.",
      },
    },
    required: ["command"],
  },
  execute: async (args: Record<string, unknown>) => {
    const command = args.command as string;
    const cwd = (args.cwd as string) || getActiveCwd();

    // Log to output channel so the user sees it
    const outputChannel = vscode.window.createOutputChannel("Command Code");
    outputChannel.appendLine(`[MCP Terminal] $ ${command}`);
    outputChannel.show(true);

    return new Promise((resolve) => {
      cp.exec(command, { cwd, maxBuffer: 1024 * 1024 * 5 }, (error: cp.ExecException | null, stdout: string, stderr: string) => {
        if (stdout) outputChannel.appendLine(stdout);
        if (stderr) outputChannel.appendLine(`[Error Output]:\n${stderr}`);
        if (error) outputChannel.appendLine(`[Process Error]:\n${error.message}`);

        resolve({
          content: [
            {
              type: "text",
              text: `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}\n\nEXIT CODE: ${
                error ? error.code || 1 : 0
              }`,
            },
          ],
        });
      });
    });
  },
};
