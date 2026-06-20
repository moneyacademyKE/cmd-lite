import * as cp from "node:child_process";
import { getActiveCwd } from "../../config";
import type { McpTool } from "../server";
import { Logger } from "../../logger";

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
    Logger.info(`[MCP Terminal] $ ${command}`);
    Logger.show(true);

    return new Promise((resolve) => {
      const child = cp.spawn(command, [], { cwd, shell: true });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        const str = chunk.toString("utf8");
        stdout += str;
        Logger.info(str);
      });
      child.stderr.on("data", (chunk) => {
        const str = chunk.toString("utf8");
        stderr += str;
        Logger.error(str);
      });
      child.on("error", (error) => {
        Logger.error(`[Process Error]:\n${error.message}`);
        resolve({
          content: [
            {
              type: "text",
              text: `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}\n\nEXIT CODE: 1\n\nERROR:\n${error.message}`,
            },
          ],
        });
      });
      child.on("close", (code) => {
        resolve({
          content: [
            {
              type: "text",
              text: `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}\n\nEXIT CODE: ${code ?? 0}`,
            },
          ],
        });
      });
    });
  },
};
