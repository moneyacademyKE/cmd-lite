import * as path from "node:path";
import * as vscode from "vscode";

/**
 * Get relative path from workspace root.
 */
export function getRelativePath(absolutePath: string): string {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return absolutePath;
  const root = folders[0].uri.fsPath;
  if (absolutePath.startsWith(root)) {
    return path.relative(root, absolutePath);
  }
  return absolutePath;
}
