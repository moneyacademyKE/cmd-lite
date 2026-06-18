import * as vscode from "vscode";
import type { DiagnosticEntry, FileDiagnostics } from "./protocol";

function severityToString(
  severity: vscode.DiagnosticSeverity,
): string {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error:
      return "error";
    case vscode.DiagnosticSeverity.Warning:
      return "warning";
    case vscode.DiagnosticSeverity.Information:
      return "information";
    case vscode.DiagnosticSeverity.Hint:
      return "hint";
    default:
      return "information";
  }
}

function diagnosticCodeToString(
  code: string | number | { value: string | number; target: vscode.Uri } | undefined,
): string | null {
  if (code === undefined || code === null) return null;
  if (typeof code === "object" && "value" in code) return String(code.value);
  return String(code);
}

function toDiagnosticEntry(d: vscode.Diagnostic): DiagnosticEntry {
  return {
    range: {
      startLine: d.range.start.line + 1,
      startCol: d.range.start.character + 1,
      endLine: d.range.end.line + 1,
      endCol: d.range.end.character + 1,
    },
    message: d.message,
    severity: severityToString(d.severity),
    source: d.source ?? null,
    code: diagnosticCodeToString(d.code),
  };
}

function getRelativePath(absolutePath: string): string {
  const root =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) return absolutePath;
  return absolutePath.startsWith(root)
    ? absolutePath.slice(root.length + 1)
    : absolutePath;
}

export function collectDiagnostics(
  filePaths?: string[],
): FileDiagnostics[] {
  if (filePaths && filePaths.length === 0) return [];

  let raw: [vscode.Uri, readonly vscode.Diagnostic[]][];
  if (filePaths) {
    raw = filePaths.map((fp) => {
      const uri = vscode.Uri.file(fp);
      return [uri, vscode.languages.getDiagnostics(uri)] as const;
    });
  } else {
    raw = vscode.languages.getDiagnostics();
  }

  return raw
    .filter(([uri, diags]) => uri.scheme === "file" && diags.length > 0)
    .map(([fileUri, diags]) => ({
      file: fileUri.fsPath,
      relativePath: getRelativePath(fileUri.fsPath),
      diagnostics: diags.map(toDiagnosticEntry),
    }));
}
