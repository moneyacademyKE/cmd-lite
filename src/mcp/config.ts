import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";

export async function generateMcpConfig(): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage("No workspace folder open. Open a folder to generate mcp.json.");
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  const config = {
    mcpServers: {
      "filesystem": {
        command: "npx",
        args: [
          "-y",
          "@modelcontextprotocol/server-filesystem",
          workspaceRoot
        ],
      },
      "fetch": {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-fetch"],
      },
      "puppeteer": {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-puppeteer"],
      },
      "playwright": {
        command: "npx",
        args: ["-y", "@playwright/mcp"],
      },
      "computer-use": {
        command: "npx",
        args: ["-y", "computer-use-mcp"],
      },
      "memory": {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-memory"],
      },
      "unstorage": {
        command: "npx",
        args: ["-y", "unstorage-mcp"],
      },
      "webhook": {
        command: "npx",
        args: ["-y", "mcp-webhook", "--port", "51934"],
      },
    },
  };

  const targetPath = path.join(workspaceRoot, "mcp.json");
  
  try {
    fs.writeFileSync(targetPath, JSON.stringify(config, null, 2), "utf8");
    vscode.window.showInformationMessage(`Successfully generated mcp.json at ${targetPath}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to generate mcp.json: ${msg}`);
  }
}
