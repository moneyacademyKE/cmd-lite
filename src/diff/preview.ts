import * as vscode from "vscode";
import { stripAnsi } from "../chat/format";

interface CodeBlock {
  language?: string;
  filePath?: string;
  content: string;
  startLine: number;
  endLine: number;
}

export function parseCodeBlocks(output: string): CodeBlock[] {
  const clean = stripAnsi(output);
  const blocks: CodeBlock[] = [];
  const lines = clean.split(/\r?\n/);
  let inBlock = false;
  let blockContent = "";
  let blockLang = "";
  let blockFilePath: string | undefined;
  let blockStart = 0;
  let blockEnd = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = /^```(\w+)?/.exec(line);
    if (fenceMatch && !inBlock) {
      inBlock = true;
      blockLang = fenceMatch[1] ?? "";
      blockContent = "";
      blockFilePath = undefined;
      blockStart = i + 1;
      continue;
    }
    if (line === "```" && inBlock) {
      blockEnd = i;
      if (blockContent.trim()) {
        const fp = blockFilePath ?? detectFilePath(blockContent, blockLang);
        blocks.push({
          language: blockLang || undefined,
          filePath: fp,
          content: blockContent.replace(/\n$/, ""),
          startLine: blockStart,
          endLine: blockEnd,
        });
      }
      inBlock = false;
      continue;
    }
    if (inBlock) {
      blockContent += line + "\n";
      if (!blockFilePath) {
        const fpMatch = /\/\/\s*File:\s*(.+?)(?:\n|$)/.exec(line);
        if (fpMatch) blockFilePath = fpMatch[1];
        const commentMatch = /#\s*File:\s*(.+?)(?:\n|$)/.exec(line);
        if (commentMatch) blockFilePath = commentMatch[1];
      }
    }
  }

  return blocks;
}

function detectFilePath(_content: string, _language: string): string | undefined {
  return undefined;
}

export async function showDiff(
  originalUri: vscode.Uri,
  modifiedContent: string,
  title: string,
): Promise<void> {
  const originalContent = await readFileContent(originalUri);

  const originalDoc = await vscode.workspace.openTextDocument({
    content: originalContent,
    language: "plaintext",
  });
  const modifiedDoc = await vscode.workspace.openTextDocument({
    content: modifiedContent,
    language: "plaintext",
  });

  await vscode.commands.executeCommand(
    "vscode.diff",
    originalDoc.uri,
    modifiedDoc.uri,
    `${title} (${originalUri.fsPath})`,
  );
}

export async function showInlineDiff(
  filePath: string,
  newContent: string,
  title: string,
): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  try {
    await showDiff(uri, newContent, title);
  } catch {
    const originalContent = "";
    const originalDoc = await vscode.workspace.openTextDocument({
      content: originalContent,
      language: "plaintext",
    });
    const modifiedDoc = await vscode.workspace.openTextDocument({
      content: newContent,
      language: "plaintext",
    });
    await vscode.commands.executeCommand(
      "vscode.diff",
      originalDoc.uri,
      modifiedDoc.uri,
      `${title} (${filePath})`,
    );
  }
}

async function readFileContent(uri: vscode.Uri): Promise<string> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

export function hasCodeProposal(output: string): boolean {
  const blocks = parseCodeBlocks(output);
  return blocks.length > 0;
}

export function extractFirstDiffFile(
  output: string,
): { filePath: string; content: string } | null {
  const blocks = parseCodeBlocks(output);
  if (blocks.length === 0) return null;

  const b = blocks[0];
  if (!b.filePath) return null;

  return { filePath: b.filePath, content: b.content };
}
