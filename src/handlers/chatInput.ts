import { spawn } from "node:child_process";
import { getActiveCwd, getEffectiveModel, getEffectiveMaxTurns, getEffectivePermissionMode, shellToolEnabled } from "../config";
import { runPrint } from "../cli/commands";
import { collectDiagnostics } from "../context/diagnostics";
import { incrementTurnCount } from "../webview/ChatViewProvider";
import { SessionManager } from "../sessionManager";
import { Logger } from "../logger";
import type { ChatViewProvider } from "../webview/ChatViewProvider";
import type { DiagnosticEntry } from "../context/protocol";

export async function handleChatInput(
  input: { payload: { prompt: string; isBash?: boolean; plan?: boolean } },
  chatProvider: ChatViewProvider,
  session: SessionManager
): Promise<void> {
  let prompt = input.payload?.prompt;
  if (!prompt) return;

  if (prompt.trim() === "/fix" || prompt.trim().startsWith("/fix ")) {
    const extraInstruction = prompt.trim().slice(4).trim();
    const EXCLUDED_PATTERNS = [/node_modules/i, /\.git/i, /dist/i, /build/i, /\.svelte-kit/i, /\.next/i, /\.nuxt/i];
    
    const fileDiags = collectDiagnostics();
    const filteredDiags = fileDiags.filter(fd => {
      const isExcluded = EXCLUDED_PATTERNS.some(pattern => pattern.test(fd.file));
      return !isExcluded;
    }).map(fd => ({
      ...fd,
      diagnostics: fd.diagnostics.filter(d => d.severity === "error" || d.severity === "warning")
    })).filter(fd => fd.diagnostics.length > 0);
    
    const allDiagnostics: { file: string; relativePath: string; diag: DiagnosticEntry }[] = [];
    for (const fd of filteredDiags) {
      for (const d of fd.diagnostics) {
        allDiagnostics.push({ file: fd.file, relativePath: fd.relativePath, diag: d });
      }
    }
    
    allDiagnostics.sort((a, b) => (a.diag.severity === "error" ? 0 : 1) - (b.diag.severity === "error" ? 0 : 1));
    
    const MAX_DIAGNOSTICS = 30;
    const cappedDiagnostics = allDiagnostics.slice(0, MAX_DIAGNOSTICS);
    const totalCollected = allDiagnostics.length;
    
    if (cappedDiagnostics.length === 0) {
      const msgId = `fix-info-${Date.now()}`;
      chatProvider.dispatchEvent({ jsonrpc: "2.0", method: "webview/dispatchEvent", params: { type: "StreamMessageChunk", payload: { id: msgId, role: "system", chunk: `No compilation errors or warnings found in the active workspace.` } } });
      chatProvider.dispatchEvent({ jsonrpc: "2.0", method: "webview/dispatchEvent", params: { type: "StreamFinished", payload: { id: msgId } } });
      return;
    }
    
    let formattedPrompt = `Please resolve the compilation diagnostics (errors and warnings) in the active workspace.`;
    if (extraInstruction) formattedPrompt += `\nAdditional instruction: "${extraInstruction}"`;
    formattedPrompt += `\n\nDiagnostics found:`;
    
    const fileGroups: Record<string, { relativePath: string; diagnostics: DiagnosticEntry[] }> = {};
    for (const item of cappedDiagnostics) {
      if (!fileGroups[item.file]) fileGroups[item.file] = { relativePath: item.relativePath, diagnostics: [] };
      fileGroups[item.file].diagnostics.push(item.diag);
    }
    
    for (const [file, group] of Object.entries(fileGroups)) {
      formattedPrompt += `\n\nFile: ${group.relativePath || file}`;
      for (const d of group.diagnostics) {
        const severity = d.severity.toUpperCase();
        formattedPrompt += `\n- Line ${d.range.startLine}, Col ${d.range.startCol}: [${severity}] ${d.message}${d.source ? ` [${d.source}]` : ""}${d.code ? ` (${d.code})` : ""}`;
      }
    }
    
    if (totalCollected > MAX_DIAGNOSTICS) formattedPrompt += `\n\n*Note: Showing first ${MAX_DIAGNOSTICS} out of ${totalCollected} diagnostics in the workspace.*`;
    prompt = formattedPrompt;
  }

  if (prompt.trim() === "/design" || prompt.trim().startsWith("/design ")) {
    const extraInstruction = prompt.trim().slice(7).trim();
    prompt = `Act as an expert frontend UI/UX designer. You are creating a "Thin Glass", visually stunning and robust frontend design. Use best practices in modern web design (vibrant colors, glassmorphism, dynamic micro-animations, semantic HTML). Prioritize visual excellence.\n\nUser request: ${extraInstruction || "Improve the design and aesthetics of the current view."}`;
  }

  if (input.payload?.isBash) {
    if (!shellToolEnabled()) {
      chatProvider.dispatchEvent({ jsonrpc: "2.0", method: "webview/dispatchEvent", params: { type: "RenderMessage", payload: { id: `bash-disabled-${Date.now()}`, role: "system", content: "Shell execution is disabled. Enable `cmd-lite.allowShellTool` only for trusted workspaces/sessions." } } });
      return;
    }
    Logger.info(`[webview] bash command received: ${prompt}`);
    const msgId = `bash-${Date.now()}`;
    chatProvider.dispatchEvent({ jsonrpc: "2.0", method: "webview/dispatchEvent", params: { type: "StreamMessageChunk", payload: { id: msgId, role: "system", chunk: `> ${prompt}\n` } } });
    const child = spawn(prompt, [], { cwd: getActiveCwd(), shell: true });
    child.stdout.on("data", (chunk) => chatProvider.dispatchEvent({ jsonrpc: "2.0", method: "webview/dispatchEvent", params: { type: "StreamMessageChunk", payload: { id: msgId, role: "system", chunk: chunk.toString() } } }));
    child.stderr.on("data", (chunk) => chatProvider.dispatchEvent({ jsonrpc: "2.0", method: "webview/dispatchEvent", params: { type: "StreamMessageChunk", payload: { id: msgId, role: "system", chunk: chunk.toString() } } }));
    child.on("close", (code) => {
      chatProvider.dispatchEvent({ jsonrpc: "2.0", method: "webview/dispatchEvent", params: { type: "StreamMessageChunk", payload: { id: msgId, role: "system", chunk: `\n[Process completed with exit code ${code}]` } } });
      chatProvider.dispatchEvent({ jsonrpc: "2.0", method: "webview/dispatchEvent", params: { type: "StreamFinished", payload: { id: msgId } } });
    });
    return;
  }

  Logger.info(`[webview] chatInput received: ${prompt.slice(0, 80)}`);
  let streamedAny = false;
  const msgId = `agent-${Date.now()}`;

  const turnCount = incrementTurnCount();
  if (session.currentSessionId) chatProvider.dispatchSessionInfo(session.currentSessionId, turnCount);

  session.activeAbortController = new AbortController();
  try {
    const result = await runPrint(prompt, {
      cwd: getActiveCwd(),
      model: getEffectiveModel(),
      maxTurns: getEffectiveMaxTurns(),
      permissionMode: getEffectivePermissionMode(),
      plan: input.payload?.plan,
      onStdoutChunk: (chunk: string) => {
        streamedAny = true;
        chatProvider.dispatchEvent({ jsonrpc: "2.0", method: "webview/dispatchEvent", params: { type: "StreamMessageChunk", payload: { id: msgId, role: "agent", chunk: chunk } } });
      },
      timeoutMs: 5 * 60 * 1000,
      signal: session.activeAbortController.signal,
    });

    Logger.info(`[webview] runPrint done: exit=${result.exitCode}, stdout=${result.stdout.length}b, streamed=${streamedAny}`);

    if (!streamedAny && result.stdout.trim()) {
      chatProvider.dispatchEvent({ jsonrpc: "2.0", method: "webview/dispatchEvent", params: { type: "RenderMessage", payload: { id: msgId, role: "agent", content: result.stdout } } });
    }

    if (result.timedOut) {
      chatProvider.dispatchEvent({ jsonrpc: "2.0", method: "webview/dispatchEvent", params: { type: "RenderMessage", payload: { id: `error-${Date.now()}`, role: "system", content: "\n\n_(Command Code was cancelled.)_\n" } } });
    }

    if (result.exitCode !== 0 && result.stderr.trim()) {
      chatProvider.dispatchEvent({ jsonrpc: "2.0", method: "webview/dispatchEvent", params: { type: "RenderMessage", payload: { id: `error-${Date.now()}`, role: "system", content: `\n\n**Error (exit ${result.exitCode}):** ${result.stderr.trim()}\n` } } });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Logger.error(`[webview] runPrint error: ${message}`);
    chatProvider.dispatchEvent({ jsonrpc: "2.0", method: "webview/dispatchEvent", params: { type: "RenderMessage", payload: { id: `error-${Date.now()}`, role: "system", content: `\n\n**Error:** ${message}\n` } } });
  } finally {
    session.activeAbortController = null;
    chatProvider.dispatchEvent({ jsonrpc: "2.0", method: "webview/dispatchEvent", params: { type: "StreamFinished", payload: { id: msgId } } });
  }
}
